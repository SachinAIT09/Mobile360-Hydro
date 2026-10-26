import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, LayersControl, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L, { type LatLngBoundsExpression, type Map as LeafletMap, type Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  BRAND,
  feederLengthKm,
  feederRoute,
  premisePoints,
  substationPosition,
  type FeederStat,
  type LatLng,
  type PremiseKind,
  type SubstationStat,
} from '@demo/shared';
import routesFile from '../data/feeder-routes.json';
import { PALETTE } from '../lib/theme';
import { useTheme } from '../lib/themeMode';
import { Icon } from './icons';
import './addons.css';

export interface RealMapProps {
  feeders: FeederStat[];
  selected: string | null;
  onSelect: (code: string) => void;
  substationCode: string;
  /** All substations, drawn as small context markers that switch the selection. */
  substations?: SubstationStat[];
  onSelectSubstation?: (code: string) => void;
  /** Called once when tiles keep failing (e.g. offline), so the parent can fall back to the schematic. */
  onTilesFailed: () => void;
}

/** Pre-generated street routes (scripts/gen-feeder-routes.mjs). Missing entries fall back to synthetic routes. */
interface RoutesFile {
  substations: Record<string, { at: [number, number]; feeders: Record<string, [number, number][]> }>;
}
const ROUTES = routesFile as unknown as RoutesFile;

const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const OSM_URL = (import.meta.env.VITE_MAP_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// "Dark" is OpenStreetMap tiles recoloured in CSS (.fm-light) to match the dark dashboard, so no API key is needed.
const BASEMAPS = [
  { name: 'Dark', url: OSM_URL, attribution: OSM_ATTR, className: 'fm-light' },
  { name: 'Streets', url: OSM_URL, attribution: OSM_ATTR, className: '' },
  {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    className: '',
  },
] as const;

type ColorBy = 'network' | 'forecast' | 'gap';
const FORECAST_ALERT_PCT = 90;
const DOT_FILL: Record<PremiseKind, string> = { known: PALETTE.known, unenrolled: PALETTE.unenrolled, unknown: PALETTE.unknown };
const DOT_LABEL: Record<PremiseKind, string> = { known: 'EV · enrolled in the program', unenrolled: 'EV detected · not enrolled', unknown: 'EV · split not in sample' };

const toLL = (p: LatLng): [number, number] => [p.lat, p.lng];
const fromLL = ([lat, lng]: [number, number]): LatLng => ({ lat, lng });

function shortCode(code: string, sub: string) {
  return code.startsWith(`${sub}-`) ? code.slice(sub.length + 1) : code;
}

function forecastColor(pct: number | null): string {
  if (pct === null) return PALETTE.unknown;
  if (pct >= FORECAST_ALERT_PCT) return PALETTE.danger;
  if (pct >= 70) return PALETTE.warn;
  return PALETTE.ok;
}

/** Blind-spot share → deep blue (low) to lavender (high), so the worst feeders stand out on the dark map. */
function gapColor(pct: number | null): string {
  if (pct === null) return PALETTE.unknown;
  const t = Math.min(1, Math.max(0, pct / 100));
  const [a, b] = [PALETTE.gapLow, PALETTE.gapHigh];
  const mix = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

function lineColor(f: FeederStat, colorBy: ColorBy): string {
  if (colorBy === 'forecast') return forecastColor(f.forecastLoadPct);
  if (colorBy === 'gap') return gapColor(f.invisiblePct);
  return PALETTE.route;
}

function chipHtml(f: FeederStat, label: string, selected: boolean, colorBy: ColorBy): string {
  const split = f.known !== null && f.evs > 0;
  const knownPct = split ? Math.round(((f.known ?? 0) / f.evs) * 100) : 0;
  const alert = (f.forecastLoadPct ?? 0) >= FORECAST_ALERT_PCT;
  const swatch = colorBy === 'network' ? '' : `<i class="fm-sw" style="background:${lineColor(f, colorBy)}"></i>`;
  return (
    `<div class="fm-chip${selected ? ' on' : ''}${alert ? ' alert' : ''}">` +
    `${swatch}<b>${label}</b><span>${f.evs} EVs</span>` +
    (split ? `<i class="fm-bar" title=""><i style="width:${knownPct}%"></i></i>` : '<i class="fm-bar na"></i>') +
    (alert ? `<em>${f.forecastLoadPct}%</em>` : '') +
    `</div>`
  );
}

function FitOnSubstation({ bounds, substationCode }: { bounds: LatLngBoundsExpression; substationCode: string }) {
  const map = useMap();
  const last = useRef<string | null>(null);
  useEffect(() => {
    // Refit only when the substation changes, so selecting a feeder doesn't move the view.
    if (last.current === substationCode) return;
    last.current = substationCode;
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
  }, [map, bounds, substationCode]);
  return null;
}

function ScaleBar() {
  const map = useMap();
  useEffect(() => {
    const c = L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
    return () => {
      c.remove();
    };
  }, [map]);
  return null;
}

/** Feeder label chip at the end of the route: a focusable button; Enter/Space select. */
function FeederChip({ f, position, html, ariaLabel, selected, tooltip, onSelect }: {
  f: FeederStat;
  position: [number, number];
  html: string;
  ariaLabel: string;
  selected: boolean;
  tooltip: string;
  onSelect: (code: string) => void;
}) {
  const ref = useRef<LeafletMarker | null>(null);
  const icon = useMemo(() => L.divIcon({ className: 'fm-icon', html, iconSize: undefined, iconAnchor: [-8, 14] }), [html]);
  useEffect(() => {
    const el = ref.current?.getElement();
    if (!el) return;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', ariaLabel);
    el.setAttribute('aria-pressed', String(selected));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onSelect(f.code);
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [ariaLabel, selected, icon, onSelect, f.code]);
  return (
    <Marker ref={ref} position={position} icon={icon} keyboard zIndexOffset={selected ? 1000 : 0} eventHandlers={{ click: () => onSelect(f.code) }}>
      <Tooltip direction="top" offset={[40, -16]} opacity={1} className="fm-tip">
        {tooltip}
      </Tooltip>
    </Marker>
  );
}

const SUB_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor"/></svg>';

/** Real basemap with feeders routed along actual streets; positions are illustrative. */
export default function RealMap({ feeders, selected, onSelect, substationCode, substations, onSelectSubstation, onTilesFailed }: RealMapProps) {
  const [colorBy, setColorBy] = useState<ColorBy>('network');
  const { theme } = useTheme();
  // Line casing matches the page surface; the light theme opens on the Streets basemap.
  const casing = theme === 'light' ? PALETTE.casingLight : PALETTE.casing;
  const initialBasemap = theme === 'light' ? 'Streets' : 'Dark';
  const [full, setFull] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);

  const layout = useMemo(() => {
    const stored = ROUTES.substations[substationCode];
    const origin = stored ? fromLL(stored.at) : substationPosition(substationCode);
    const items = feeders.map((f, i) => {
      const storedRoute = stored?.feeders[f.code];
      const route = storedRoute && storedRoute.length > 1 ? storedRoute.map(fromLL) : feederRoute(substationCode, f.code, i, feeders.length, feederLengthKm(f.premises, f.evs), origin);
      return { f, route, end: route[route.length - 1], dots: premisePoints(route, f.code, f.evs, f.known) };
    });
    const all = [origin, ...items.flatMap((it) => it.route)];
    const bounds: LatLngBoundsExpression = [
      [Math.min(...all.map((p) => p.lat)), Math.min(...all.map((p) => p.lng))],
      [Math.max(...all.map((p) => p.lat)), Math.max(...all.map((p) => p.lng))],
    ];
    return { origin, items, bounds };
  }, [feeders, substationCode]);

  const others = useMemo(
    () =>
      (substations ?? [])
        .filter((s) => s.code !== substationCode)
        .map((s) => ({ s, at: ROUTES.substations[s.code] ? fromLL(ROUTES.substations[s.code].at) : substationPosition(s.code) })),
    [substations, substationCode],
  );

  // Tile health: fall back once if every tile fails before any loads (offline, blocked network).
  const tiles = useRef({ ok: 0, failed: 0, reported: false });
  const tileHandlers = useMemo(
    () => ({
      tileload: () => {
        tiles.current.ok += 1;
      },
      tileerror: () => {
        const t = tiles.current;
        t.failed += 1;
        if (!t.reported && t.ok === 0 && t.failed >= 4) {
          t.reported = true;
          onTilesFailed();
        }
      },
    }),
    [onTilesFailed],
  );

  const subIcon = useMemo(
    () =>
      L.divIcon({
        className: 'fm-icon',
        html: `<div class="fm-sub">${SUB_ICON_SVG}</div><div class="fm-sublabel">${substationCode}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
    [substationCode],
  );
  const otherIcon = useMemo(() => L.divIcon({ className: 'fm-icon', html: `<div class="fm-sub small">${SUB_ICON_SVG}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), []);

  const fit = useCallback(() => mapRef.current?.fitBounds(layout.bounds, { padding: [48, 48], maxZoom: 16 }), [layout.bounds]);

  // Fullscreen: resize the map after the layout change; Esc leaves fullscreen.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const t = window.setTimeout(() => m.invalidateSize(), 60);
    if (!full) return () => window.clearTimeout(t);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [full]);

  // Redraw when the map's box changes width (e.g. the sidebar opening pushes the page over).
  const stageRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize({ pan: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep map gestures from firing when the toolbar is used.
  const stopRef = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
    }
  }, []);

  const selectedItem = layout.items.find((it) => it.f.code === selected);

  return (
    <div className={`realmap${full ? ' full' : ''}`} role="group" aria-label={`Map of ${substationCode} feeders. Select a feeder label to see its details.`}>
      <div className="fm-stage" ref={stageRef}>
        {/* Fractional zoom steps so the mouse wheel zooms smoothly instead of jumping whole levels. */}
        <MapContainer
          ref={mapRef}
          center={toLL(layout.origin)}
          zoom={14}
          scrollWheelZoom
          zoomSnap={0.1}
          zoomDelta={0.5}
          wheelPxPerZoomLevel={120}
          wheelDebounceTime={20}
          style={{ height: full ? '100%' : 480, width: '100%' }}
          attributionControl
        >
          <LayersControl position="topright">
            {BASEMAPS.map((b) => (
              <LayersControl.BaseLayer key={b.name} name={b.name} checked={b.name === initialBasemap}>
                <TileLayer url={b.url} attribution={b.attribution} className={b.className} maxZoom={19} eventHandlers={tileHandlers} />
              </LayersControl.BaseLayer>
            ))}
          </LayersControl>
          <FitOnSubstation bounds={layout.bounds} substationCode={substationCode} />
          <ScaleBar />

          {others.map(({ s, at }) => (
            <Marker
              key={`sub-${s.code}`}
              position={toLL(at)}
              icon={otherIcon}
              keyboard
              title={`${s.code} · ${s.evs} EVs`}
              eventHandlers={{ click: () => onSelectSubstation?.(s.code) }}
            >
              <Tooltip direction="top" offset={[0, -10]} className="fm-tip">
                {s.code} · {s.evs} EVs · {s.knownPct}% known{onSelectSubstation ? ' · click to open' : ''}
              </Tooltip>
            </Marker>
          ))}

          {/* EV premises first, so the feeder lines draw over them like streets between houses. */}
          {layout.items.flatMap(({ f, dots }) =>
            dots.map((d, k) => (
              <CircleMarker key={`dot-${f.code}-${k}`} center={toLL(d)} radius={3.2} pathOptions={{ color: casing, weight: 1, fillColor: DOT_FILL[d.kind], fillOpacity: 1 }}>
                <Tooltip direction="top" offset={[0, -4]} className="fm-tip">
                  {DOT_LABEL[d.kind]} · {f.code}
                </Tooltip>
              </CircleMarker>
            )),
          )}

          {/* Casing under every line, then the coloured core, then a glow under the selected feeder. */}
          {layout.items.map(({ f, route }) => (
            <Polyline key={`case-${f.code}`} positions={route.map(toLL)} interactive={false} pathOptions={{ color: casing, weight: 6.5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} />
          ))}
          {selectedItem && (
            <Polyline positions={selectedItem.route.map(toLL)} interactive={false} pathOptions={{ color: PALETTE.selected, weight: 16, opacity: 0.3, lineCap: 'round', lineJoin: 'round' }} />
          )}
          {layout.items.map(({ f, route }) => {
            const on = f.code === selected;
            const alert = colorBy === 'network' && (f.forecastLoadPct ?? 0) >= FORECAST_ALERT_PCT;
            return (
              <Polyline
                key={`core-${f.code}`}
                positions={route.map(toLL)}
                interactive={false}
                pathOptions={{
                  color: on && colorBy === 'network' ? PALETTE.selected : alert ? PALETTE.danger : lineColor(f, colorBy),
                  weight: on ? 5 : 3.5,
                  opacity: on ? 1 : 0.88,
                  dashArray: alert ? '10 7' : undefined,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            );
          })}

          {layout.items.map(({ f, end }) => (
            <CircleMarker key={`end-${f.code}`} center={toLL(end)} radius={5} interactive={false} pathOptions={{ color: casing, weight: 2, fillColor: f.code === selected ? PALETTE.selected : PALETTE.route, fillOpacity: 1 }} />
          ))}

          <Marker position={toLL(layout.origin)} icon={subIcon} interactive={false} keyboard={false} zIndexOffset={2000} />

          {layout.items.map(({ f, end }) => {
            const label = shortCode(f.code, substationCode);
            const split = f.known !== null && f.unenrolled !== null ? `${f.known} known, ${f.unenrolled} unenrolled` : `${f.evs} EVs, split not in sample`;
            const forecast = f.forecastLoadPct !== null ? ` · forecast ${f.forecastLoadPct}% of capacity` : '';
            return (
              <FeederChip
                key={`chip-${f.code}`}
                f={f}
                position={toLL(end)}
                html={chipHtml(f, label, f.code === selected, colorBy)}
                ariaLabel={`${f.code}: ${split}`}
                selected={f.code === selected}
                tooltip={`${f.code} · ${split}${forecast}`}
                onSelect={onSelect}
              />
            );
          })}
        </MapContainer>

        <div className="fm-toolbar" ref={stopRef}>
          <div className="fm-seg" role="group" aria-label="Colour feeders by">
            {(
              [
                ['network', 'Network'],
                ['forecast', 'Forecast load'],
                ['gap', 'Blind spot'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" className={colorBy === k ? 'on' : ''} aria-pressed={colorBy === k} onClick={() => setColorBy(k)}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="fm-btn" onClick={fit} aria-label="Fit map to substation" title="Fit to substation">
            <Icon name="map" size={16} />
          </button>
          <button type="button" className="fm-btn" onClick={() => setFull((v) => !v)} aria-pressed={full} aria-label={full ? 'Exit full screen map' : 'Full screen map'} title={full ? 'Exit full screen (Esc)' : 'Full screen'}>
            <Icon name={full ? 'back' : 'open'} size={16} />
          </button>
        </div>

        <div className={`fm-legend${legendOpen ? ' open' : ''}`} ref={stopRef}>
          <button type="button" className="fm-legend-toggle" aria-expanded={legendOpen} onClick={() => setLegendOpen((v) => !v)}>
            Legend <span aria-hidden="true">{legendOpen ? '▾' : '▸'}</span>
          </button>
          {legendOpen && (
            <>
          <strong>{substationCode}</strong>
          <span>
            <i className="dot" style={{ background: PALETTE.known }} /> EV enrolled
          </span>
          <span>
            <i className="dot" style={{ background: PALETTE.unenrolled }} /> EV detected, not enrolled
          </span>
          {colorBy === 'network' && (
            <>
              <span>
                <i className="ln" style={{ background: PALETTE.route }} /> Feeder route
              </span>
              <span>
                <i className="ln dash" style={{ borderColor: PALETTE.danger }} /> Forecast ≥ {FORECAST_ALERT_PCT}%
              </span>
            </>
          )}
          {colorBy === 'forecast' && (
            <span className="ramp">
              <i className="ln" style={{ background: PALETTE.ok }} /> &lt;70% <i className="ln" style={{ background: PALETTE.known }} /> 70–89% <i className="ln" style={{ background: PALETTE.danger }} /> ≥90%
            </span>
          )}
          {colorBy === 'gap' && (
            <span className="ramp">
              <i className="ln grad" /> Share of EVs not enrolled, low → high
            </span>
          )}
          <span>
            <i className="bar" /> Label bar: enrolled vs not enrolled
          </span>
            </>
          )}
        </div>
      </div>
      <p className="small muted">
        Feeder routes follow real streets, but positions are illustrative, placed around {BRAND.demoTown} until {BRAND.utilityName} GIS data is connected. Dots: up to 40 EV premises per
        feeder. Switch basemap (Dark, Streets, Satellite) with the layers button.
      </p>
    </div>
  );
}

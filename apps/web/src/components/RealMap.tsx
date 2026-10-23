import { useEffect, useMemo, useRef } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L, { type LatLngBoundsExpression, type Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  BRAND,
  colors,
  feederLengthKm,
  feederRoute,
  premisePoints,
  substationPosition,
  type FeederStat,
  type LatLng,
} from '@demo/shared';
import './addons.css';

export interface RealMapProps {
  feeders: FeederStat[];
  selected: string | null;
  onSelect: (code: string) => void;
  substationCode: string;
  /** Called once when tiles keep failing (e.g. offline), so the parent can fall back to the schematic. */
  onTilesFailed: () => void;
}

const TILE_URL: string = (import.meta.env.VITE_MAP_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const FORECAST_ALERT_PCT = 90;

const toLL = (p: LatLng): [number, number] => [p.lat, p.lng];

// Path colours go through Leaflet style options (react-leaflet only applies a path's CSS class at creation).
const DOT_FILL = { known: colors.solar, unenrolled: colors.ev, unknown: colors.splitPending } as const;
function lineStyle(selected: boolean, alert: boolean) {
  if (selected) return { color: colors.primary, weight: 5, opacity: 0.95, dashArray: undefined };
  if (alert) return { color: colors.solar, weight: 4, opacity: 0.95, dashArray: '8 6' };
  return { color: colors.navyMid, weight: 3.5, opacity: 0.55, dashArray: undefined };
}

function shortCode(code: string, sub: string) {
  return code.startsWith(`${sub}-`) ? code.slice(sub.length + 1) : code;
}

/** Donut ring (known amber / unenrolled indigo, grey when the split is unknown) as an HTML string for a divIcon. */
function donutHtml(f: FeederStat, size: number, label: string, selected: boolean, alert: boolean): string {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const split = f.known !== null && f.unenrolled !== null && f.evs > 0;
  const knownLen = split ? (c * (f.known ?? 0)) / f.evs : 0;
  const ring = split
    ? `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" style="stroke:var(--ev)" stroke-width="6" fill="none"/>` +
      `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" style="stroke:var(--solar)" stroke-width="6" fill="none" stroke-dasharray="${knownLen.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`
    : `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" style="stroke:var(--split-pending)" stroke-width="6" fill="none"/>`;
  const halo = selected ? `<circle r="${size / 2 - 0.5}" cx="${size / 2}" cy="${size / 2}" style="stroke:var(--primary)" stroke-width="2.5" fill="none"/>` : '';
  const badge = alert ? `<span class="rm-badge">${f.forecastLoadPct}%</span>` : '';
  return (
    `<div class="rm-node${selected ? ' on' : ''}" style="width:${size}px">` +
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="#fff"/>${ring}${halo}</svg>` +
    `<span class="rm-label">${label}<small>${f.evs} EVs</small></span>${badge}</div>`
  );
}

function FitBounds({ bounds, substationCode }: { bounds: LatLngBoundsExpression; substationCode: string }) {
  const map = useMap();
  const last = useRef<string | null>(null);
  useEffect(() => {
    // Refit only when the substation changes, so selecting a feeder doesn't move the view.
    if (last.current === substationCode) return;
    last.current = substationCode;
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
  }, [map, bounds, substationCode]);
  return null;
}

/** A focusable, labelled feeder marker. Leaflet fires `click` on Enter for keyboard users. */
function FeederMarker({ f, position, size, label, ariaLabel, selected, alert, onSelect }: {
  f: FeederStat;
  position: [number, number];
  size: number;
  label: string;
  ariaLabel: string;
  selected: boolean;
  alert: boolean;
  onSelect: (code: string) => void;
}) {
  const ref = useRef<LeafletMarker | null>(null);
  const icon = useMemo(
    () => L.divIcon({ className: 'rm-icon', html: donutHtml(f, size, label, selected, alert), iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
    [f, size, label, selected, alert],
  );
  useEffect(() => {
    const el = ref.current?.getElement();
    if (!el) return;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', ariaLabel);
    el.setAttribute('aria-pressed', String(selected));
    // Enter / Space select the feeder, like the schematic's buttons.
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
  return <Marker ref={ref} position={position} icon={icon} keyboard eventHandlers={{ click: () => onSelect(f.code) }} />;
}

/** Real basemap (OpenStreetMap tiles) with synthetic substation and feeder positions. */
export default function RealMap({ feeders, selected, onSelect, substationCode, onTilesFailed }: RealMapProps) {
  const layout = useMemo(() => {
    const origin = substationPosition(substationCode);
    const maxEvs = Math.max(1, ...feeders.map((f) => f.evs));
    const items = feeders.map((f, i) => {
      const route = feederRoute(substationCode, f.code, i, feeders.length, feederLengthKm(f.premises, f.evs), origin);
      return {
        f,
        route,
        end: route[route.length - 1],
        dots: premisePoints(route, f.code, f.evs, f.known),
        size: Math.round(26 + 22 * Math.sqrt(f.evs / maxEvs)),
      };
    });
    const all = [origin, ...items.flatMap((it) => it.route)];
    const bounds: LatLngBoundsExpression = [
      [Math.min(...all.map((p) => p.lat)), Math.min(...all.map((p) => p.lng))],
      [Math.max(...all.map((p) => p.lat)), Math.max(...all.map((p) => p.lng))],
    ];
    return { origin, items, bounds };
  }, [feeders, substationCode]);

  // Tile health: fall back once if tiles keep failing before any loads (offline, blocked network).
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
        className: 'rm-icon',
        html: `<div class="rm-sub"><span>${substationCode.replace('SUB-', 'S')}</span></div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      }),
    [substationCode],
  );

  return (
    <div className="realmap" role="group" aria-label={`Map of ${substationCode} feeders. Select a feeder marker to see its details.`}>
      <MapContainer center={toLL(layout.origin)} zoom={13} scrollWheelZoom={false} style={{ height: 420, width: '100%' }} attributionControl>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={18} eventHandlers={tileHandlers} />
        <FitBounds bounds={layout.bounds} substationCode={substationCode} />
        {layout.items.map(({ f, route }) => (
          <Polyline
            key={`line-${f.code}`}
            positions={route.map(toLL)}
            interactive={false}
            pathOptions={lineStyle(f.code === selected, (f.forecastLoadPct ?? 0) >= FORECAST_ALERT_PCT)}
          />
        ))}
        {layout.items.flatMap(({ f, dots }) =>
          dots.map((d, k) => (
            <CircleMarker
              key={`dot-${f.code}-${k}`}
              center={toLL(d)}
              radius={3}
              interactive={false}
              pathOptions={{ color: '#FFFFFF', weight: 1, fillColor: DOT_FILL[d.kind], fillOpacity: 0.95 }}
            />
          )),
        )}
        <Marker position={toLL(layout.origin)} icon={subIcon} interactive={false} keyboard={false} />
        {layout.items.map(({ f, end, size }) => {
          const label = shortCode(f.code, substationCode);
          const split = f.known !== null && f.unenrolled !== null ? `${f.known} known, ${f.unenrolled} unenrolled` : `${f.evs} EVs, split not in sample`;
          return (
            <FeederMarker
              key={`node-${f.code}`}
              f={f}
              position={toLL(end)}
              size={size}
              label={label}
              ariaLabel={`${f.code}: ${split}`}
              selected={f.code === selected}
              alert={(f.forecastLoadPct ?? 0) >= FORECAST_ALERT_PCT}
              onSelect={onSelect}
            />
          );
        })}
      </MapContainer>
      <div className="legend">
        <span>
          <span className="sw" style={{ background: 'var(--solar)' }} />
          Known / enrolled
        </span>
        <span>
          <span className="sw" style={{ background: 'var(--ev)' }} />
          Detected, unenrolled
        </span>
        <span>
          <span className="sw" style={{ background: 'var(--split-pending)' }} />
          Split not in sample
        </span>
        <span>
          <span className="sw" style={{ background: 'var(--solar)', borderRadius: 999 }} />
          Forecast ≥ {FORECAST_ALERT_PCT}% of capacity
        </span>
      </div>
      <p className="small muted">
        Feeder routes and EV premises are illustrative, placed around {BRAND.demoTown} until {BRAND.utilityName} GIS data is connected. Dots: up to 40 EV premises per feeder.
      </p>
    </div>
  );
}

import type { KeyboardEvent } from 'react';
import type { FeederStat } from '@demo/shared';
import './addons.css';

export interface SchematicMapProps {
  feeders: FeederStat[];
  /** Selected feeder code (highlighted with a halo). */
  selected: string | null;
  onSelect: (code: string) => void;
  substationCode: string;
}

const W = 640;
const H = 400;
const CX = W / 2;
const CY = H / 2 - 6;
const SUB = 40; // substation square side
const LEN_MIN = 88;
const LEN_MAX = 150;
const R_MIN = 9;
const R_MAX = 24;

function scale(v: number, min: number, max: number, outMin: number, outMax: number): number {
  if (max <= min) return (outMin + outMax) / 2;
  return outMin + ((v - min) / (max - min)) * (outMax - outMin);
}

function shortCode(code: string, sub: string) {
  return code.startsWith(`${sub}-`) ? code.slice(sub.length + 1) : code;
}

/**
 * Deterministic schematic of a substation and its feeders (a stand-in for the GIS map):
 * the substation sits in the centre, one radial line per feeder (length ∝ premises, or EVs when
 * premises are unknown), and an end node whose size ∝ EVs and whose ring splits amber (known) /
 * indigo (unenrolled). Grey when the split is not in the sample.
 */
export function SchematicMap({ feeders, selected, onSelect, substationCode }: SchematicMapProps) {
  const n = feeders.length;
  const sizeOf = (f: FeederStat) => f.premises ?? f.evs;
  const sizes = feeders.map(sizeOf);
  const evs = feeders.map((f) => f.evs);
  const sMin = Math.min(...sizes, Infinity);
  const sMax = Math.max(...sizes, -Infinity);
  const eMin = Math.min(...evs, Infinity);
  const eMax = Math.max(...evs, -Infinity);

  const nodes = feeders.map((f, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);
    const len = scale(sizeOf(f), sMin, sMax, LEN_MIN, LEN_MAX);
    const r = scale(f.evs, eMin, eMax, R_MIN, R_MAX);
    const x = CX + Math.cos(angle) * len;
    const y = CY + Math.sin(angle) * len;
    const split = f.known !== null && f.unenrolled !== null;
    const knownFrac = split && f.evs > 0 ? (f.known ?? 0) / Math.max(1, (f.known ?? 0) + (f.unenrolled ?? 0)) : 0;
    const label = split ? `${f.code}: ${f.known} known, ${f.unenrolled} unenrolled` : `${f.code}: ${f.evs} EVs, split not in sample`;
    const warn = f.forecastLoadPct !== null && f.forecastLoadPct >= 90;
    return { f, x, y, r, split, knownFrac, label, warn, angle, short: shortCode(f.code, f.substationCode) };
  });

  const onKey = (e: KeyboardEvent<SVGGElement>, code: string) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      onSelect(code);
    }
  };

  return (
    <div className="mapview">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Schematic map of ${substationCode} feeders`}>
        {/* feeder lines */}
        {nodes.map((nd) => (
          <line key={`l-${nd.f.code}`} x1={CX} y1={CY} x2={nd.x} y2={nd.y} stroke="var(--border-input)" strokeWidth={nd.f.code === selected ? 3 : 2} aria-hidden="true" />
        ))}
        {/* substation */}
        <g aria-hidden="true">
          <rect x={CX - SUB / 2} y={CY - SUB / 2} width={SUB} height={SUB} rx={8} fill="var(--primary-soft)" stroke="var(--navy)" strokeWidth={2} />
          <text x={CX} y={CY + 4} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: 'var(--navy)' }}>
            {substationCode.replace(/^SUB-/, 'S')}
          </text>
          <text x={CX} y={CY + SUB / 2 + 14} textAnchor="middle" className="cap">
            Substation
          </text>
        </g>
        {/* feeder nodes */}
        {nodes.map((nd) => {
          const c = 2 * Math.PI * nd.r;
          const isSel = nd.f.code === selected;
          const labelY = nd.y > CY ? nd.y + nd.r + 14 : nd.y - nd.r - 16;
          return (
            <g
              key={nd.f.code}
              className="node"
              role="button"
              tabIndex={0}
              aria-pressed={isSel}
              aria-label={nd.label}
              onClick={() => onSelect(nd.f.code)}
              onKeyDown={(e) => onKey(e, nd.f.code)}
            >
              {/* hit target (≥ 44px) */}
              <circle cx={nd.x} cy={nd.y} r={Math.max(22, nd.r + 8)} fill="transparent" />
              {isSel && <circle cx={nd.x} cy={nd.y} r={nd.r + 7} fill="none" stroke="var(--primary)" strokeWidth={3} />}
              <circle className="focus-ring" cx={nd.x} cy={nd.y} r={nd.r + 11} fill="none" stroke="transparent" strokeWidth={0} />
              {nd.split ? (
                <>
                  <circle cx={nd.x} cy={nd.y} r={nd.r} fill="var(--surface)" stroke="var(--ev)" strokeWidth={6} />
                  <circle
                    cx={nd.x}
                    cy={nd.y}
                    r={nd.r}
                    fill="none"
                    stroke="var(--solar)"
                    strokeWidth={6}
                    strokeDasharray={`${c * nd.knownFrac} ${c}`}
                    transform={`rotate(-90 ${nd.x} ${nd.y})`}
                  />
                </>
              ) : (
                <circle cx={nd.x} cy={nd.y} r={nd.r} fill="var(--surface)" stroke="var(--split-pending)" strokeWidth={6} />
              )}
              <text className="label" x={nd.x} y={labelY} textAnchor="middle">
                {nd.short}
              </text>
              <text className="cap" x={nd.x} y={labelY + 12} textAnchor="middle">
                {nd.f.evs} EVs
              </text>
              {nd.warn && (
                <g aria-hidden="true">
                  <rect x={nd.x + nd.r - 2} y={nd.y - nd.r - 14} width={34} height={16} rx={8} fill="var(--solar)" />
                  <text className="badge" x={nd.x + nd.r + 15} y={nd.y - nd.r - 2.5} textAnchor="middle">
                    {nd.f.forecastLoadPct}%
                  </text>
                </g>
              )}
            </g>
          );
        })}
        <text x={12} y={H - 10} className="cap">
          Schematic layout · GIS placeholder
        </text>
      </svg>
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
          Forecast ≥ 90% of capacity
        </span>
      </div>
      <p className="small muted">Node size: matched EVs · line length: premises on the feeder. Schematic layout, not geography.</p>
    </div>
  );
}

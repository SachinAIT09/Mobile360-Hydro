import type { CampaignStats, CampaignType, VariantId } from '@demo/shared';
import { hashNoise } from '../common/numbers.js';

/** Minimum sends per variant before a winner can be called. */
export const MIN_SENT_PER_VARIANT = 20;
/** Minimum lead, in percentage points of the key rate, before a winner can be called. */
export const MIN_LEAD_POINTS = 3;

/** FNV-1a 32-bit hash of a string (deterministic, platform independent). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic value in [-1, 1] for a string key. */
function noiseOf(key: string): number {
  // Keep the argument moderate so Math.sin stays well conditioned.
  return hashNoise(hashString(key) % 1_000_003);
}

/**
 * Which copy a recipient gets. Demo customers always get A (so the scripted demo is predictable);
 * everyone else is split ~50/50, stable for a campaign + customer pair.
 */
export function assignVariant(campaignId: string, customerId: string, isDemo: boolean): VariantId {
  if (isDemo) return 'A';
  return noiseOf(`${campaignId}:${customerId}`) < 0 ? 'A' : 'B';
}

/** Split targets into the A and B groups (order preserved within each group). */
export function splitTargets<T>(
  campaignId: string,
  targets: readonly T[],
  idOf: (t: T) => string,
  isDemo: (t: T) => boolean,
): Record<VariantId, T[]> {
  const out: Record<VariantId, T[]> = { A: [], B: [] };
  for (const t of targets) out[assignVariant(campaignId, idOf(t), isDemo(t))].push(t);
  return out;
}

/**
 * Synthetic response-rate multiplier for a variant: A plays out at the baseline rates; B gets a
 * deterministic 0.85–1.15 scale per campaign so the two arms differ believably (synthetic, labelled as such).
 */
export function variantRateScale(campaignId: string, variant: VariantId = 'B'): number {
  if (variant === 'A') return 1;
  const u = (noiseOf(`${campaignId}:rate:B`) + 1) / 2; // 0..1
  return Math.round((0.85 + 0.3 * u) * 1000) / 1000;
}

/** The rate a variant is judged on: offers → enrolled / delivered; DR → paused / delivered. */
export function keyRate(type: CampaignType, s: CampaignStats): number {
  if (!s.delivered) return 0;
  return (type === 'ENROLL_OFFER' ? s.acted : s.paused) / s.delivered;
}

/** Winning variant, or null ("Too early to call") until both arms have ≥20 sends and one leads by ≥3 points. */
export function pickWinner(type: CampaignType, stats: Record<VariantId, CampaignStats> | null | undefined): VariantId | null {
  if (!stats) return null;
  const { A, B } = stats;
  if (!A || !B || A.sent < MIN_SENT_PER_VARIANT || B.sent < MIN_SENT_PER_VARIANT) return null;
  const lead = (keyRate(type, A) - keyRate(type, B)) * 100;
  // Small epsilon so an exact 3-point lead counts despite floating point.
  if (lead >= MIN_LEAD_POINTS - 1e-9) return 'A';
  if (-lead >= MIN_LEAD_POINTS - 1e-9) return 'B';
  return null;
}

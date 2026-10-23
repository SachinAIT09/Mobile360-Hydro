import type { Campaign, CampaignStats, CampaignType, VariantId } from '@demo/shared';

export interface FunnelStage {
  label: string;
  count: number;
  /** Share of sent, 0–100 (one decimal). */
  pct: number;
}

export interface VariantRow {
  id: VariantId;
  label: string;
  title: string;
  stats: CampaignStats;
  stages: FunnelStage[];
  /** Key rate (offers: enrolled / delivered; DR: paused / delivered), 0–100 with one decimal. */
  keyRate: number;
  keyLabel: string;
  leading: boolean;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

/** Funnel stages for one set of stats. Offers: sent → delivered → opened → enrolled; DR: sent → delivered → responded → paused. */
export function funnelStages(type: CampaignType, s: CampaignStats): FunnelStage[] {
  const rows: [string, number][] =
    type === 'ENROLL_OFFER'
      ? [['Sent', s.sent], ['Delivered', s.delivered], ['Opened', s.opened], ['Enrolled', s.acted]]
      : [['Sent', s.sent], ['Delivered', s.delivered], ['Responded', s.acted], ['Paused charging', s.paused]];
  return rows.map(([label, count]) => ({ label, count, pct: pct(count, s.sent) }));
}

export function keyRateLabel(type: CampaignType): string {
  return type === 'ENROLL_OFFER' ? 'Enrolled / delivered' : 'Paused / delivered';
}

/** One row per variant of an A/B campaign, or a single "All recipients" row otherwise. */
export function variantRows(c: Campaign): VariantRow[] {
  const keyLabel = keyRateLabel(c.type);
  const row = (id: VariantId, label: string, title: string, s: CampaignStats): VariantRow => ({
    id,
    label,
    title,
    stats: s,
    stages: funnelStages(c.type, s),
    keyRate: pct(c.type === 'ENROLL_OFFER' ? s.acted : s.paused, s.delivered),
    keyLabel,
    leading: c.winner === id,
  });
  if (!c.variants?.length || !c.variantStats) return [row('A', 'All recipients', c.title, c.stats)];
  return (['A', 'B'] as const).map((id) => {
    const copy = c.variants?.find((v) => v.id === id);
    return row(id, `Variant ${id}`, copy?.title ?? c.title, c.variantStats![id]);
  });
}

/** True when the campaign is an A/B test. */
export const isAb = (c: Pick<Campaign, 'variants'>) => (c.variants?.length ?? 0) > 1;

/** "Variant B is leading" / "Too early to call" for an A/B campaign; null otherwise. */
export function abVerdict(c: Campaign): string | null {
  if (!isAb(c)) return null;
  return c.winner ? `Variant ${c.winner} is leading` : 'Too early to call';
}

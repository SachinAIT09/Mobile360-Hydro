import type { CampaignAudience, CampaignSegment } from '@demo/shared';

export const SEGMENT_LABEL: Record<CampaignSegment, string> = {
  UNENROLLED_EV: 'Detected, unenrolled EVs',
  ENROLLED_EV: 'Enrolled EVs (DR program)',
};

/** Distinct values, first-occurrence order. */
export function distinctFeeders(codes: readonly string[]): string[] {
  return [...new Set(codes)];
}

/**
 * Human label for an audience, e.g. "SUB-01-F1 · Detected, unenrolled EVs",
 * "SUB-01-F1, SUB-01-F2 +1 · Enrolled EVs (DR program)", "SUB-01 stopped-charging cluster · …".
 */
export function audienceLabel(audience: CampaignAudience, liveEventSubstation?: string): string {
  const seg = SEGMENT_LABEL[audience.segment];
  if (audience.kind === 'FEEDER') return `${audience.feederCode} · ${seg}`;
  if (audience.kind === 'FEEDERS') {
    const codes = distinctFeeders(audience.feederCodes);
    const more = codes.length > 2 ? ` +${codes.length - 2}` : '';
    return `${codes.slice(0, 2).join(', ')}${more} · ${seg}`;
  }
  return `${liveEventSubstation ?? 'Live event'} stopped-charging cluster · ${seg}`;
}

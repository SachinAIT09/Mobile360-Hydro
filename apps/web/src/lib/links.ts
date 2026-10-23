import type { CampaignAudience, CampaignSegment, CampaignType } from '@demo/shared';

/** Build the /campaigns/new URL that prefills Campaign 360. */
export function campaignLink(type: CampaignType, audience: CampaignAudience): string {
  const q = new URLSearchParams({ type, segment: audience.segment });
  if (audience.kind === 'FEEDER') q.set('feeder', audience.feederCode);
  else q.set('liveEventId', audience.liveEventId);
  return `/campaigns/new?${q.toString()}`;
}

export function feederCampaignLink(type: CampaignType, feederCode: string, segment: CampaignSegment): string {
  return campaignLink(type, { kind: 'FEEDER', feederCode, segment });
}

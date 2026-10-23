import { describe, expect, it } from 'vitest';
import type { CampaignDraft } from '@demo/shared';
import { campaignDraftLink, campaignLink, feederCampaignLink } from './links';

describe('campaignLink', () => {
  it('prefills type, segment and feeder for a feeder audience', () => {
    const url = campaignLink('ENROLL_OFFER', { kind: 'FEEDER', feederCode: 'SUB-01-F1', segment: 'UNENROLLED_EV' });
    expect(url).toBe('/campaigns/new?type=ENROLL_OFFER&segment=UNENROLLED_EV&feeder=SUB-01-F1');
  });

  it('prefills the live event id for a live-event audience', () => {
    const url = campaignLink('STOP_CHARGING', { kind: 'LIVE_EVENT', liveEventId: '66f1a2b3c4d5e6f7a8b9c0d1', segment: 'ENROLLED_EV' });
    const q = new URL(url, 'http://x').searchParams;
    expect(url.startsWith('/campaigns/new?')).toBe(true);
    expect(q.get('type')).toBe('STOP_CHARGING');
    expect(q.get('segment')).toBe('ENROLLED_EV');
    expect(q.get('liveEventId')).toBe('66f1a2b3c4d5e6f7a8b9c0d1');
    expect(q.has('feeder')).toBe(false);
  });

  it('lists every feeder for a multi-feeder audience', () => {
    const url = campaignLink('STOP_CHARGING', { kind: 'FEEDERS', feederCodes: ['SUB-01-F1', 'SUB-01-F2'], segment: 'ENROLLED_EV' });
    const q = new URL(url, 'http://x').searchParams;
    expect(q.get('feeders')).toBe('SUB-01-F1,SUB-01-F2');
    expect(q.has('feeder')).toBe(false);
    expect(q.has('liveEventId')).toBe(false);
  });

  it('URL-encodes values', () => {
    const url = campaignLink('ENROLL_OFFER', { kind: 'FEEDER', feederCode: 'A B&C', segment: 'UNENROLLED_EV' });
    expect(new URL(url, 'http://x').searchParams.get('feeder')).toBe('A B&C');
    expect(url).not.toContain(' ');
  });
});

describe('feederCampaignLink', () => {
  it('is the feeder-audience shorthand', () => {
    expect(feederCampaignLink('STOP_CHARGING', 'SUB-01-F2', 'ENROLLED_EV')).toBe(
      campaignLink('STOP_CHARGING', { kind: 'FEEDER', feederCode: 'SUB-01-F2', segment: 'ENROLLED_EV' }),
    );
  });
});

describe('campaignDraftLink', () => {
  const draft: CampaignDraft = {
    type: 'ENROLL_OFFER',
    audience: { kind: 'FEEDER', feederCode: 'SUB-26-F1', segment: 'UNENROLLED_EV' },
    variants: [
      { title: '{first_name}, join & earn {incentive}', body: 'Line one.\nLine two: 100% opt-out?', cta: 'See how it works' },
      { title: 'Earn {incentive} off-peak', body: 'B body', cta: 'Claim my reward' },
    ],
  };

  it('carries type, audience, both variants and src=assistant', () => {
    const url = campaignDraftLink(draft);
    expect(url.startsWith('/campaigns/new?type=ENROLL_OFFER&segment=UNENROLLED_EV&feeder=SUB-26-F1&')).toBe(true);
    const q = new URL(url, 'http://x').searchParams;
    expect(q.get('title')).toBe(draft.variants[0].title);
    expect(q.get('body')).toBe(draft.variants[0].body);
    expect(q.get('cta')).toBe('See how it works');
    expect(q.get('titleB')).toBe('Earn {incentive} off-peak');
    expect(q.get('bodyB')).toBe('B body');
    expect(q.get('ctaB')).toBe('Claim my reward');
    expect(q.get('src')).toBe('assistant');
    expect(url).not.toMatch(/[ \n{}]/);
  });

  it('lists every feeder for a multi-feeder draft', () => {
    const url = campaignDraftLink({ ...draft, type: 'STOP_CHARGING', audience: { kind: 'FEEDERS', feederCodes: ['SUB-26-F1', 'SUB-15-F3'], segment: 'ENROLLED_EV' } });
    const q = new URL(url, 'http://x').searchParams;
    expect(q.get('type')).toBe('STOP_CHARGING');
    expect(q.get('feeders')).toBe('SUB-26-F1,SUB-15-F3');
    expect(q.has('feeder')).toBe(false);
    expect(q.get('segment')).toBe('ENROLLED_EV');
  });
});

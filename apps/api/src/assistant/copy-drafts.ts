import { PROGRAM, type CampaignAudience, type CampaignDraft, type CampaignDraftCopy, type CampaignType } from '@demo/shared';
import { MERGE_FIELDS } from '../campaigns/merge.js';

/** Limits enforced by the campaign create DTO. */
export const COPY_LIMITS = { title: 140, body: 1000, cta: 40 } as const;

export interface DraftInput {
  /** One feeder, or several for a multi-feeder audience (2–10). */
  feederCodes: string[];
  /** Enrolled EVs on the (first) feeder: drives the social-proof wording. */
  knownOnFeeder: number;
  /** Detected but unenrolled EVs across the feeders. */
  unenrolled: number;
}

/** Enough neighbours enrolled to quote the number; below it the copy talks about "drivers on your street". */
const SOCIAL_PROOF_MIN = 5;

/**
 * Two variants per campaign type: A leans on social proof, B on the reward and urgency.
 * Copy uses only the campaign merge fields ({first_name} {incentive} {event_window} {neighbours_enrolled})
 * and PROGRAM placeholders, so Campaign 360 personalises it per recipient exactly like hand-written copy.
 */
export function draftCopy(type: CampaignType, input: DraftInput): [CampaignDraftCopy, CampaignDraftCopy] {
  const proof = input.knownOnFeeder >= SOCIAL_PROOF_MIN;
  if (type === 'ENROLL_OFFER') {
    return [
      {
        title: proof
          ? `{first_name}, {neighbours_enrolled} of your neighbours already earn with ${PROGRAM.name}`
          : `{first_name}, EV drivers on your street are joining ${PROGRAM.name}`,
        body: proof
          ? `{neighbours_enrolled} EV drivers near you get rewarded for charging a little later on a few busy evenings. Join ${PROGRAM.name} and earn {incentive}. You can skip any event, and your car is still charged by morning.`
          : `Your neighbours are starting to shift EV charging away from the busiest evenings. Join ${PROGRAM.name}, earn {incentive}, and skip any event you like. Your car is still charged by morning.`,
        cta: 'See how it works',
      },
      {
        title: `Earn {incentive} for charging your EV off-peak`,
        body: `{first_name}, join ${PROGRAM.name} before the next peak event and earn {incentive} on sign-up, plus ${PROGRAM.perEventIncentive} for every event you take part in. It takes two minutes and you can opt out at any time.`,
        cta: 'Claim my reward',
      },
    ];
  }
  return [
    {
      title: proof
        ? `{first_name}, {neighbours_enrolled} neighbours are pausing EV charging {event_window}`
        : `{first_name}, help keep power steady on your street {event_window}`,
      body: proof
        ? `The grid near you is busy {event_window}. {neighbours_enrolled} neighbours in ${PROGRAM.name} are pausing EV charging. Pause yours and earn {incentive}; charging resumes automatically after the event.`
        : `The grid near you is busy {event_window}. Pausing your EV charging for a few hours keeps power steady for everyone and earns you {incentive}. Charging resumes automatically after the event.`,
      cta: 'Pause charging',
    },
    {
      title: `Earn {incentive}: pause EV charging {event_window}`,
      body: `{first_name}, pause your EV charging {event_window} and earn {incentive} from ${PROGRAM.name}. It only takes one tap, and charging picks up again as soon as the event ends.`,
      cta: 'Pause and earn',
    },
  ];
}

export function draftAudience(type: CampaignType, feederCodes: string[]): CampaignAudience {
  const segment = type === 'ENROLL_OFFER' ? 'UNENROLLED_EV' : 'ENROLLED_EV';
  return feederCodes.length > 1 ? { kind: 'FEEDERS', feederCodes: feederCodes.slice(0, 10), segment } : { kind: 'FEEDER', feederCode: feederCodes[0], segment };
}

export function buildDraft(type: CampaignType, input: DraftInput): CampaignDraft {
  return { type, audience: draftAudience(type, input.feederCodes), variants: draftCopy(type, input) };
}

/** Merge fields used in `text` that Campaign 360 does not know (should always be empty). */
export function unknownMergeFields(text: string): string[] {
  const known = new Set<string>(MERGE_FIELDS);
  return [...text.matchAll(/\{[a-z_]+\}/g)].map((m) => m[0]).filter((f) => !known.has(f));
}

/** Problems with one copy variant (length limits, unknown merge fields); empty when valid. */
export function validateCopy(c: CampaignDraftCopy): string[] {
  const out: string[] = [];
  if (c.title.length > COPY_LIMITS.title) out.push(`title longer than ${COPY_LIMITS.title}`);
  if (c.body.length > COPY_LIMITS.body) out.push(`body longer than ${COPY_LIMITS.body}`);
  if (c.cta.length > COPY_LIMITS.cta) out.push(`cta longer than ${COPY_LIMITS.cta}`);
  for (const f of unknownMergeFields(`${c.title} ${c.body} ${c.cta}`)) out.push(`unknown merge field ${f}`);
  return out;
}

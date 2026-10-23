/**
 * Seed figures from Net2Grid's anonymized feeder EV visibility pilot (Sep 2026).
 * Shown in the product as "Sample data".
 */
import { BRAND } from '@demo/shared';


/** [code, total EVs, % known, % penetration, feeder count] for substations with matched EVs. */
export const SUBSTATIONS: [string, number, number, number, number][] = [
  ['SUB-01', 463, 48, 15.3, 7],
  ['SUB-02', 436, 52, 21.7, 9],
  ['SUB-03', 342, 46, 17.5, 8],
  ['SUB-04', 273, 59, 16.7, 6],
  ['SUB-05', 246, 58, 15.9, 6],
  ['SUB-06', 245, 51, 34.2, 5],
  ['SUB-07', 202, 42, 14.1, 6],
  ['SUB-08', 139, 60, 12.2, 5],
  ['SUB-09', 122, 37, 8.4, 4],
  ['SUB-10', 109, 47, 15.7, 3],
  ['SUB-11', 100, 21, 24.2, 4],
  ['SUB-12', 95, 62, 10, 3],
  ['SUB-13', 92, 60, 18.4, 3],
  ['SUB-14', 92, 62, 17.7, 3],
  ['SUB-15', 79, 30, 20.8, 3],
  ['SUB-16', 62, 39, 32.5, 2],
  ['SUB-17', 60, 55, 24.1, 2],
  ['SUB-18', 58, 50, 15.5, 3],
  ['SUB-19', 45, 69, 14.6, 2],
  ['SUB-20', 37, 41, 10.9, 2],
  ['SUB-21', 30, 40, 19.4, 2],
  ['SUB-22', 29, 45, 9.5, 2],
  ['SUB-23', 25, 72, 12.9, 2],
  ['SUB-24', 21, 38, 28.4, 1],
  ['SUB-25', 18, 44, 9.7, 2],
  ['SUB-26', 17, 12, 35.4, 1],
  ['SUB-27', 16, 19, 20, 1],
  ['SUB-28', 12, 50, 13, 2],
  ['SUB-29', 7, 43, 16.7, 1],
  ['SUB-30', 7, 29, 15.6, 1],
  ['SUB-31', 5, 60, 45.5, 1],
  ['SUB-32', 5, 20, 7.2, 1],
  ['SUB-33', 3, 0, 4.7, 1],
  ['SUB-34', 1, 0, 14.3, 1],
  ['SUB-35', 1, 0, 11.1, 1],
  ['SUB-36', 1, 0, 8.3, 1],
  ['SUB-37', 1, 0, 33.3, 1],
];

/** Substations with no EV signal on any feeder: [code, feeders, premises]. */
export const DEAD_SUBSTATIONS: [string, number, number][] = [
  ['SUB-38', 2, 2],
  ['SUB-39', 1, 4],
  ['SUB-40', 2, 3],
  ['SUB-41', 1, 1],
  ['SUB-42', 1, 1],
  ['SUB-43', 1, 1],
  ['SUB-44', 1, 3],
  ['SUB-45', 1, 1],
  ['SUB-46', 1, 1],
  ['SUB-47', 1, 1],
  ['SUB-48', 1, 1],
  ['SUB-49', 1, 1],
  ['SUB-50', 1, 2],
  ['SUB-51', 1, 1],
];

export interface LiveFeederSpec {
  known: number;
  unenrolled: number;
  premises: number;
  /** Enrolled EVs also detected by Net2Grid. Default round(known × 0.78). */
  confirmed?: number;
  /** Ground-truth validated EVs. Default round(evs × 0.15). */
  groundTruth?: number;
}

/**
 * Feeders with per-customer data. SUB-01 is fully live; the other entries are the
 * "worst blind spots" so their Target buttons produce a real audience.
 */
export const LIVE_FEEDERS: Record<string, LiveFeederSpec> = {
  'SUB-01-F1': { known: 69, unenrolled: 77, premises: 665, confirmed: 54, groundTruth: 23 },
  'SUB-01-F2': { known: 46, unenrolled: 44, premises: 650 },
  'SUB-01-F3': { known: 38, unenrolled: 35, premises: 500 },
  'SUB-01-F4': { known: 15, unenrolled: 34, premises: 460 },
  'SUB-01-F5': { known: 23, unenrolled: 21, premises: 300 },
  'SUB-01-F6': { known: 19, unenrolled: 19, premises: 250 },
  'SUB-01-F7': { known: 12, unenrolled: 11, premises: 170 },
  'SUB-26-F1': { known: 2, unenrolled: 15, premises: 48 },
  'SUB-15-F3': { known: 2, unenrolled: 13, premises: 80 },
  'SUB-11-F2': { known: 5, unenrolled: 28, premises: 143 },
  'SUB-11-F3': { known: 5, unenrolled: 24, premises: 103 },
  'SUB-27-F1': { known: 3, unenrolled: 13, premises: 80 },
  'SUB-09-F1': { known: 10, unenrolled: 23, premises: 355 },
  'SUB-11-F1': { known: 11, unenrolled: 25, premises: 148 },
};

/** Headline figures from the source, which live feeders adjust by their deltas. */
export const HEADLINE = {
  knownEvs: 1726,
  unenrolledEvs: 1770,
  matchedPremises: 21257,
  noSignalPremises: 17761,
  noLocationPremises: 458,
  partiallyDeadSubstations: 25,
  deadFeeders: 55,
  deadFeederPremises: 383,
  dataSourceNote: `${BRAND.partners.evDetection} feeder EV visibility pilot, anonymized (Sep 2026). Shown as sample data.`,
};

export const FIRST_NAMES = [
  'Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Lucas', 'Mia', 'Mason', 'Amelia', 'Logan', 'Harper',
  'Owen', 'Chloe', 'Jacob', 'Zoe', 'Benjamin', 'Leah', 'Samuel', 'Nora', 'Daniel', 'Hannah', 'Arjun', 'Mei', 'Omar',
  'Fatima', 'Raj', 'Ana', 'Mateo', 'Grace', 'Wei', 'Aisha', 'Kevin', 'Sara', 'Tyler', 'Isla', 'Hugo', 'Ines', 'Theo',
];
export const LAST_NAMES = [
  'Smith', 'Brown', 'Tremblay', 'Martin', 'Roy', 'Wilson', 'MacDonald', 'Gagnon', 'Johnson', 'Taylor', 'Campbell',
  'Anderson', 'Leblanc', 'Lee', 'White', 'Thompson', 'Patel', 'Singh', 'Nguyen', 'Chen', 'Wong', 'Murphy', 'Kelly',
  'Scott', 'Clarke', 'Stewart', 'Bouchard', 'Gauthier', 'Morin', 'Lavoie',
];
export const STREETS = [
  'Main St', 'Lakeview Dr', 'Water St', 'George St', 'Park St N', 'Charlotte St', 'Hunter St W', 'Lansdowne St',
  'Monaghan Rd', 'Armour Rd', 'Chemong Rd', 'Sherbrooke St', 'Brock St', 'Rubidge St', 'Aylmer St', 'Simcoe St',
  'Parkhill Rd', 'Weller St', 'Erskine Ave', 'Clonsilla Ave',
];
export const TOWN: string = BRAND.demoTown;

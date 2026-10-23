/** Small formatting helpers used by both front ends. Timezone is the utility's (Ontario). */
export const DEMO_TZ = 'America/Toronto';

export function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function fmtInt(n: number): string {
  return n.toLocaleString('en-CA');
}

export function fmtKwh(n: number, digits = 1): string {
  return `${n.toFixed(digits)} kWh`;
}

export function fmtKw(n: number, digits = 1): string {
  return `${n.toFixed(digits)} kW`;
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: DEMO_TZ });
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  return new Date(iso).toLocaleDateString('en-US', { ...opts, timeZone: DEMO_TZ });
}

/** "5–8 PM" style window label. */
export function fmtWindow(startIso: string, endIso: string): string {
  const h = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: DEMO_TZ }).replace(':00', '');
  const s = h(startIso);
  const e = h(endIso);
  const sp = s.slice(-2);
  const ep = e.slice(-2);
  return sp === ep ? `${s.slice(0, -3)}–${e}` : `${s}–${e}`;
}

/** "Yesterday" / "Oct 15" / "4:12 PM" relative label for inbox items. */
export function fmtRelative(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: DEMO_TZ });
  if (day(d) === day(now)) return fmtTime(iso);
  const y = new Date(now.getTime() - 86400000);
  if (day(d) === day(y)) return 'Yesterday';
  return fmtDate(iso, { month: 'short', day: 'numeric' });
}

export function minutesUntil(iso: string, now = Date.now()): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - now) / 60000));
}

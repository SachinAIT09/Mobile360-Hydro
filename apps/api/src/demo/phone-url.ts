import { networkInterfaces } from 'node:os';
import type { Request } from 'express';

/** Origin the request was made to, honouring reverse-proxy headers. */
export function originOf(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host;
  return `${proto}://${host}`;
}

/** First non-internal IPv4 address of this machine (what a phone on the same Wi-Fi can reach). */
export function lanAddress(): string | undefined {
  const virtual = /vethernet|wsl|hyper-v|virtualbox|vmware|docker|vbox|tailscale|zerotier/i;
  const candidates: { name: string; address: string }[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal) candidates.push({ name, address: i.address });
    }
  }
  // Prefer a physical adapter (Wi-Fi/Ethernet) over virtual ones like WSL or Docker.
  return (candidates.find((c) => !virtual.test(c.name)) ?? candidates[0])?.address;
}

/**
 * The origin a phone should open. "localhost" on a phone is the phone itself, so when the page was
 * opened via a loopback address we swap in this machine's LAN IP (keeping the port).
 */
export function phoneOrigin(req: Request): string {
  const origin = originOf(req);
  const url = new URL(origin);
  const loopback = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'];
  if (!loopback.includes(url.hostname) && !loopback.includes(url.host)) return origin;
  const lan = lanAddress();
  if (!lan) return origin;
  url.hostname = lan;
  return url.origin;
}

/** Full URL of the customer app for a phone (served at /app in production). */
export function phoneAppUrl(req: Request): string {
  return `${phoneOrigin(req)}/app`;
}

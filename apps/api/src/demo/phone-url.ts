import { networkInterfaces } from 'node:os';
import type { Request } from 'express';

type HeaderBag = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim() || undefined;

/**
 * Public origin from request headers, pure so it can be tested. Reverse proxies don't all agree:
 * Catalyst AppSail forwards HTTPS traffic as "http" with host "<name>:443", which produced
 * http://…:443 (a 400 for phones scanning the QR code). Port 443 therefore means https, the
 * default port for the scheme is dropped, and PUBLIC_URL (e.g. a custom domain) wins outright.
 */
export function originFrom(headers: HeaderBag, protocol: string, publicUrl?: string): string {
  if (publicUrl && /^https?:\/\//i.test(publicUrl)) return new URL(publicUrl).origin;
  let proto = (first(headers['x-forwarded-proto']) || protocol || 'http').toLowerCase().replace(/:$/, '');
  if ((first(headers['x-forwarded-ssl']) ?? '').toLowerCase() === 'on') proto = 'https';
  let host = first(headers['x-forwarded-host']) || first(headers.host) || 'localhost';
  const fwdPort = first(headers['x-forwarded-port']);
  const m = /^(.*?)(?::(\d+))?$/.exec(host);
  const hostname = m?.[1] ?? host;
  const port = m?.[2] ?? (fwdPort && !host.includes(':') ? fwdPort : undefined);
  if (port === '443') proto = 'https';
  const isDefault = (proto === 'https' && port === '443') || (proto === 'http' && port === '80');
  host = port && !isDefault ? `${hostname}:${port}` : hostname;
  return `${proto}://${host}`;
}

/** Origin the request was made to, honouring reverse-proxy headers (and PUBLIC_URL when set). */
export function originOf(req: Request): string {
  return originFrom(req.headers, req.protocol, process.env.PUBLIC_URL);
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

/**
 * True when the URL only works inside this computer's network: loopback, private IPv4 ranges or *.local.
 * Then a phone must be on the same Wi-Fi; a public host (Catalyst, a custom domain) works from anywhere.
 */
export function isLocalNetworkUrl(url: string): boolean {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
}

/** Full URL of the customer app for a phone (served at /app in production). */
export function phoneAppUrl(req: Request): string {
  return `${phoneOrigin(req)}/app`;
}

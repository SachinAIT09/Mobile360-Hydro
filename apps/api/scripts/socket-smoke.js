// Socket smoke test: logs in as staff + the demo customers and prints every realtime event received.
// Usage (API running):  node apps/api/scripts/socket-smoke.js [seconds=60] [apiUrl=http://localhost:3000]
import { io } from 'socket.io-client';

const seconds = Number(process.argv[2] || 60);
const API = process.argv[3] || process.env.API_URL || 'http://localhost:3000';
const accounts = ['staff@demo.test', 'manny@demo.test', 'priya@demo.test'];

async function login(email) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo' }),
  });
  if (!res.ok) throw new Error(`login ${email} failed: ${res.status}`);
  return (await res.json()).token;
}

const counts = {};
const sockets = [];
for (const email of accounts) {
  const who = email.split('@')[0];
  const token = await login(email);
  const s = io(API, { auth: { token }, transports: ['websocket'] });
  s.on('connect', () => console.log(`[${who}] connected`));
  s.on('disconnect', (r) => console.log(`[${who}] disconnected: ${r}`));
  s.onAny((event, payload) => {
    const key = `${who}:${event}`;
    counts[key] = (counts[key] || 0) + 1;
    if (event === 'energy:reading' && counts[key] > 1) return; // print the first reading only
    const brief = payload && typeof payload === 'object'
      ? JSON.stringify(payload).slice(0, 160)
      : String(payload ?? '');
    console.log(`[${who}] ${event} ${brief}`);
  });
  sockets.push(s);
}

setTimeout(() => {
  console.log('\nEvent counts:');
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k}: ${v}`);
  for (const s of sockets) s.close();
  process.exit(0);
}, seconds * 1000);

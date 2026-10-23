#!/usr/bin/env node
/**
 * Post-process `expo export --platform web`: Expo names route chunks after their URL pattern, e.g.
 * `_expo/static/js/web/[id]-<hash>.js` for app/messages/[id].tsx. Browsers request that path with raw
 * square brackets, which some hosting proxies reject (Zoho Catalyst AppSail answers 400), so the screen
 * never loads. Rename such files ([ and ] become _) and rewrite every reference to them.
 *
 *   node scripts/fix-export-names.mjs dist
 */
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

const root = process.argv[2] || 'dist';
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const files = walk(root);
const renames = files
  .filter((p) => /[[\]]/.test(basename(p)))
  .map((p) => ({ from: p, to: join(dirname(p), basename(p).replace(/[[\]]/g, '_')) }));

if (renames.length === 0) {
  console.log('fix-export-names: no bracketed file names.');
  process.exit(0);
}

for (const r of renames) renameSync(r.from, r.to);

// Rewrite references in text assets. File names include a content hash, so the replace is exact.
const textFiles = walk(root).filter((p) => /\.(js|html|json|map|css)$/.test(p));
let edits = 0;
for (const f of textFiles) {
  let s = readFileSync(f, 'utf8');
  let changed = false;
  for (const r of renames) {
    const a = basename(r.from);
    const b = basename(r.to);
    for (const variant of [a, encodeURI(a), a.replace(/\[/g, '%5B').replace(/\]/g, '%5D')]) {
      if (s.includes(variant)) {
        s = s.split(variant).join(b);
        changed = true;
      }
    }
  }
  if (changed) {
    writeFileSync(f, s);
    edits++;
  }
}
for (const r of renames) console.log(`fix-export-names: ${relative(root, r.from)} -> ${basename(r.to)}`);
console.log(`fix-export-names: updated references in ${edits} file(s).`);

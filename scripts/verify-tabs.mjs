import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const tabRe = /data-tab="([^"]+)"/g;
const panelRe = /id="(panel-[^"]+)"/g;
const tabs = new Set();
let m;
while ((m = tabRe.exec(html))) tabs.add(m[1]);
const panels = new Set();
while ((m = panelRe.exec(html))) panels.add(m[1]);

const missing = [];
for (const t of tabs) {
  if (!panels.has('panel-' + t)) missing.push(t);
}
const orphan = [];
for (const p of panels) {
  const id = p.replace(/^panel-/, '');
  if (!tabs.has(id)) orphan.push(p);
}

console.log('data-tab únicos:', tabs.size);
console.log('panel-* en HTML:', panels.size);
if (missing.length) console.log('ERROR: data-tab sin panel:', missing.join(', '));
else console.log('OK: cada data-tab tiene id panel-*');
if (orphan.length) console.log('Nota: panel sin tab en sidebar (puede ser OK):', orphan.join(', '));

process.exit(missing.length ? 1 : 0);

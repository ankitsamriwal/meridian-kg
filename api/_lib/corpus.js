import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'corpus');

export function readStructured(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'structured', name), 'utf8'));
}

export function readRoster() {
  const csv = fs.readFileSync(path.join(ROOT, 'structured', 'project_roster.csv'), 'utf8');
  const [head, ...lines] = csv.trim().split('\n');
  const cols = head.split(',');
  return lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
}

export function listUnstructured() {
  return fs.readdirSync(path.join(ROOT, 'unstructured')).filter(f => f.endsWith('.md'));
}

export function readUnstructured(file) {
  const raw = fs.readFileSync(path.join(ROOT, 'unstructured', file), 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    let v = line.slice(i + 1).trim();
    if (v.startsWith('[')) v = JSON.parse(v.replace(/(\w+)/g, '"$1"'));
    meta[line.slice(0, i).trim()] = v;
  }
  return { meta, body: m[2].trim() };
}

export function chunkText(body, docId, maxLen = 900) {
  const paras = body.split(/\n(?=#|\*\*|- )|\n\n+/).map(s => s.trim()).filter(s => s.length > 30);
  const chunks = [];
  let buf = '', seq = 0;
  for (const p of paras) {
    if ((buf + '\n' + p).length > maxLen && buf) { chunks.push({ seq: seq++, content: buf.trim() }); buf = ''; }
    buf += (buf ? '\n' : '') + p;
  }
  if (buf.trim()) chunks.push({ seq: seq++, content: buf.trim() });
  return chunks;
}

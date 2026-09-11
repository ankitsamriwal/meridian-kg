import fs from 'node:fs';
import path from 'node:path';

let cache = null;
export function loadGraph() {
  if (!cache) {
    const p = path.join(process.cwd(), 'data', 'graph.json');
    cache = JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return cache;
}

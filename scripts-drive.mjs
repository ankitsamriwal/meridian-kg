import fs from 'node:fs';
const BASE = 'https://meridian-kg.vercel.app';
const SEC = fs.readFileSync('/tmp/extract_secret', 'utf8').trim();
const j = r => r.json();
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j);

const structured = await fetch(`${BASE}/api/admin/run-pipeline?stage=structured&secret=${SEC}`).then(j);
console.log('structured:', structured.entities?.length, 'entities,', structured.edges?.length, 'edges');
const { docs } = await fetch(`${BASE}/api/admin/run-pipeline?stage=docs&secret=${SEC}`).then(j);
const extracted = [];
const known = [...structured.entities];
for (const doc of docs) {
  const part = await post(`${BASE}/api/admin/run-pipeline?stage=extract&doc=${doc}&secret=${SEC}`, { knownEntities: known });
  if (part.error) { console.log('EXTRACT FAIL', doc, part.error); process.exit(1); }
  console.log('extracted', doc, '->', part.newEntities?.length, 'new entities,', part.edges?.length, 'edges,', part.chunks?.length, 'chunks');
  extracted.push(part);
  known.push(...part.newEntities);
}
const graph = await post(`${BASE}/api/admin/run-pipeline?stage=assemble&secret=${SEC}`, { structured, extracted });
if (graph.error) { console.log('ASSEMBLE FAIL', graph.error); process.exit(1); }
console.log('assembled:', graph.entities.length, 'entities,', graph.edges.length, 'edges,', graph.chunks.length, 'chunks,', graph.resolution_log.length, 'merges');
console.log('merges:', JSON.stringify(graph.resolution_log, null, 1));
fs.writeFileSync('data/graph.json', JSON.stringify(graph));
console.log('written data/graph.json', fs.statSync('data/graph.json').size, 'bytes');

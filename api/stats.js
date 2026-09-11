import { select } from './_lib/store.js';

export default async function handler(req, res) {
  try {
    const [docs, chunks, entities, edges, log] = await Promise.all([
      select('documents', 'select=id,kind'),
      select('chunks', 'select=id'),
      select('entities', 'select=id,origin'),
      select('edges', 'select=id,origin'),
      select('resolution_log', 'select=merged,canonical,method,score&order=id.desc&limit=50'),
    ]);
    res.json({
      documents: docs.length, structured_docs: docs.filter(d => d.kind === 'structured').length,
      unstructured_docs: docs.filter(d => d.kind !== 'structured').length,
      chunks: chunks.length, entities: entities.length,
      entities_structured: entities.filter(e => e.origin === 'structured').length,
      entities_extracted: entities.filter(e => e.origin === 'extracted').length,
      edges: edges.length,
      edges_direct: edges.filter(e => e.origin === 'direct').length,
      edges_llm: edges.filter(e => e.origin === 'llm').length,
      merges: log,
    });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
}

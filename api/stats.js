import { loadGraph } from './_lib/graphstore.js';

export default async function handler(req, res) {
  try {
    const g = loadGraph();
    res.json({
      generated_at: g.generated_at,
      documents: g.documents.length,
      structured_docs: g.documents.filter(d => d.kind === 'structured').length,
      unstructured_docs: g.documents.filter(d => d.kind !== 'structured').length,
      chunks: g.chunks.length,
      entities: g.entities.length,
      entities_structured: g.entities.filter(e => e.origin === 'structured').length,
      entities_extracted: g.entities.filter(e => e.origin === 'extracted').length,
      edges: g.edges.length,
      edges_direct: g.edges.filter(e => e.origin === 'direct').length,
      edges_llm: g.edges.filter(e => e.origin === 'llm').length,
      merges: (g.resolution_log || []).slice(0, 50),
    });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
}

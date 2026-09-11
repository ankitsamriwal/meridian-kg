import { generate, embed } from './_lib/gemini.js';
import { select, rpc } from './_lib/store.js';

export const config = { maxDuration: 60 };
const ROLES = ['exec', 'team', 'client'];
const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { question, role = 'team' } = req.body || {};
  if (!question || !ROLES.includes(role)) return res.status(400).json({ error: 'question and valid role required' });
  try {
    // 1. Hybrid retrieval, step 1: vector search over chunks (role-filtered at query time)
    const [qVec] = await embed([question], 'RETRIEVAL_QUERY');
    const hits = await rpc('match_chunks', { query_embedding: JSON.stringify(qVec), match_count: 8, roles: [role] });

    // 2. Step 2: seed entities from the question and from retrieved chunks, then traverse the graph
    const entities = await select('entities', 'select=id,name,type,aliases,permission_roles');
    const visible = entities.filter(e => (e.permission_roles || []).includes(role));
    const qNorm = ' ' + norm(question) + ' ';
    const seeds = new Set();
    for (const e of visible) {
      const names = [e.name, ...(e.aliases || [])].map(norm).filter(n => n.length > 2);
      if (names.some(n => qNorm.includes(' ' + n) || qNorm.includes(' ' + n + ' ') || qNorm.includes(n + ' '))) seeds.add(e.id);
    }
    for (const h of hits) {
      const cNorm = ' ' + norm(h.content) + ' ';
      for (const e of visible) {
        const names = [e.name, ...(e.aliases || [])].map(norm).filter(n => n.length > 3);
        if (names.some(n => cNorm.includes(' ' + n + ' '))) seeds.add(e.id);
      }
    }
    const edges = await select('edges', 'select=src,dst,relation,confidence,provenance,origin,permission_roles');
    const allowed = edges.filter(e => (e.permission_roles || []).includes(role));
    // BFS 2 hops from seeds
    const inPath = new Set(), pathEdges = [];
    let frontier = [...seeds];
    for (let hop = 0; hop < 2; hop++) {
      const next = new Set();
      for (const e of allowed) {
        if (frontier.includes(e.src) || frontier.includes(e.dst)) {
          if (pathEdges.length < 60 && !pathEdges.includes(e)) pathEdges.push(e);
          if (!inPath.has(e.src)) { inPath.add(e.src); next.add(e.src); }
          if (!inPath.has(e.dst)) { inPath.add(e.dst); next.add(e.dst); }
        }
      }
      frontier = [...next];
    }
    seeds.forEach(s => inPath.add(s));
    const nodeById = new Map(visible.map(e => [e.id, e]));
    const pathNodes = [...inPath].map(id => nodeById.get(id)).filter(Boolean);
    const triples = pathEdges.map(e => {
      const s = nodeById.get(e.src)?.name || e.src, d = nodeById.get(e.dst)?.name || e.dst;
      const prov = e.provenance?.[0];
      return `${s} -[${e.relation}]-> ${d} (confidence ${e.confidence}${prov?.title ? `, source: ${prov.title}` : ''}${e.origin === 'llm' ? ', LLM-extracted' : ', direct-mapped'})`;
    });
    const docIds = [...new Set(hits.map(h => h.document_id))];
    const docs = (await select('documents', `select=id,title,source_system,author,doc_date,kind,permission_roles&id=in.(${docIds.join(',')})`))
      .filter(d => (d.permission_roles || []).includes(role));

    // 3. Synthesize with the LLM, grounded only in retrieved graph + chunks
    const prompt = `You are Meridian, an enterprise knowledge graph assistant for a Dynamics 365 client engagement (fictional POC data).
Answer ONLY from the context below. If the context does not contain the answer, say what the graph does and does not know. Never invent facts.
Every claim must trace to a source document or a graph relationship. Cite sources inline like [Source: <title>].
The querier's access role is "${role}" - data not visible to this role was excluded BEFORE you saw it; if the question touches restricted material (e.g. commercials for a non-exec), say the information exists but is outside this role's access.

GRAPH RELATIONSHIPS (traversal path from the question):
${triples.slice(0, 50).join('\n') || '(none)'}

SOURCE EXCERPTS (vector-retrieved chunks):
${hits.map(h => `--- from "${docs.find(d => d.id === h.document_id)?.title || h.document_id}" ---\n${h.content}`).join('\n\n') || '(none)'}

QUESTION: ${question}

Answer concisely (2-6 sentences), verdict first.`;

    const answer = await generate(prompt);
    res.json({
      answer,
      role,
      path: {
        nodes: pathNodes.map(n => ({ id: n.id, name: n.name, type: n.type })),
        edges: pathEdges.map(e => ({ src: e.src, dst: e.dst, relation: e.relation, confidence: e.confidence, origin: e.origin, provenance: e.provenance?.[0] || null })),
      },
      sources: docs.map(d => ({ id: d.id, title: d.title, kind: d.kind, author: d.author, date: d.doc_date, source_system: d.source_system })),
      stats: { chunks_retrieved: hits.length, seed_entities: seeds.size, path_nodes: pathNodes.length, path_edges: pathEdges.length },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

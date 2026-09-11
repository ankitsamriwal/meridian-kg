import { generate, embed } from './_lib/gemini.js';
import { loadGraph } from './_lib/graphstore.js';

export const config = { maxDuration: 60 };
const ROLES = ['exec', 'team', 'client'];
const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const cos = (x, y) => x.length === y.length ? x.reduce((s, v, i) => s + v * y[i], 0) / ((Math.hypot(...x) * Math.hypot(...y)) || 1) : 0;
const localEmbed = (text, dim) => { const v=Array(dim).fill(0); for(const w of norm(text).split(' ')){let h=2166136261;for(const c of w){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}v[Math.abs(h)%dim]+=1;}const n=Math.hypot(...v)||1;return v.map(x=>x/n); };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { question, role = 'team', graph: suppliedGraph } = req.body || {};
  if (!question || !ROLES.includes(role)) return res.status(400).json({ error: 'question and valid role required' });
  try {
    const g = suppliedGraph && Array.isArray(suppliedGraph.entities) && Array.isArray(suppliedGraph.edges) && Array.isArray(suppliedGraph.chunks) ? suppliedGraph : loadGraph();
    const visible = g.entities.filter(e => (e.permission_roles || []).includes(role));
    const nodeById = new Map(visible.map(e => [e.id, e]));
    const allowedEdges = g.edges.filter(e => (e.permission_roles || []).includes(role) && nodeById.has(e.src) && nodeById.has(e.dst));
    const allowedChunks = g.chunks.filter(c => (c.permission_roles || []).includes(role));

    // 1. vector retrieval over role-filtered chunks
    let qVec;
    const dim = allowedChunks[0]?.embedding?.length || 256;
    try { [qVec] = await embed([question], 'RETRIEVAL_QUERY'); if(qVec.length !== dim) qVec = localEmbed(question, dim); }
    catch { qVec = localEmbed(question, dim); }
    const scored = allowedChunks.map(c => ({ c, s: cos(qVec, c.embedding) })).sort((a, b) => b.s - a.s);
    const hits = scored.slice(0, 8).filter(h => h.s > 0.55);

    // 2. seed entities: named in the question or in retrieved chunks
    const qNorm = ' ' + norm(question) + ' ';
    const names = e => [e.name, ...(e.aliases || [])].map(norm).filter(n => n.length > 2);
    const seeds = new Set();
    for (const e of visible) if (names(e).some(n => qNorm.includes(' ' + n) || qNorm.includes(n))) seeds.add(e.id);
    for (const h of hits) {
      const cNorm = ' ' + norm(h.c.content) + ' ';
      for (const e of visible) if (names(e).some(n => n.length > 3 && cNorm.includes(' ' + n + ' '))) seeds.add(e.id);
    }

    // 3. graph traversal: BFS 2 hops from seeds over role-filtered edges
    const inPath = new Set(seeds), pathEdges = [];
    let frontier = [...seeds];
    for (let hop = 0; hop < 2; hop++) {
      const next = new Set();
      for (const e of allowedEdges) {
        if (frontier.includes(e.src) || frontier.includes(e.dst)) {
          if (pathEdges.length < 60 && !pathEdges.includes(e)) pathEdges.push(e);
          for (const id of [e.src, e.dst]) if (!inPath.has(id)) { inPath.add(id); next.add(id); }
        }
      }
      frontier = [...next];
    }
    const pathNodes = [...inPath].map(id => nodeById.get(id)).filter(Boolean);
    const triples = pathEdges.map(e => {
      const s = nodeById.get(e.src)?.name || e.src, d = nodeById.get(e.dst)?.name || e.dst;
      const prov = e.provenance?.[0];
      return `${s} -[${e.relation}]-> ${d} (confidence ${e.confidence}${prov?.title ? `, source: ${prov.title}` : ''}${e.origin === 'llm' ? ', LLM-extracted' : ', direct-mapped'})`;
    });
    const docIds = [...new Set(hits.map(h => h.c.document_id))];
    const docs = g.documents.filter(d => docIds.includes(d.id) && (d.permission_roles || []).includes(role));

    // 4. synthesize grounded answer
    const prompt = `You are Meridian, an enterprise knowledge graph assistant. The active graph may come from user-uploaded documents or the included demonstration corpus.
Answer ONLY from the context below. If the context does not contain the answer, say what the graph does and does not know. Never invent facts.
Every claim must trace to a source document or a graph relationship. Cite sources inline like [Source: <title>].
The querier's access role is "${role}" - data not visible to this role was excluded BEFORE you saw it. If the question touches material this role cannot see (e.g. pricing for non-exec), say the information exists in the engagement record but is outside this role's access.

GRAPH RELATIONSHIPS (traversal path from the question):
${triples.slice(0, 50).join('\n') || '(none)'}

SOURCE EXCERPTS (vector-retrieved chunks):
${hits.map(h => `--- from "${docs.find(d => d.id === h.c.document_id)?.title || h.c.document_id}" ---\n${h.c.content}`).join('\n\n') || '(none)'}

QUESTION: ${question}

Answer concisely (2-6 sentences), verdict first.`;
    let answer;
    try { answer = await generate(prompt); }
    catch {
      const qwords = new Set(norm(question).split(' ').filter(w => w.length > 3));
      const ranked = pathEdges.map(e => { const sn=nodeById.get(e.src)?.name||e.src, dn=nodeById.get(e.dst)?.name||e.dst; const words=norm(`${sn} ${dn} ${e.relation}`).split(' '); return {e,sn,dn,score:words.filter(w=>qwords.has(w)).length}; }).sort((a,b)=>b.score-a.score);
      const best = ranked[0];
      if (best && best.score) { const title=best.e.provenance?.[0]?.title; answer = `The graph shows ${best.sn} ${best.e.relation.replace(/_/g,' ')} ${best.dn}.${title ? ` [Source: ${title}]` : ''}`; }
      else if (hits[0]) { const title=docs.find(d=>d.id===hits[0].c.document_id)?.title||hits[0].c.document_id; answer=`The closest evidence in the active graph is: ${hits[0].c.content.slice(0,500)} [Source: ${title}]`; }
      else answer='The active graph does not contain enough evidence to answer that question.';
    }
    res.json({
      answer, role,
      path: {
        nodes: pathNodes.map(n => ({ id: n.id, name: n.name, type: n.type })),
        edges: pathEdges.map(e => ({ src: e.src, dst: e.dst, relation: e.relation, confidence: e.confidence, origin: e.origin, provenance: e.provenance?.[0] || null })),
      },
      sources: docs.map(d => ({ id: d.id, title: d.title, kind: d.kind, author: d.author, date: d.doc_date, source_system: d.source_system })),
      stats: { chunks_retrieved: hits.length, seed_entities: seeds.size, path_nodes: pathNodes.length, path_edges: pathEdges.length },
    });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
}

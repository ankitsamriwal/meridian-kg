import { generate, embed } from './_lib/gemini.js';

export const config = { maxDuration: 60 };
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const slug = s => norm(s).replace(/ /g, '-').slice(0, 80) || 'item';
const eid = (type, name) => `${type}:${slug(name)}`;
const TYPES = new Set(['person','client','org','system','project','task','risk','requirement','repository','module','document','concept']);

function chunks(text, max = 1100) {
  const parts = text.split(/\n(?=#|\*\*|- )|\n\n+/).map(x => x.trim()).filter(x => x.length > 20);
  const out = []; let buf = '';
  for (const p of parts) { if (buf && (buf + '\n' + p).length > max) { out.push(buf); buf = ''; } buf += (buf ? '\n' : '') + p; }
  if (buf) out.push(buf); return out.slice(0, 12);
}

function fallbackExtract(doc) {
  const entities = [], relations = [], seen = new Map();
  const add = (name, type='concept') => { name=String(name).trim().replace(/[.,;:]$/,''); if(name.length<2) return name; const k=norm(name); if(!seen.has(k)){seen.set(k,name);entities.push({name,type,aliases:[]});} return seen.get(k); };
  const patterns = [
    [/([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})\s+(?:designed|architected)\s+(?:the\s+)?([^.;\n]+)/g,'person','concept','designed'],
    [/([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})\s+(?:owns|owned)\s+(?:risk\s+)?([^.;\n]+)/g,'person','risk','owns_risk'],
    [/([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})\s+(?:authored|wrote)\s+(?:the\s+)?([^.;\n]+)/g,'person','document','authored'],
    [/(?:Requirement\s+)?([A-Z]{2,10}-?\d{1,6})\s+(?:says|requires|states)?\s*([^.;\n]+)/g,'requirement','concept','requires']
  ];
  for(const [re,st,dt,rel] of patterns) for(const m of doc.text.matchAll(re)){ const a=add(m[1],st), b=add(m[2],dt); if(a&&b) relations.push({src:a,dst:b,relation:rel,confidence:.82,evidence:m[0]}); }
  for(const m of doc.text.matchAll(/\b(Project [A-Z][A-Za-z0-9 -]{2,40})/g)) add(m[1],'project');
  for(const m of doc.text.matchAll(/\b(risk [A-Z]?-?\d{1,5})\b/gi)) add(m[1],'risk');
  return {entities,relations};
}
function localEmbed(text, dim=256){ const v=Array(dim).fill(0); for(const w of norm(text).split(' ')){let h=2166136261;for(const c of w){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}v[Math.abs(h)%dim]+=1;} const n=Math.hypot(...v)||1;return v.map(x=>x/n); }

async function extractDoc(doc) {
  const prompt = `Extract an enterprise knowledge graph from this user-supplied document. Use only facts stated in the text. Never guess names, dates, roles, numbers, authors, ownership, or relationships.
Return JSON exactly as {"entities":[{"name":"...","type":"person|client|org|system|project|task|risk|requirement|repository|module|concept","aliases":[]}],"relations":[{"src":"exact entity name","dst":"exact entity name","relation":"short_snake_case","confidence":0.0,"evidence":"short exact support"}]}.
Every relation endpoint must appear in entities. Keep distinct numbered requirements/tasks distinct. Document: ${doc.name}\n\n${doc.text.slice(0, 16000)}`;
  let result;
  try { result = await generate(prompt, { json: true }); }
  catch { result = fallbackExtract(doc); }
  return { doc, result };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const docs = Array.isArray(req.body?.documents) ? req.body.documents : [];
    if (!docs.length) return res.status(400).json({ error: 'Add at least one readable document.' });
    if (docs.length > 12) return res.status(400).json({ error: 'Upload up to 12 documents per graph.' });
    let total = 0;
    const clean = docs.map((d, i) => {
      const name = String(d.name || `Document ${i + 1}`).slice(0, 180);
      const text = String(d.text || '').trim(); total += text.length;
      return { name, text, kind: String(d.kind || 'document').slice(0, 40) };
    }).filter(d => d.text.length >= 20);
    if (!clean.length) return res.status(400).json({ error: 'No readable text was found in those files.' });
    if (total > 120000) return res.status(413).json({ error: 'This batch is too large. Keep it under 120,000 extracted characters.' });

    const extracted = await Promise.all(clean.map(extractDoc));
    const entityMap = new Map(), edges = [], documents = [], chunkRows = [];
    for (let di = 0; di < extracted.length; di++) {
      const { doc, result } = extracted[di];
      const docId = `upload:${di}:${slug(doc.name)}`;
      documents.push({ id: docId, title: doc.name, source_system: 'User upload', author: '', doc_date: '', kind: doc.kind, permission_roles: ['exec','team','client'] });
      const local = new Map();
      for (const raw of result.entities || []) {
        const name = String(raw.name || '').trim(); if (!name) continue;
        const type = TYPES.has(raw.type) ? raw.type : 'concept';
        const key = `${type}|${norm(name)}`;
        let e = entityMap.get(key);
        if (!e) { e = { id: eid(type, name), name, type, aliases: [], attrs: {}, origin: 'extracted', permission_roles: ['exec','team','client'] }; entityMap.set(key, e); }
        e.aliases = [...new Set([...(e.aliases || []), ...(raw.aliases || []).map(String).filter(Boolean)])];
        local.set(norm(name), e);
        for (const a of e.aliases) local.set(norm(a), e);
      }
      const docEntity = { id: eid('document', `${di}-${doc.name}`), name: doc.name, type: 'document', aliases: [], attrs: { doc_id: docId }, origin: 'structured', permission_roles: ['exec','team','client'] };
      entityMap.set(`document|${di}|${norm(doc.name)}`, docEntity);
      for (const r of result.relations || []) {
        const s = local.get(norm(r.src)), d = local.get(norm(r.dst)); if (!s || !d || s.id === d.id) continue;
        edges.push({ src: s.id, dst: d.id, relation: String(r.relation || 'related_to').replace(/[^a-z0-9_]/gi, '_').toLowerCase(), confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0.7)), origin: 'llm', provenance: [{ doc_id: docId, title: doc.name, source: 'User upload', excerpt: String(r.evidence || '').slice(0, 260) }], permission_roles: ['exec','team','client'] });
      }
      for (const content of chunks(doc.text)) chunkRows.push({ document_id: docId, seq: chunkRows.length, content, permission_roles: ['exec','team','client'] });
    }
    let vectors;
    try { vectors = await embed(chunkRows.map(c => c.content)); }
    catch { vectors = chunkRows.map(c => localEmbed(c.content)); }
    chunkRows.forEach((c, i) => c.embedding = vectors[i]);
    const seen = new Map();
    for (const e of edges) { const k = `${e.src}|${e.dst}|${e.relation}`; if (!seen.has(k)) seen.set(k, e); else seen.get(k).provenance.push(...e.provenance); }
    const graph = { generated_at: new Date().toISOString(), corpus_name: clean.length === 1 ? clean[0].name : `${clean.length} uploaded documents`, documents, chunks: chunkRows, entities: [...entityMap.values()], edges: [...seen.values()], resolution_log: [] };
    res.json({ graph, summary: { documents: documents.length, entities: graph.entities.length, edges: graph.edges.length, chunks: graph.chunks.length } });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
}

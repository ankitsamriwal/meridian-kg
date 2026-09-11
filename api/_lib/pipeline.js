import { readStructured, readRoster, listUnstructured, readUnstructured, chunkText } from './corpus.js';
import { generate, embed } from './gemini.js';

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const eid = (type, name) => `${type}:${slug(name)}`;
const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = s => norm(s).split(' ');

// ---------- Stage 1: structured skeleton (direct mapping, NO LLM) ----------
export function stageStructured() {
  const d365 = readStructured('d365_entities.json');
  const repo = readStructured('repo_graph.json');
  const roles = d365._meta.permission_roles;
  const documents = [
    { id: 'd365_export', title: 'Dynamics 365 CE export', source_system: d365._meta.source_system, author: 'system export', doc_date: d365._meta.exported_at, kind: 'structured', permission_roles: roles },
    { id: 'repo_export', title: 'Git repository export', source_system: repo._meta.source_system, author: 'system export', doc_date: repo._meta.exported_at, kind: 'structured', permission_roles: roles },
    { id: 'roster', title: 'Project roster', source_system: 'PMO roster (CSV)', author: 'system export', doc_date: d365._meta.exported_at, kind: 'structured', permission_roles: roles },
  ];
  const entities = [], edges = [];
  const E = (type, name, attrs = {}, perm = roles) =>
    entities.push({ id: eid(type, name), name, type, aliases: [], attrs, origin: 'structured', permission_roles: perm });
  const G = (s, d, relation, prov, perm = roles) =>
    edges.push({ src: eid(...s), dst: eid(...d), relation, confidence: 1.0, origin: 'direct', provenance: [prov], permission_roles: perm });
  const DOC = { doc_id: 'd365_export', title: 'Dynamics 365 CE export' };
  const RDOC = { doc_id: 'repo_export', title: 'Git repository export' };

  for (const p of [...d365.team, ...d365.contacts]) E('person', p.name, { role: p.role || p.title, org: p.org || 'Falcon Retail Group', email: p.email });
  for (const a of d365.accounts) E('client', a.name, a);
  for (const o of d365.opportunities) E('opportunity', o.name, o);
  for (const p of d365.projects) E('project', p.name, p);
  for (const t of d365.project_tasks) E('task', t.name, { status: t.status });
  E('repository', repo.repository.name, repo.repository);
  for (const m of repo.modules) E('module', m.name, { path: m.path });
  for (const s of ['Dynamics 365 Sales', 'Customer Insights', 'Power BI', 'Azure Data Lake']) E('system', s, {});

  const P = n => ['person', n];
  for (const a of d365.accounts) for (const c of d365.contacts.filter(c => c.account === a.id)) G(P(c.name), ['client', a.name], 'works_at', DOC);
  for (const o of d365.opportunities) {
    G(['opportunity', o.name], ['client', d365.accounts.find(a => a.id === o.account).name], 'for_client', DOC);
    G(P(d365.team.find(u => u.id === o.owner).name), ['opportunity', o.name], 'owns_opportunity', DOC);
    G(['opportunity', o.name], ['system', 'Dynamics 365 Sales'], 'implements', DOC);
  }
  for (const p of d365.projects) {
    G(['project', p.name], ['opportunity', d365.opportunities.find(o => o.id === p.opportunity).name], 'delivers', DOC);
    for (const t of d365.project_tasks.filter(t => t.project === p.id)) {
      G(['task', t.name], ['project', p.name], 'part_of', DOC);
      G(P(d365.team.find(u => u.id === t.owner).name), ['task', t.name], 'owns_task', DOC);
    }
  }
  G(['task', 'Customer Insights unification rules'], ['system', 'Customer Insights'], 'configures', DOC);
  G(['task', 'Loyalty program data model'], ['system', 'Customer Insights'], 'feeds', DOC);
  G(['task', 'Legacy CRM data migration - 212k contact records'], ['system', 'Azure Data Lake'], 'stages_in', DOC);
  for (const m of repo.modules) {
    G(['module', m.name], ['repository', repo.repository.name], 'in_repo', RDOC);
    for (const imp of m.imports) {
      const target = repo.modules.find(x => x.id === imp);
      if (target) G(['module', m.name], ['module', target.name], 'imports', RDOC);
    }
  }
  G(['repository', repo.repository.name], ['system', 'Dynamics 365 Sales'], 'integrates_with', RDOC);
  for (const c of repo.commits) G(P(c.author), ['repository', repo.repository.name], 'committed', { ...RDOC, excerpt: `${c.sha} ${c.message}` });
  for (const pr of repo.pull_requests) {
    G(P(pr.author), ['repository', repo.repository.name], 'opened_pr', { ...RDOC, excerpt: `PR #${pr.number}: ${pr.title}` });
    for (const r of pr.reviewers) G(P(r), P(pr.author), 'reviewed_pr_of', { ...RDOC, excerpt: `PR #${pr.number}` });
  }
  return { documents, entities, edges };
}

// ---------- Stage 2: LLM extraction over one unstructured doc ----------
export async function stageExtract(file, knownEntities) {
  const { meta, body } = readUnstructured(file);
  const doc = {
    id: meta.doc_id, title: meta.title, source_system: meta.source_system,
    author: meta.author, doc_date: meta.date, kind: meta.kind, permission_roles: meta.permission_roles,
  };
  const chunks = chunkText(body, doc.id);
  const known = knownEntities.map(e => `${e.name} (${e.type})`).join('; ');
  const prompt = `You are an information extraction engine for an enterprise knowledge graph.
Known entities already in the graph (reuse these exact names when the text refers to them): ${known}

Extract from the document below:
1. entities: people, clients, organizations, systems/products, projects, tasks, risks, requirements, repositories/modules. Each: {name, type, aliases[]}. Types: person|client|org|system|project|task|risk|requirement|repository|module. Reuse known names verbatim when the text refers to the same thing; put the variant it uses in aliases.
2. relations: {src, dst, relation, confidence 0-1, evidence}. relation is a short snake_case verb phrase (owns_risk, raised_concern, sponsors, depends_on, authored, decided, flagged). Use exact entity names from your entity list or the known list.
Only extract what the text states.

Document title: ${doc.title}
Document:
${body.slice(0, 6000)}

Return JSON: {"entities": [...], "relations": [...]}`;
  const out = await generate(prompt, { json: true });
  const roles = doc.permission_roles;
  const byNorm = new Map(knownEntities.map(e => [norm(e.name), e.id]));
  for (const e of knownEntities) for (const a of e.aliases || []) byNorm.set(norm(a), e.id);
  const newEntities = [], edgeRows = [];
  const resolveRef = name => byNorm.get(norm(name)) || null;
  for (const e of out.entities || []) {
    let id = resolveRef(e.name) || (e.aliases || []).map(resolveRef).find(Boolean);
    if (!id) {
      id = eid(e.type || 'concept', e.name);
      newEntities.push({ id, name: e.name, type: e.type || 'concept', aliases: e.aliases || [], attrs: {}, origin: 'extracted', permission_roles: roles });
      byNorm.set(norm(e.name), id);
      for (const a of e.aliases || []) byNorm.set(norm(a), id);
    }
  }
  for (const rel of out.relations || []) {
    const s = resolveRef(rel.src), d = resolveRef(rel.dst);
    if (!s || !d || s === d) continue;
    edgeRows.push({
      src: s, dst: d, relation: rel.relation, confidence: rel.confidence ?? 0.7, origin: 'llm',
      provenance: [{ doc_id: doc.id, title: doc.title, source: doc.source_system, date: doc.doc_date, excerpt: (rel.evidence || '').slice(0, 240) }],
      permission_roles: roles,
    });
  }
  const vectors = await embed(chunks.map(c => c.content));
  return {
    doc,
    chunks: chunks.map((c, i) => ({ document_id: doc.id, seq: c.seq, content: c.content, embedding: vectors[i], permission_roles: roles })),
    newEntities, edges: edgeRows,
  };
}

// ---------- Stage 3: assemble + entity resolution ----------
export async function stageAssemble(bundle) {
  const entities = [...bundle.structured.entities];
  const edges = [...bundle.structured.edges];
  const documents = [...bundle.structured.documents];
  const chunks = [];
  for (const part of bundle.extracted) {
    documents.push(part.doc);
    chunks.push(...part.chunks);
    edges.push(...part.edges);
    for (const ne of part.newEntities) {
      const dup = entities.find(e => norm(e.name) === norm(ne.name) || (e.aliases || []).some(a => (ne.aliases || []).map(norm).includes(norm(a))));
      if (!dup) entities.push(ne);
    }
  }
  // Entity resolution
  const parent = new Map(entities.map(e => [e.id, e.id]));
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => parent.set(find(a), find(b));
  const reasons = new Map();
  const rkey = (a, b) => [a, b].sort().join('|');
  const byName = new Map();
  for (const e of entities) for (const k of [norm(e.name), ...(e.aliases || []).map(norm)]) {
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(e);
  }
  for (const list of byName.values()) for (let i = 1; i < list.length; i++) {
    union(list[0].id, list[i].id);
    reasons.set(rkey(list[0].id, list[i].id), { method: 'name_or_alias_match', score: 1.0 });
  }
  const people = entities.filter(e => e.type === 'person');
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    const a = tokens(people[i].name), b = tokens(people[j].name);
    if (a[0] !== b[0] || a.length < 2 && b.length < 2) continue;
    const lastA = a[a.length - 1], lastB = b[b.length - 1];
    if ((lastA.length === 1 && lastB.startsWith(lastA)) || (lastB.length === 1 && lastA.startsWith(lastB))) {
      union(people[i].id, people[j].id);
      reasons.set(rkey(people[i].id, people[j].id), { method: 'initial_rule', score: 0.95 });
    }
  }
  // embedding similarity across remaining clusters
  const clusterOf = () => {
    const m = new Map();
    for (const e of entities) { const r = find(e.id); if (!m.has(r)) m.set(r, []); m.get(r).push(e); }
    return m;
  };
  let clusters = clusterOf();
  const reps = [...clusters.values()].map(c => c.find(e => e.origin === 'structured') || c[0]);
  const vecs = await embed(reps.map(r => r.name), 'SEMANTIC_SIMILARITY');
  const cos = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0) / (Math.hypot(...x) * Math.hypot(...y));
  for (let i = 0; i < reps.length; i++) for (let j = i + 1; j < reps.length; j++) {
    if (reps[i].type !== reps[j].type) continue;
    const score = cos(vecs[i], vecs[j]);
    if (score >= 0.9) {
      union(reps[i].id, reps[j].id);
      reasons.set(rkey(reps[i].id, reps[j].id), { method: 'embedding_similarity', score: +score.toFixed(3) });
    }
  }
  // apply merges
  clusters = clusterOf();
  const idMap = new Map(); // old id -> canonical id
  const finalEntities = [], resolutionLog = [];
  for (const members of clusters.values()) {
    const canonical = members.sort((a, b) => (a.origin === 'structured' ? -1 : 1) - (b.origin === 'structured' ? -1 : 1) || b.name.length - a.name.length)[0];
    if (members.length === 1) { idMap.set(canonical.id, canonical.id); finalEntities.push(canonical); continue; }
    const aliases = [...new Set(members.flatMap(m => [m.name, ...(m.aliases || [])]).filter(n => n !== canonical.name))];
    const perms = [...new Set(members.flatMap(m => m.permission_roles || ['exec', 'team']))];
    for (const m of members) {
      idMap.set(m.id, canonical.id);
      if (m.id !== canonical.id) {
        const r = reasons.get(rkey(members[0].id, m.id)) || { method: 'name_or_alias_match', score: 1.0 };
        resolutionLog.push({ merged: m.name, canonical: canonical.name, method: r.method, score: r.score });
      }
    }
    finalEntities.push({ ...canonical, aliases, permission_roles: perms });
  }
  // Document entities + authorship edges, direct from ingestion metadata (no LLM)
  for (const d of documents) {
    if (d.kind === 'structured') continue;
    finalEntities.push({ id: eid('document', d.title), name: d.title, type: 'document', aliases: [], attrs: { kind: d.kind, doc_id: d.id, date: d.doc_date, source_system: d.source_system }, origin: 'structured', permission_roles: d.permission_roles });
  }
  const byAnyName = new Map();
  for (const e of finalEntities) for (const n of [e.name, ...(e.aliases || [])]) byAnyName.set(norm(n), e.id);
  for (const d of documents) {
    if (d.kind === 'structured' || !d.author || d.author === 'system export') continue;
    const pid = byAnyName.get(norm(d.author));
    if (pid) edges.push({ src: pid, dst: eid('document', d.title), relation: 'authored', confidence: 1.0, origin: 'direct', provenance: [{ doc_id: d.id, title: d.title, source: d.source_system, date: d.doc_date, excerpt: 'document author metadata' }], permission_roles: d.permission_roles });
  }
  // repoint + dedupe edges
  const seen = new Map();
  for (const e of edges) {
    const src = idMap.get(e.src) || e.src, dst = idMap.get(e.dst) || e.dst;
    if (src === dst) continue;
    const k = `${src}|${dst}|${e.relation}`;
    if (seen.has(k)) {
      const p = seen.get(k);
      p.confidence = Math.max(p.confidence, e.confidence);
      p.provenance = [...p.provenance, ...e.provenance];
      p.permission_roles = [...new Set([...p.permission_roles, ...e.permission_roles])];
    } else seen.set(k, { ...e, src, dst });
  }
  const finalEdges = [...seen.values()];
  return {
    generated_at: new Date().toISOString(),
    documents, chunks, entities: finalEntities, edges: finalEdges, resolution_log: resolutionLog,
  };
}

export function listDocs() { return listUnstructured(); }

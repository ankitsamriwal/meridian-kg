import { readStructured, readRoster, listUnstructured, readUnstructured, chunkText } from './corpus.js';
import { generate, embed } from './gemini.js';
import { upsert, insert, select, del, rpc } from './store.js';

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const eid = (type, name) => `${type}:${slug(name)}`;

// ---------- Stage 1: structured skeleton (direct mapping, NO LLM) ----------
export async function stageStructured() {
  const d365 = readStructured('d365_entities.json');
  const repo = readStructured('repo_graph.json');
  const roster = readRoster();
  const roles = d365._meta.permission_roles;
  const entities = [], edges = [];
  const E = (type, name, attrs = {}, perm = roles) =>
    entities.push({ id: eid(type, name), name, type, aliases: [], attrs, origin: 'structured', permission_roles: perm });
  const G = (src, dst, relation, prov, perm = roles) =>
    edges.push({ src: eid(...src), dst: eid(...dst), relation, confidence: 1.0, origin: 'direct', provenance: [prov], permission_roles: perm });

  const DOC = { doc_id: 'd365_export', title: 'Dynamics 365 CE export', source: d365._meta.source_system, date: d365._meta.exported_at };
  const RDOC = { doc_id: 'repo_export', title: 'Git repository export', source: repo._meta.source_system, date: repo._meta.exported_at };
  await upsert('documents', [
    { id: DOC.doc_id, title: DOC.title, source_system: DOC.source, author: 'system export', doc_date: DOC.date, kind: 'structured', permission_roles: roles },
    { id: RDOC.doc_id, title: RDOC.title, source_system: RDOC.source, author: 'system export', doc_date: RDOC.date, kind: 'structured', permission_roles: roles },
  ]);

  for (const p of [...d365.team, ...d365.contacts]) E('person', p.name, { role: p.role || p.title, org: p.org || 'Falcon Retail Group', email: p.email });
  for (const a of d365.accounts) E('client', a.name, a);
  for (const o of d365.opportunities) E('opportunity', o.name, o);
  for (const p of d365.projects) E('project', p.name, p);
  for (const t of d365.project_tasks) E('task', t.name, { status: t.status });
  E('repository', repo.repository.name, repo.repository);
  for (const m of repo.modules) E('module', m.name, { path: m.path });

  const P = n => ['person', n];
  for (const a of d365.accounts) for (const c of d365.contacts.filter(c => c.account === a.id)) G(P(c.name), ['client', a.name], 'works_at', DOC);
  for (const o of d365.opportunities) {
    G(['opportunity', o.name], ['client', d365.accounts.find(a => a.id === o.account).name], 'for_client', DOC);
    G(P(d365.team.find(u => u.id === o.owner).name), ['opportunity', o.name], 'owns_opportunity', DOC);
  }
  for (const p of d365.projects) {
    G(['project', p.name], ['opportunity', d365.opportunities.find(o => o.id === p.opportunity).name], 'delivers', DOC);
    for (const t of d365.project_tasks.filter(t => t.project === p.id)) {
      G(['task', t.name], ['project', p.name], 'part_of', DOC);
      G(P(d365.team.find(u => u.id === t.owner).name), ['task', t.name], 'owns_task', DOC);
    }
  }
  for (const m of repo.modules) {
    G(['module', m.name], ['repository', repo.repository.name], 'in_repo', RDOC);
    for (const imp of m.imports) {
      const target = repo.modules.find(x => x.id === imp);
      if (target) G(['module', m.name], ['module', target.name], 'imports', RDOC);
    }
  }
  for (const c of repo.commits) G(P(c.author), ['repository', repo.repository.name], 'committed', { ...RDOC, excerpt: `${c.sha} ${c.message}` });
  for (const pr of repo.pull_requests) {
    G(P(pr.author), ['repository', repo.repository.name], 'opened_pr', { ...RDOC, excerpt: `PR #${pr.number}: ${pr.title}` });
    for (const r of pr.reviewers) G(P(r), P(pr.author), 'reviewed_pr_of', { ...RDOC, excerpt: `PR #${pr.number}` });
  }

  await upsert('entities', entities, 'id');
  await upsert('edges', edges);
  return { entities: entities.length, edges: edges.length };
}

// ---------- Stage 2: LLM extraction over one unstructured doc ----------
export async function stageExtract(file) {
  const { meta, body } = await readUnstructured(file);
  const doc = {
    id: meta.doc_id, title: meta.title, source_system: meta.source_system,
    author: meta.author, doc_date: meta.date, kind: meta.kind, permission_roles: meta.permission_roles,
  };
  await upsert('documents', [doc], 'id');
  const chunks = chunkText(body, doc.id);
  const existing = await select('entities', 'select=id,name,type,aliases');
  const known = existing.map(e => `${e.name} (${e.type})`).join('; ');

  const prompt = `You are an information extraction engine for an enterprise knowledge graph.
Known entities already in the graph (reuse these exact names when the text refers to them): ${known}

Extract from the document below:
1. entities: people, clients, organizations, systems/products, projects, tasks, risks, requirements, repos/modules. Each: {name, type, aliases[]}. Types: person|client|org|system|project|task|risk|requirement|repository|module.
2. relations between entities: {src, dst, relation, confidence 0-1, evidence}. relation is a short snake_case verb phrase (e.g. owns_risk, raised_concern, sponsors, depends_on, authored, mentioned_in). Use exact entity names.
Only extract what the text states. Attach every relation to entities you list.

Document title: ${doc.title}
Document:
${body.slice(0, 6000)}

Return JSON: {"entities": [...], "relations": [...]}`;

  const out = await generate(prompt, { json: true });
  const roles = doc.permission_roles;
  const byNorm = new Map(existing.map(e => [norm(e.name), e]));
  const newEntities = [], edgeRows = [], aliasUpdates = [];
  const resolveRef = name => {
    const hit = byNorm.get(norm(name));
    if (hit) return hit.id;
    for (const e of existing) if ((e.aliases || []).some(a => norm(a) === norm(name))) return e.id;
    return null;
  };
  for (const e of out.entities || []) {
    let id = resolveRef(e.name) || (e.aliases || []).map(resolveRef).find(Boolean);
    if (!id) {
      id = eid(e.type || 'concept', e.name);
      newEntities.push({ id, name: e.name, type: e.type || 'concept', aliases: e.aliases || [], attrs: {}, origin: 'extracted', permission_roles: roles });
      byNorm.set(norm(e.name), { id });
    } else if ((e.aliases || []).length) {
      aliasUpdates.push({ id, aliases: e.aliases });
    }
  }
  await upsert('entities', newEntities, 'id');
  for (const a of aliasUpdates) {
    const cur = await select('entities', `select=aliases&id=eq.${encodeURIComponent(a.id)}`);
    const merged = [...new Set([...(cur[0]?.aliases || []), ...a.aliases])];
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/entities?id=eq.${encodeURIComponent(a.id)}`, {
      method: 'PATCH',
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ aliases: merged }),
    });
    if (!r.ok) throw new Error('alias patch failed');
  }
  for (const rel of out.relations || []) {
    const s = resolveRef(rel.src), d = resolveRef(rel.dst);
    if (!s || !d) continue;
    edgeRows.push({
      src: s, dst: d, relation: rel.relation, confidence: rel.confidence ?? 0.7, origin: 'llm',
      provenance: [{ doc_id: doc.id, title: doc.title, source: doc.source_system, date: doc.doc_date, excerpt: (rel.evidence || '').slice(0, 240) }],
      permission_roles: roles,
    });
  }
  await upsert('edges', edgeRows);
  const vectors = await embed(chunks.map(c => c.content));
  await upsert('chunks', chunks.map((c, i) => ({
    document_id: doc.id, seq: c.seq, content: c.content, embedding: JSON.stringify(vectors[i]), permission_roles: roles,
  })));
  return { doc: doc.id, chunks: chunks.length, newEntities: newEntities.length, edges: edgeRows.length };
}

// ---------- Stage 3: entity resolution (rules + embedding similarity) ----------
const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = s => norm(s).split(' ');

export async function stageResolve() {
  const entities = await select('entities', 'select=id,name,type,aliases,origin,permission_roles');
  const log = [];
  const groups = new Map();
  const keyOf = e => {
    if (e.origin === 'structured') return e.id;
    return null;
  };
  // Rule 1: normalized name equality or alias equality
  const byName = new Map();
  for (const e of entities) {
    const keys = [norm(e.name), ...(e.aliases || []).map(norm)];
    for (const k of keys) {
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(e);
    }
  }
  const parent = new Map(entities.map(e => [e.id, e.id]));
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => parent.set(find(a), find(b));
  const reasons = new Map();
  for (const [k, list] of byName) {
    for (let i = 1; i < list.length; i++) {
      union(list[0].id, list[i].id);
      reasons.set(`${list[0].id}|${list[i].id}`, { method: 'name_or_alias_match', score: 1.0 });
    }
  }
  // Rule 2: person first-name + surname-initial match ("Ankit S." vs "Ankit Samriwal")
  const people = entities.filter(e => e.type === 'person');
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    const a = tokens(people[i].name), b = tokens(people[j].name);
    if (a[0] !== b[0]) continue;
    const lastA = a[a.length - 1], lastB = b[b.length - 1];
    if ((lastA.length === 1 && lastB.startsWith(lastA)) || (lastB.length === 1 && lastA.startsWith(lastB))) {
      union(people[i].id, people[j].id);
      reasons.set(`${people[i].id}|${people[j].id}`, { method: 'initial_rule', score: 0.95 });
    }
  }
  // Rule 3: embedding similarity on remaining cross-cluster pairs of same type
  const clusters = new Map();
  for (const e of entities) {
    const r = find(e.id);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r).push(e);
  }
  const reps = [...clusters.values()].map(c => c.find(e => e.origin === 'structured') || c[0]);
  const names = reps.map(r => r.name);
  const vecs = await embed(names, 'SEMANTIC_SIMILARITY');
  const cos = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0) / (Math.hypot(...x) * Math.hypot(...y));
  for (let i = 0; i < reps.length; i++) for (let j = i + 1; j < reps.length; j++) {
    if (reps[i].type !== reps[j].type) continue;
    const score = cos(vecs[i], vecs[j]);
    if (score >= 0.9) {
      union(reps[i].id, reps[j].id);
      reasons.set(`${reps[i].id}|${reps[j].id}`, { method: 'embedding_similarity', score: +score.toFixed(3) });
    }
  }
  // Apply merges: canonical = structured origin preferred, else longest name; edges repointed, never dropped
  const finalClusters = new Map();
  for (const e of entities) {
    const r = find(e.id);
    if (!finalClusters.has(r)) finalClusters.set(r, []);
    finalClusters.get(r).push(e);
  }
  const allEdges = await select('edges', 'select=id,src,dst,relation,confidence,provenance,origin,permission_roles');
  const HEADERS = () => ({ apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' });
  let merged = 0;
  for (const members of finalClusters.values()) {
    if (members.length < 2) continue;
    const canonical = members.sort((a, b) => (a.origin === 'structured' ? -1 : 0) - (b.origin === 'structured' ? -1 : 0) || b.name.length - a.name.length)[0];
    const aliases = [...new Set(members.flatMap(m => [m.name, ...(m.aliases || [])]).filter(n => n !== canonical.name))];
    const perms = [...new Set(members.flatMap(m => m.permission_roles || ['exec', 'team']))];
    const memberIds = new Set(members.map(m => m.id));
    // repoint edges onto canonical, dedupe on (src,dst,relation)
    const touched = allEdges.filter(e => memberIds.has(e.src) || memberIds.has(e.dst));
    const seen = new Map();
    for (const e of touched) {
      const src = memberIds.has(e.src) ? canonical.id : e.src;
      const dst = memberIds.has(e.dst) ? canonical.id : e.dst;
      if (src === dst) continue;
      const k = `${src}|${dst}|${e.relation}`;
      if (seen.has(k)) {
        const prev = seen.get(k);
        prev.confidence = Math.max(prev.confidence, e.confidence);
        prev.provenance = [...prev.provenance, ...e.provenance];
      } else seen.set(k, { ...e, src, dst });
    }
    if (touched.length) await del('edges', `id=in.(${touched.map(e => e.id).join(',')})`);
    const newRows = [...seen.values()].map(({ id, ...rest }) => rest);
    // drop any that now collide with untouched edges
    const keepKeys = new Set(allEdges.filter(e => !touched.includes(e)).map(e => `${e.src}|${e.dst}|${e.relation}`));
    await upsert('edges', newRows.filter(r => !keepKeys.has(`${r.src}|${r.dst}|${r.relation}`)));
    for (const m of members.filter(m => m.id !== canonical.id)) {
      const r = reasons.get(`${members[0].id}|${m.id}`) || reasons.get(`${m.id}|${members[0].id}`) || { method: 'name_or_alias_match', score: 1.0 };
      log.push({ merged: m.name, canonical: canonical.name, method: r.method, score: r.score });
      await del('entities', `id=eq.${encodeURIComponent(m.id)}`);
      merged++;
    }
    const r2 = await fetch(`${process.env.SUPABASE_URL}/rest/v1/entities?id=eq.${encodeURIComponent(canonical.id)}`, {
      method: 'PATCH', headers: HEADERS(), body: JSON.stringify({ aliases, permission_roles: perms }),
    });
    if (!r2.ok) throw new Error('canonical patch failed');
  }
  await del('resolution_log', 'id=gte.0');
  await insert('resolution_log', log);
  return { clusters: finalClusters.size, merged, logged: log.length };
}

export async function stageReset() {
  await del('edges', 'id=gte.0'); await del('chunks', 'id=gte.0');
  await del('entities', 'id=neq.'); await del('documents', 'id=neq.'); await del('resolution_log', 'id=gte.0');
  return { reset: true };
}

export function listDocs() { return listUnstructured(); }

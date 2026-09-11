const state = { role: 'team', graph: null, fg: null };
const $ = s => document.querySelector(s);

/* ---------- role picker ---------- */
$('#roles').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('#roles button').forEach(x => x.classList.toggle('on', x === b));
  state.role = b.dataset.role;
  state.graph = null;
  if ($('#tab-graph').classList.contains('on')) loadGraph();
  const note = { exec: 'Full access - commercials and risk register visible.', team: 'Internal view - no pricing or commercial risk detail.', client: 'Client-shared material only.' }[state.role];
  addSystemNote(note);
});

/* ---------- tabs ---------- */
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'graph') loadGraph();
  if (b.dataset.tab === 'pipeline') loadPipeline();
});

/* ---------- chat ---------- */
const SUGGESTED = [
  'Who owns the duplicate-data risk?',
  'What did we promise Falcon Retail in the proposal?',
  'What depends on the falcon-crm-sync middleware?',
  'What happens if the change-freeze exemption fails?',
  'Who is Ankit S. and what is he working on?',
];
const chipsEl = $('#chips');
for (const q of SUGGESTED) {
  const b = document.createElement('button'); b.textContent = q;
  b.onclick = () => { $('#askinput').value = q; ask(); };
  chipsEl.appendChild(b);
}

function addSystemNote(text) {
  const d = document.createElement('div');
  d.className = 'msg-bot'; d.innerHTML = `<div class="ans" style="color:var(--ink2);font-size:12.5px">${esc(text)}</div>`;
  $('#thread').appendChild(d); scrollThread();
}
function scrollThread() { $('#thread').scrollTop = $('#thread').scrollHeight; }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function ask() {
  const q = $('#askinput').value.trim(); if (!q) return;
  $('#askinput').value = '';
  const empty = $('.empty'); if (empty) empty.remove();
  const u = document.createElement('div'); u.className = 'msg-user'; u.textContent = q;
  $('#thread').appendChild(u);
  const bot = document.createElement('div'); bot.className = 'msg-bot';
  bot.innerHTML = '<div class="typing"><i></i><i></i><i></i></div>';
  $('#thread').appendChild(bot); scrollThread();
  try {
    const r = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, role: state.role }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'failed');
    bot.innerHTML = renderAnswer(d);
  } catch (e) {
    bot.innerHTML = `<div class="ans" style="color:var(--warn)">Something broke: ${esc(e.message)}</div>`;
  }
  scrollThread();
}
$('#askbar').addEventListener('submit', e => { e.preventDefault(); ask(); });

function renderAnswer(d) {
  const nameOf = id => (d.path.nodes.find(n => n.id === id) || { name: id }).name;
  const seen = new Set(); const flow = [];
  for (const e of d.path.edges.slice(0, 14)) {
    const k = e.src + e.relation + e.dst; if (seen.has(k)) continue; seen.add(k);
    flow.push(`<span class="pnode">${esc(nameOf(e.src))}</span><span class="pedge">${esc(e.relation)}${e.confidence < 1 ? ` <span class="pconf">${e.confidence.toFixed(2)}</span>` : ''}</span><span class="pnode">${esc(nameOf(e.dst))}</span>`);
  }
  return `
    <div class="ans">${esc(d.answer).replace(/\[Source: ([^\]]+)\]/g, '<b>[Source: $1]</b>')}</div>
    <details class="trace" open>
      <summary>Graph path &amp; sources</summary>
      <div class="pathflow">${flow.join('') || '<span class="pedge">no traversal path</span>'}</div>
      <div class="srclist">${d.sources.map(s => `
        <div class="src"><span class="k">${esc(s.kind)}</span><span class="t">${esc(s.title)}</span><span class="m">${esc(s.author)} &middot; ${esc(s.date || '')}</span></div>`).join('')}</div>
      <div class="statsline">${d.stats.chunks_retrieved} chunks vector-matched &middot; ${d.stats.seed_entities} seed entities &middot; ${d.stats.path_edges} edges traversed &middot; role: ${esc(d.role)}</div>
    </details>`;
}

/* ---------- 3D explorer ---------- */
const TYPE_COLORS = {
  person: '#4A3FD6', client: '#B3541E', org: '#B3541E', project: '#0F7B4F', opportunity: '#0F7B4F',
  task: '#8A6D1D', system: '#5271B8', repository: '#171A21', module: '#6B7280',
  risk: '#C2283B', requirement: '#7C5CBF', concept: '#9AA0AA',
};
async function loadGraph() {
  if (!state.graph) {
    const r = await fetch('/api/graph?role=' + state.role);
    state.graph = await r.json();
  }
  renderLegend();
  const el = $('#graph3d');
  const deg = {};
  for (const l of state.graph.links) { deg[l.source] = (deg[l.source] || 0) + 1; deg[l.target] = (deg[l.target] || 0) + 1; }
  if (state.fg) { state.fg.graphData(state.graph); return; }
  state.fg = ForceGraph3D()(el)
    .backgroundColor('#F7F6F1')
    .graphData(state.graph)
    .nodeColor(n => TYPE_COLORS[n.type] || '#9AA0AA')
    .nodeVal(n => 1.5 + (deg[n.id] || 0) * 0.9)
    .nodeLabel(n => `${n.name} (${n.type})`)
    .linkColor(() => 'rgba(23,26,33,0.18)')
    .linkWidth(l => Math.max(0.4, l.confidence))
    .linkLabel(l => l.relation)
    .linkDirectionalParticles(l => l.origin === 'llm' ? 1 : 0)
    .linkDirectionalParticleWidth(1.6)
    .linkDirectionalParticleColor(() => '#4A3FD6')
    .onNodeClick(showNode)
    .width(el.clientWidth).height(el.clientHeight);
}
function renderLegend() {
  const types = [...new Set(state.graph.nodes.map(n => n.type))];
  $('#legend').innerHTML = types.map(t => `<div><i style="background:${TYPE_COLORS[t] || '#9AA0AA'}"></i>${t}</div>`).join('');
}
function showNode(n) {
  const card = $('#nodecard');
  const rels = state.graph.links.filter(l => l.source.id === n.id || l.target.id === n.id || l.source === n.id || l.target === n.id);
  const other = l => (l.source.id || l.source) === n.id ? (l.target.id ? l.target.name : l.target) : (l.source.id ? l.source.name : l.source);
  card.innerHTML = `
    <button class="close" onclick="document.getElementById('nodecard').classList.add('hidden')">&times;</button>
    <h4>${esc(n.name)}</h4>
    <div class="ntype">${esc(n.type)} &middot; ${n.origin === 'structured' ? 'direct-mapped' : 'LLM-extracted'}</div>
    ${(n.aliases || []).length ? `<div class="naliases">also known as: ${n.aliases.map(esc).join(', ')}</div>` : ''}
    <ul>${rels.slice(0, 12).map(l => `<li><b>${esc(l.relation)}</b> &rarr; ${esc(other(l))}${l.provenance?.title ? `<br><span style="font-size:10px">source: ${esc(l.provenance.title)}</span>` : ''}</li>`).join('')}</ul>`;
  card.classList.remove('hidden');
}
window.addEventListener('resize', () => { if (state.fg) state.fg.width($('#graph3d').clientWidth).height($('#graph3d').clientHeight); });

/* ---------- pipeline ---------- */
const STAGE_DEFS = [
  ['01', 'Enterprise sources', 'D365 export, repo graph, roster, proposals, emails, notes, risk register', s => [s.documents, 'documents']],
  ['02', 'Ingestion & provenance', 'Per-source metadata preserved: author, date, source system, permission roles', s => [s.structured_docs + ' structured / ' + s.unstructured_docs + ' unstructured', 'split']],
  ['03', 'Extraction', 'Structured mapped directly (no LLM); unstructured via LLM with per-edge confidence', s => [s.chunks, 'chunks embedded']],
  ['04', 'Entity resolution', 'Rules + embedding similarity merge duplicates; every merge logged', s => [s.merges.length, 'merges']],
  ['05', 'Graph storage', 'Postgres + pgvector: entities, edges, chunk embeddings, provenance on every row', s => [s.entities + ' / ' + s.edges, 'nodes / edges']],
  ['06', 'App layer', 'GraphRAG chat with traceable paths + 3D explorer; roles enforced at query time', s => [s.entities_structured + ' direct / ' + s.entities_extracted + ' extracted', 'entity origins']],
];
async function loadPipeline() {
  const r = await fetch('/api/stats'); const s = await r.json();
  $('#stages').innerHTML = STAGE_DEFS.map(([n, t, d, f]) => {
    const [v, lbl] = f(s);
    return `<div class="stage"><div class="n">STAGE ${n}</div><h4>${t}</h4><p>${d}</p><div class="count">${v}<span>${lbl}</span></div></div>`;
  }).join('');
  $('#reslog').innerHTML = s.merges.length
    ? s.merges.map(m => `<div class="resrow"><span class="from">${esc(m.merged)}</span> &rarr; <span class="to">${esc(m.canonical)}</span><span class="how">${esc(m.method)} ${m.score}</span></div>`).join('')
    : '<p class="cardnote">No merges logged yet.</p>';
}

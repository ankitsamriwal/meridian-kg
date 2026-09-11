const URL = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE;
const H = () => ({
  apikey: KEY(), Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json',
});

export async function upsert(table, rows, onConflict) {
  if (!rows.length) return;
  const r = await fetch(`${URL()}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`, {
    method: 'POST', headers: { ...H(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`upsert ${table} ${r.status}: ${(await r.text()).slice(0, 400)}`);
}

export async function insert(table, rows) {
  if (!rows.length) return;
  const r = await fetch(`${URL()}/rest/v1/${table}`, {
    method: 'POST', headers: { ...H(), Prefer: 'return=minimal' }, body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`insert ${table} ${r.status}: ${(await r.text()).slice(0, 400)}`);
}

export async function select(table, query = '') {
  const r = await fetch(`${URL()}/rest/v1/${table}?${query}`, { headers: H() });
  if (!r.ok) throw new Error(`select ${table} ${r.status}: ${(await r.text()).slice(0, 400)}`);
  return r.json();
}

export async function rpc(fn, args) {
  const r = await fetch(`${URL()}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(), body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status}: ${(await r.text()).slice(0, 400)}`);
  return r.json();
}

export async function del(table, query) {
  const r = await fetch(`${URL()}/rest/v1/${table}?${query}`, { method: 'DELETE', headers: H() });
  if (!r.ok) throw new Error(`delete ${table} ${r.status}: ${(await r.text()).slice(0, 400)}`);
}

import { select } from './_lib/store.js';

const ROLES = ['exec', 'team', 'client'];

export default async function handler(req, res) {
  const role = ROLES.includes(req.query.role) ? req.query.role : 'team';
  try {
    const entities = await select('entities', 'select=id,name,type,aliases,attrs,origin,permission_roles');
    const edges = await select('edges', 'select=id,src,dst,relation,confidence,origin,provenance,permission_roles');
    const visible = entities.filter(e => (e.permission_roles || []).includes(role));
    const ids = new Set(visible.map(e => e.id));
    const vEdges = edges.filter(e => ids.has(e.src) && ids.has(e.dst) && (e.permission_roles || []).includes(role));
    res.json({
      nodes: visible.map(e => ({ id: e.id, name: e.name, type: e.type, aliases: e.aliases, origin: e.origin })),
      links: vEdges.map(e => ({ source: e.src, target: e.dst, relation: e.relation, confidence: e.confidence, origin: e.origin, provenance: e.provenance?.[0] || null })),
    });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
}

import { loadGraph } from './_lib/graphstore.js';

const ROLES = ['exec', 'team', 'client'];

export default async function handler(req, res) {
  const role = ROLES.includes(req.query.role) ? req.query.role : 'team';
  try {
    const g = loadGraph();
    const visible = g.entities.filter(e => (e.permission_roles || []).includes(role));
    const ids = new Set(visible.map(e => e.id));
    const links = g.edges.filter(e => ids.has(e.src) && ids.has(e.dst) && (e.permission_roles || []).includes(role));
    res.json({
      nodes: visible.map(e => ({ id: e.id, name: e.name, type: e.type, aliases: e.aliases, origin: e.origin })),
      links: links.map(e => ({ source: e.src, target: e.dst, relation: e.relation, confidence: e.confidence, origin: e.origin, provenance: e.provenance?.[0] || null })),
    });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
}

import { stageStructured, stageExtract, stageAssemble, listDocs } from '../_lib/pipeline.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const secret = req.headers['x-pipeline-secret'] || req.query.secret;
  if (!process.env.EXTRACTION_SECRET || secret !== process.env.EXTRACTION_SECRET)
    return res.status(401).json({ error: 'unauthorized' });
  const stage = req.query.stage;
  try {
    if (stage === 'structured') return res.json(stageStructured());
    if (stage === 'docs') return res.json({ docs: listDocs() });
    if (stage === 'extract') {
      const known = req.body?.knownEntities;
      if (req.method !== 'POST' || !Array.isArray(known)) return res.status(400).json({ error: 'POST {knownEntities:[...]} required' });
      return res.json(await stageExtract(req.query.doc, known));
    }
    if (stage === 'assemble') {
      if (req.method !== 'POST' || !req.body?.structured) return res.status(400).json({ error: 'POST {structured, extracted[]} required' });
      return res.json(await stageAssemble(req.body));
    }
    return res.status(400).json({ error: 'unknown stage', stages: ['structured', 'docs', 'extract?doc=', 'assemble'] });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}

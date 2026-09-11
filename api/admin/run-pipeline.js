import { stageStructured, stageExtract, stageResolve, stageReset, listDocs } from '../_lib/pipeline.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const secret = req.headers['x-pipeline-secret'] || req.query.secret;
  if (!process.env.EXTRACTION_SECRET || secret !== process.env.EXTRACTION_SECRET)
    return res.status(401).json({ error: 'unauthorized' });
  const stage = req.query.stage;
  try {
    if (stage === 'reset') return res.json(await stageReset());
    if (stage === 'structured') return res.json(await stageStructured());
    if (stage === 'extract') {
      const doc = req.query.doc;
      return res.json(await stageExtract(doc));
    }
    if (stage === 'docs') return res.json({ docs: listDocs() });
    if (stage === 'resolve') return res.json(await stageResolve());
    return res.status(400).json({ error: 'unknown stage', stages: ['reset', 'structured', 'docs', 'extract?doc=', 'resolve'] });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}

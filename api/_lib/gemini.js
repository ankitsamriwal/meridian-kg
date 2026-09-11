const KEY = () => process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEN_MODELS = ['gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
const EMBED_MODELS = ['gemini-embedding-001', 'gemini-embedding-2'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function generate(prompt, { json = false } = {}) {
  const body = model => ({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: json ? { responseMimeType: 'application/json', temperature: 0.1 } : { temperature: 0.3 },
  });
  let last;
  for (const model of GEN_MODELS) {
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch(`${BASE}/models/${model}:generateContent?key=${KEY()}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(model)),
        });
        if (!r.ok) throw new Error(`Gemini ${model} ${r.status}: ${(await r.text()).slice(0, 150)}`);
        const d = await r.json();
        const text = d.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '';
        return json ? JSON.parse(text) : text;
      } catch (e) {
        last = e;
        const quota = / 429/.test(e.message), busy = / 503/.test(e.message), gone = / 404/.test(e.message);
        if (gone) break;            // next model
        if (quota) { break; }       // per-model daily quota: next model
        if (busy) { await sleep(4000 * (i + 1)); continue; }
        throw e;
      }
    }
  }
  throw last;
}

export async function embed(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  let last;
  for (const model of EMBED_MODELS) {
    for (let i = 0; i < 2; i++) {
      try {
        const requests = texts.map(t => ({ model: `models/${model}`, content: { parts: [{ text: t }] }, taskType }));
        const r = await fetch(`${BASE}/models/${model}:batchEmbedContents?key=${KEY()}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }),
        });
        if (!r.ok) throw new Error(`Gemini ${model} ${r.status}: ${(await r.text()).slice(0, 150)}`);
        const d = await r.json();
        return d.embeddings.map(e => e.values);
      } catch (e) {
        last = e;
        if (/ 404| 429/.test(e.message)) break;
        if (/ 503/.test(e.message)) { await sleep(4000 * (i + 1)); continue; }
        throw e;
      }
    }
  }
  throw last;
}

export async function listModels() {
  const r = await fetch(`${BASE}/models?key=${KEY()}&pageSize=200`);
  const d = await r.json();
  return (d.models || []).map(m => m.name).filter(n => /embed|flash/i.test(n));
}

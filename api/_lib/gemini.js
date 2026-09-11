const KEY = () => process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEN_MODELS = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.6-flash'];
const EMBED_MODELS = ['gemini-embedding-001', 'gemini-embedding-2'];

async function call(url, body, timeoutMs = 45000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal });
    if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 120)}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// Race all models; first success wins. Per-model daily quotas make a slow chain time out.
async function race(models, makeCall, label) {
  const errors = [];
  return await Promise.any(models.map(m =>
    makeCall(m).catch(e => { errors.push(`${m} ${e.message}`); throw e; })
  )).catch(() => { throw new Error(`${label} all-models-failed: ${errors.join(' | ')}`); });
}

export async function generate(prompt, { json = false } = {}) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: json ? { responseMimeType: 'application/json', temperature: 0.1 } : { temperature: 0.3 },
  };
  const d = await race(GEN_MODELS, m => call(`${BASE}/models/${m}:generateContent?key=${KEY()}`, body), 'generate');
  const text = d.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '';
  return json ? JSON.parse(text) : text;
}

export async function embed(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  const d = await race(EMBED_MODELS, m => call(`${BASE}/models/${m}:batchEmbedContents?key=${KEY()}`, {
    requests: texts.map(t => ({ model: `models/${m}`, content: { parts: [{ text: t }] }, taskType })),
  }), 'embed');
  return d.embeddings.map(e => e.values);
}

export async function listModels() {
  const r = await fetch(`${BASE}/models?key=${KEY()}&pageSize=200`);
  const d = await r.json();
  return (d.models || []).map(m => m.name).filter(n => /embed|flash/i.test(n));
}

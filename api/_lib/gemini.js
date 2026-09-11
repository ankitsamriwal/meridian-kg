const KEY = () => process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export async function generate(prompt, { json = false, model = 'gemini-3.6-flash' } = {}) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: json ? { responseMimeType: 'application/json', temperature: 0.1 } : { temperature: 0.3 },
  };
  const r = await fetch(`${BASE}/models/${model}:generateContent?key=${KEY()}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Gemini generate ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const text = d.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '';
  return json ? JSON.parse(text) : text;
}

export async function embed(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  const requests = texts.map(t => ({
    model: 'models/text-embedding-004',
    content: { parts: [{ text: t }] },
    taskType,
  }));
  const r = await fetch(`${BASE}/models/text-embedding-004:batchEmbedContents?key=${KEY()}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }),
  });
  if (!r.ok) throw new Error(`Gemini embed ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return d.embeddings.map(e => e.values);
}

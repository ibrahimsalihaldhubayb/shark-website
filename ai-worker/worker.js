// Cloudflare Worker: وسيط آمن بين موقع شارك و ChatGPT (OpenAI)
// المفتاح يُحفظ كـ Secret باسم OPENAI_API_KEY ولا يظهر في الموقع أبداً.

const ALLOWED_ORIGINS = [
  'https://sharekre.sa',
  'https://www.sharekre.sa',
  'https://ibrahimsalihaldhubayb.github.io',
];
const MODEL = 'gpt-4o-mini';
const MAX_MESSAGES = 10;
const MAX_CHARS = 8000;

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'POST') return json({ error: 'method' }, 405, origin);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'bad_json' }, 400, origin); }

    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => m && ['system', 'user', 'assistant'].includes(m.role) && typeof m.content === 'string')
      .slice(-MAX_MESSAGES)
      .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
    if (!messages.length) return json({ error: 'empty' }, 400, origin);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.OPENAI_API_KEY },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: 400, temperature: 0.7 }),
    });
    const data = await res.json();
    const reply = data.choices && data.choices[0] && data.choices[0].message.content;
    if (!reply) return json({ error: (data.error && data.error.message) || 'no_reply' }, 502, origin);
    return json({ reply }, 200, origin);
  },
};

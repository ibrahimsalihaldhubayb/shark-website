// Cloudflare Worker: وسيط آمن بين موقع شارك ونموذج الذكاء الاصطناعي.
// يختار المزوّد حسب الـ Secret الموجود (المفاتيح لا تظهر في الموقع أبداً):
//   GEMINI_API_KEY → Google Gemini (مجاني)
//   OPENAI_API_KEY → ChatGPT (مدفوع)
//   بدون مفاتيح   → Cloudflare Workers AI (مجاني، يحتاج ربط AI باسم AI)

const ALLOWED_ORIGINS = [
  'https://sharekre.sa',
  'https://www.sharekre.sa',
  'https://ibrahimsalihaldhubayb.github.io',
];
const GEMINI_MODEL = 'gemini-flash-latest';
const OPENAI_MODEL = 'gpt-4o-mini';
const CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
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

    let reply = null, error = 'no_provider';
    try {
      if (env.GEMINI_API_KEY || env.OPENAI_API_KEY) {
        const gemini = !!env.GEMINI_API_KEY;
        const url = gemini
          ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
          : 'https://api.openai.com/v1/chat/completions';
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (gemini ? env.GEMINI_API_KEY : env.OPENAI_API_KEY) },
          body: JSON.stringify({ model: gemini ? GEMINI_MODEL : OPENAI_MODEL, messages, max_tokens: 400, temperature: 0.7 }),
        });
        const data = await res.json();
        reply = data.choices && data.choices[0] && data.choices[0].message.content;
        error = (data.error && data.error.message) || (Array.isArray(data) && data[0] && data[0].error && data[0].error.message) || 'no_reply';
      } else if (env.AI) {
        const data = await env.AI.run(CF_MODEL, { messages, max_tokens: 400 });
        reply = data && data.response;
        error = 'no_reply';
      }
    } catch (e) { error = String(e); }
    if (!reply) return json({ error }, 502, origin);
    return json({ reply }, 200, origin);
  },
};

// Every backend call goes through POST /api/ops/:name. The HTTP API only serves the
// read operations: writes are done from Claude sessions with the MCP / command line tools.
export async function op(name, input = {}) {
  const res = await fetch(`/api/ops/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json();
  if (body.error) throw Object.assign(new Error(body.error.message), { code: body.error.code });
  return body.result;
}

export { MAX_CHILDREN, MAX_CONTENT } from '../../server/limits.js';
export const parseTags = (s) => s.split(',').map((t) => t.trim()).filter(Boolean);

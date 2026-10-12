// Response + request-body helpers shared by the AI Edge Functions. Web
// standard APIs only (no Deno globals, no URL imports) so Vitest can load
// this file directly.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Every failure path returns this shape: a message safe to show the user
// plus a stable `code` the client can branch on.
export const errorResponse = (error, status, code) => jsonResponse({ error, code }, status);

// Reads a JSON object body, refusing anything over `maxBytes`. Returns
// `{ ok: true, body }` or `{ ok: false, error, status, code }`.
export const readJsonBody = async (req, maxBytes) => {
  const tooLarge = { ok: false, error: 'Request is too large.', status: 413, code: 'payload_too_large' };
  const invalid = { ok: false, error: 'Invalid request body', status: 400, code: 'invalid_request' };

  // Content-Length is only a hint (it can be absent or wrong), so the real
  // check is on the bytes actually read.
  if (Number(req.headers.get('content-length')) > maxBytes) {
    return tooLarge;
  }

  let text;

  try {
    text = await req.text();
  } catch {
    return invalid;
  }

  if (new TextEncoder().encode(text).length > maxBytes) {
    return tooLarge;
  }

  try {
    const body = JSON.parse(text);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return invalid;
    }

    return { ok: true, body };
  } catch {
    return invalid;
  }
};

// Extracts candidate info (name/title/role guess/contact/email) from a
// photographed or uploaded document image, for the "Add via Scan" flow on
// the Team roster. Runs under the service_role key for the same reason
// invite-member does: verifying the caller's membership requires reading
// the memberships table without being subject to their own RLS policy.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: ['string', 'null'] },
    title: { type: ['string', 'null'] },
    role_guess: { type: ['string', 'null'] },
    contact: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
  },
  required: ['name', 'title', 'role_guess', 'contact', 'email'],
  additionalProperties: false,
};

const EXTRACTION_PROMPT = `Extract candidate info from this image (a job application, ID, or similar document). If a field isn't visible or legible, use null. Do not guess or hallucinate values.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization header' }, 401);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const token = authHeader.replace('Bearer ', '');
  const { data: callerData, error: callerError } = await adminClient.auth.getUser(token);

  if (callerError || !callerData.user) {
    return jsonResponse({ error: 'Invalid session' }, 401);
  }

  let body;

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  const { image, mediaType } = body ?? {};

  if (!image || !ALLOWED_MEDIA_TYPES.has(mediaType)) {
    return jsonResponse({ error: `image and a supported mediaType (${[...ALLOWED_MEDIA_TYPES].join(', ')}) are required` }, 400);
  }

  const { data: callerMembership, error: membershipError } = await adminClient
    .from('memberships')
    .select('account_role')
    .eq('user_id', callerData.user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError || !callerMembership || !['owner', 'manager'].includes(callerMembership.account_role)) {
    return jsonResponse({ error: 'Not authorized to scan documents' }, 403);
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.parse({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      output_config: {
        format: { type: 'json_schema', schema: EXTRACTION_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return jsonResponse({ error: 'The image could not be processed.' }, 422);
    }

    return jsonResponse({ ok: true, extracted: response.parsed_output });
  } catch (error) {
    return jsonResponse({ error: error.message ?? 'Extraction failed' }, 500);
  }
});

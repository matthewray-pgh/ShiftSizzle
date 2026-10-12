// The one place the AI Edge Functions talk to the Anthropic API: model
// choice, timeout, error → HTTP status mapping, and logging.
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.133.0';
import { readModelJson } from './aiOutput.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

// Override with `supabase secrets set ANTHROPIC_MODEL=...` to change models
// without a redeploy of the code.
export const AI_MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5';

// Structured log line. Callers pass ids, codes and counts only — never the
// request body, the model output, or anything from the environment.
export const logAi = (level, fn, fields) => {
  const line = JSON.stringify({ fn, ...fields });

  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
};

const fail = (error, status, code) => ({ ok: false, error, status, code });

const describeApiError = (error) => {
  if (error instanceof Anthropic.APIUserAbortError || error instanceof Anthropic.APIConnectionTimeoutError) {
    return fail('The AI service took too long to respond. Try again.', 504, 'ai_timeout');
  }

  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return fail('AI is not configured correctly for this workspace.', 503, 'ai_misconfigured');
  }

  if (error instanceof Anthropic.NotFoundError) {
    return fail('AI is not configured correctly for this workspace.', 503, 'ai_misconfigured');
  }

  if (error instanceof Anthropic.RateLimitError) {
    return fail('The AI service is busy right now. Try again in a minute.', 429, 'ai_rate_limited');
  }

  if (error instanceof Anthropic.BadRequestError) {
    return fail('The AI service rejected the request.', 502, 'ai_bad_request');
  }

  if (error instanceof Anthropic.APIConnectionError) {
    return fail('Could not reach the AI service. Try again.', 502, 'ai_unreachable');
  }

  if (error instanceof Anthropic.APIError) {
    return fail('The AI service is having trouble right now. Try again.', 502, 'ai_upstream_error');
  }

  return fail('Something went wrong generating that.', 500, 'internal_error');
};

// Runs one structured-output request and returns `{ ok: true, value }` (the
// parsed JSON object, still to be validated by the caller) or
// `{ ok: false, error, status, code }`. `timeoutMs` bounds the whole call,
// retries included.
export const generateJson = async ({ fn, orgId, system, content, schema, effort, maxTokens, timeoutMs }) => {
  if (!ANTHROPIC_API_KEY) {
    logAi('error', fn, { org_id: orgId, code: 'ai_misconfigured', detail: 'ANTHROPIC_API_KEY is not set' });

    return fail('AI is not configured correctly for this workspace.', 503, 'ai_misconfigured');
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 1 });
  const startedAt = Date.now();

  let message;

  try {
    message = await anthropic.messages
      .stream(
        {
          model: AI_MODEL,
          max_tokens: maxTokens,
          system,
          output_config: { effort, format: { type: 'json_schema', schema } },
          messages: [{ role: 'user', content }],
        },
        { signal: AbortSignal.timeout(timeoutMs) },
      )
      .finalMessage();
  } catch (error) {
    const failure = describeApiError(error);

    logAi('error', fn, {
      org_id: orgId,
      code: failure.code,
      status: failure.status,
      upstream_status: error?.status ?? null,
      request_id: error?.requestID ?? null,
      model: AI_MODEL,
      ms: Date.now() - startedAt,
      detail: `${error?.name ?? 'Error'}: ${error?.message ?? ''}`.slice(0, 500),
    });

    return failure;
  }

  const result = readModelJson(message);
  const fields = {
    org_id: orgId,
    model: message.model,
    request_id: message._request_id ?? null,
    stop_reason: message.stop_reason,
    input_tokens: message.usage?.input_tokens ?? null,
    output_tokens: message.usage?.output_tokens ?? null,
    ms: Date.now() - startedAt,
  };

  if (!result.ok) {
    logAi('error', fn, { ...fields, code: result.code, status: result.status });
  } else {
    logAi('info', fn, { ...fields, code: 'ok' });
  }

  return result;
};

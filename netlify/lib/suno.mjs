// Shared helpers for talking to the Suno API (https://docs.sunoapi.org).
// The API key never leaves the server: it is read from the SUNO_API_KEY
// environment variable that you set in the Netlify dashboard.

export const SUNO_BASE_URL = "https://api.sunoapi.org";

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function errorResponse(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, status);
}

function apiKey() {
  const key = process.env.SUNO_API_KEY;
  if (!key) {
    throw new Error(
      "SUNO_API_KEY is not set. Add it in Netlify: Site configuration → Environment variables."
    );
  }
  return key;
}

// Map Suno's business error codes (returned in the JSON body) to messages.
const CODE_MESSAGES = {
  400: "Invalid parameters.",
  401: "Unauthorized — check the SUNO_API_KEY value.",
  404: "Invalid request method or path.",
  405: "Rate limit exceeded. Please wait a moment.",
  413: "Prompt or lyrics are too long.",
  429: "Insufficient Suno API credits.",
  430: "Too many requests. Please try again shortly.",
  455: "Suno API is under maintenance. Try again later.",
  500: "Suno API server error.",
};

/**
 * Call the Suno API and return `data` on success, or throw an Error with
 * a readable message (and `.status`) on failure.
 */
export async function sunoFetch(path, { method = "GET", query, body } = {}) {
  const url = new URL(path, SUNO_BASE_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const e = new Error(`Could not reach the Suno API: ${err.message}`);
    e.status = 502;
    throw e;
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    const e = new Error(`Suno API returned a non-JSON response (HTTP ${res.status}).`);
    e.status = 502;
    throw e;
  }

  const code = Number(payload?.code ?? res.status);
  if (!res.ok || code !== 200) {
    const msg = payload?.msg || CODE_MESSAGES[code] || `Suno API error (code ${code}).`;
    const e = new Error(msg);
    e.status = code >= 400 && code < 600 ? (code === 430 || code === 405 ? 429 : code) : 502;
    e.code = code;
    throw e;
  }
  return payload.data;
}

/** Suno requires a callBackUrl; we point it at our own no-op receiver and poll instead. */
export function callbackUrl(req) {
  if (process.env.SUNO_CALLBACK_URL) return process.env.SUNO_CALLBACK_URL;
  const origin = process.env.URL || new URL(req.url).origin;
  return `${origin.replace(/\/$/, "")}/api/callback`;
}

export function handleError(err) {
  console.error(err);
  return errorResponse(err.message || "Unexpected error.", err.status || 500, {
    code: err.code,
  });
}

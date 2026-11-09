// Shared helpers for talking to https://api.sunoapi.org
// The API key is read from the SUNO_API_KEY environment variable and never
// sent to the browser.

export const SUNO_BASE = "https://api.sunoapi.org";

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

// Returns a Response if the request should be rejected, otherwise null.
export function guard(req) {
  if (!process.env.SUNO_API_KEY) {
    return json({ error: "Server is missing SUNO_API_KEY. Set it in Netlify environment variables." }, 500);
  }
  const pw = process.env.APP_PASSWORD;
  if (pw && req.headers.get("x-app-password") !== pw) {
    return json({ error: "Invalid or missing app password.", needsPassword: true }, 401);
  }
  return null;
}

export async function suno(path, { method = "GET", body } = {}) {
  const res = await fetch(SUNO_BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.SUNO_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { code: res.status, msg: await res.text().catch(() => "Invalid response from Suno API") };
  }
  return { httpStatus: res.status, data };
}

// Suno API wraps everything as { code, msg, data }. Normalise errors.
export function relay({ httpStatus, data }) {
  const code = data?.code ?? httpStatus;
  if (httpStatus >= 400 || code !== 200) {
    return json({ error: data?.msg || `Suno API error (${code})`, code }, httpStatus >= 400 ? httpStatus : 502);
  }
  return json(data.data ?? {});
}

export function callbackUrl(req) {
  return new URL("/api/callback", req.url).toString();
}

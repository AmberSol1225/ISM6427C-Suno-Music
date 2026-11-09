import { guard, suno, relay, json, callbackUrl } from "./_suno.mjs";

// POST { prompt }  -> starts a lyrics task, returns { taskId }
// GET ?taskId=...  -> returns lyrics task details
export default async (req) => {
  const blocked = guard(req);
  if (blocked) return blocked;

  if (req.method === "GET") {
    const taskId = new URL(req.url).searchParams.get("taskId");
    if (!taskId || !/^[\w-]{1,128}$/.test(taskId)) return json({ error: "Missing or invalid taskId" }, 400);
    return relay(await suno(`/api/v1/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`));
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let input;
  try {
    input = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt) return json({ error: "Describe what the lyrics should be about." }, 400);
  if (prompt.length > 200) return json({ error: "Lyrics idea must be 200 characters or fewer." }, 400);

  return relay(
    await suno("/api/v1/lyrics", { method: "POST", body: { prompt, callBackUrl: callbackUrl(req) } })
  );
};

export const config = { path: "/api/lyrics" };

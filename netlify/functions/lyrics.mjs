// POST /api/lyrics            → Suno POST /api/v1/lyrics        (start a lyrics task)
// GET  /api/lyrics?taskId=... → Suno GET  /api/v1/lyrics/record-info
import { sunoFetch, callbackUrl, errorResponse, handleError, json } from "../lib/suno.mjs";

export default async (req) => {
  try {
    if (req.method === "POST") {
      let input;
      try {
        input = await req.json();
      } catch {
        return errorResponse("Request body must be JSON.");
      }
      const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
      if (!prompt) return errorResponse("Describe what the lyrics should be about.");
      if (prompt.length > 200) return errorResponse("Lyrics idea must be 200 characters or fewer.");

      const data = await sunoFetch("/api/v1/lyrics", {
        method: "POST",
        body: { prompt, callBackUrl: callbackUrl(req) },
      });
      return json({ ok: true, taskId: data?.taskId });
    }

    if (req.method === "GET") {
      const taskId = new URL(req.url).searchParams.get("taskId");
      if (!taskId || !/^[\w-]{4,128}$/.test(taskId)) return errorResponse("A valid taskId is required.");

      const data = await sunoFetch("/api/v1/lyrics/record-info", { query: { taskId } });
      const status = data?.status || "PENDING";
      const variants = (data?.response?.data || [])
        .filter((v) => v && v.text)
        .map((v) => ({ title: v.title, text: v.text }));
      const failed = /FAIL|ERROR|EXCEPTION/.test(status);
      return json({
        ok: true,
        status,
        done: status === "SUCCESS" || failed,
        failed,
        errorMessage: data?.errorMessage || null,
        variants,
      });
    }

    return errorResponse("Method not allowed.", 405);
  } catch (err) {
    return handleError(err);
  }
};

export const config = { path: "/api/lyrics" };

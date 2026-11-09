// GET /api/status?taskId=... → Suno GET /api/v1/generate/record-info
import { sunoFetch, errorResponse, handleError, json } from "../lib/suno.mjs";

const FAILED = new Set([
  "CREATE_TASK_FAILED",
  "GENERATE_AUDIO_FAILED",
  "CALLBACK_EXCEPTION",
  "SENSITIVE_WORD_ERROR",
]);

export default async (req) => {
  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId || !/^[\w-]{4,128}$/.test(taskId)) return errorResponse("A valid taskId is required.");

  try {
    const data = await sunoFetch("/api/v1/generate/record-info", { query: { taskId } });
    const status = data?.status || "PENDING";
    const tracks = (data?.response?.sunoData || []).map((t) => ({
      id: t.id,
      title: t.title,
      tags: t.tags,
      lyrics: t.prompt,
      duration: t.duration,
      imageUrl: t.image_url || t.source_image_url || "",
      audioUrl: t.audio_url || t.source_audio_url || "",
      streamUrl: t.stream_audio_url || t.source_stream_audio_url || "",
      model: t.model_name,
      createdAt: t.createTime,
    }));

    return json({
      ok: true,
      taskId,
      status,
      done: status === "SUCCESS" || FAILED.has(status),
      failed: FAILED.has(status),
      errorMessage: data?.errorMessage || null,
      tracks,
    });
  } catch (err) {
    return handleError(err);
  }
};

export const config = { path: "/api/status" };

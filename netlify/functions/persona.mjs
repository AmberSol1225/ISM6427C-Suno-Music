// POST /api/persona → Suno POST /api/v1/generate/generate-persona
// Turns a finished song into a reusable "persona" (its voice and style), so
// later songs can sound like it by passing the returned personaId to /api/generate.
import { sunoFetch, errorResponse, handleError, json } from "../lib/suno.mjs";

const str = (v) => (typeof v === "string" ? v.trim() : "");
const ID = /^[\w-]{4,128}$/;

export default async (req) => {
  if (req.method !== "POST") return errorResponse("Method not allowed.", 405);

  let input;
  try {
    input = await req.json();
  } catch {
    return errorResponse("Request body must be JSON.");
  }

  const taskId = str(input.taskId);
  const audioId = str(input.audioId);
  const name = str(input.name);
  const description = str(input.description);
  const style = str(input.style);

  if (!ID.test(taskId) || !ID.test(audioId)) return errorResponse("A finished song is required.");
  if (!name) return errorResponse("Give the persona a name.");
  if (!description) return errorResponse("Describe the persona's sound.");
  if (name.length > 100) return errorResponse("Name must be 100 characters or fewer.");
  if (description.length > 1000) return errorResponse("Description must be 1000 characters or fewer.");

  const body = { taskId, audioId, name, description };
  if (style) body.style = style.slice(0, 200);

  // Optional analysis window; the docs require a 10–30 second segment.
  const start = Number(input.vocalStart);
  const end = Number(input.vocalEnd);
  if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end - start >= 10 && end - start <= 30) {
    body.vocalStart = start;
    body.vocalEnd = end;
  }

  try {
    const data = await sunoFetch("/api/v1/generate/generate-persona", { method: "POST", body });
    if (!data?.personaId) return errorResponse("Suno did not return a persona ID.", 502);
    return json({ ok: true, personaId: data.personaId, name: data.name || name, description: data.description || description });
  } catch (err) {
    return handleError(err);
  }
};

export const config = { path: "/api/persona" };

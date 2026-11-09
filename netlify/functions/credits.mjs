// GET /api/credits → Suno GET /api/v1/generate/credit
import { sunoFetch, handleError, json } from "../lib/suno.mjs";

export default async () => {
  try {
    const credits = await sunoFetch("/api/v1/generate/credit");
    return json({ ok: true, credits });
  } catch (err) {
    return handleError(err);
  }
};

export const config = { path: "/api/credits" };

// POST /api/generate → Suno POST /api/v1/generate
import { sunoFetch, callbackUrl, errorResponse, handleError, json } from "../lib/suno.mjs";

const MODELS = new Set(["V6", "V6_MINI", "V6_WILD"]);

const str = (v) => (typeof v === "string" ? v.trim() : "");
const unit = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? Math.round(n * 100) / 100 : undefined;
};

export default async (req) => {
  if (req.method !== "POST") return errorResponse("Method not allowed.", 405);

  let input;
  try {
    input = await req.json();
  } catch {
    return errorResponse("Request body must be JSON.");
  }

  const customMode = Boolean(input.customMode);
  const instrumental = Boolean(input.instrumental);
  const model = MODELS.has(input.model) ? input.model : "V6";

  const body = {
    customMode,
    instrumental,
    model,
    callBackUrl: callbackUrl(req),
  };

  if (!customMode) {
    // Simple mode: describe the song; Suno writes lyrics/title/style for you.
    const prompt = str(input.prompt);
    const style = str(input.style);
    if (!prompt && !style) return errorResponse("Describe the song you want.");
    if (prompt.length > 3000) return errorResponse("Description must be 3000 characters or fewer.");
    if (style.length > 1000) return errorResponse("Style must be 1000 characters or fewer.");
    if (prompt) body.prompt = prompt;
    if (style) body.style = style;
  } else {
    // Custom mode: you control title, style, and the exact lyrics.
    const title = str(input.title);
    const style = str(input.style);
    const lyrics = str(input.lyrics);
    const negativeTags = str(input.negativeTags);

    if (!style) return errorResponse("Style is required in Custom mode.");
    if (!instrumental && !lyrics) {
      return errorResponse("Lyrics are required for a vocal track in Custom mode (or tick Instrumental).");
    }
    if (title.length > 80) return errorResponse("Title must be 80 characters or fewer.");
    if (style.length > 1000) return errorResponse("Style must be 1000 characters or fewer.");
    if (lyrics.length > 5000) return errorResponse("Lyrics must be 5000 characters or fewer.");
    if (negativeTags.length > 1000) return errorResponse("Excluded styles must be 1000 characters or fewer.");

    body.style = style;
    if (title) body.title = title;
    if (!instrumental && lyrics) {
      body.lyrics = lyrics;
      body.prompt = lyrics; // fallback field for lyrics per the docs
    }
    if (negativeTags) body.negativeTags = negativeTags;
    if (!instrumental && (input.vocalGender === "m" || input.vocalGender === "f")) {
      body.vocalGender = input.vocalGender;
    }

    const styleWeight = unit(input.styleWeight);
    const weirdness = unit(input.weirdnessConstraint);
    if (styleWeight !== undefined) body.styleWeight = styleWeight;
    if (weirdness !== undefined) body.weirdnessConstraint = weirdness;

    const duration = Math.round(Number(input.duration));
    if (Number.isFinite(duration) && duration >= 10 && duration <= 360) body.duration = duration;
  }

  try {
    const data = await sunoFetch("/api/v1/generate", { method: "POST", body });
    return json({ ok: true, taskId: data?.taskId });
  } catch (err) {
    return handleError(err);
  }
};

export const config = { path: "/api/generate" };

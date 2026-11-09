import { guard, suno, relay, json, callbackUrl } from "./_suno.mjs";

const MODELS = ["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5", "V5_5"];

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const blocked = guard(req);
  if (blocked) return blocked;

  let input;
  try {
    input = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const customMode = Boolean(input.customMode);
  const instrumental = Boolean(input.instrumental);
  const model = MODELS.includes(input.model) ? input.model : "V4_5";
  const str = (v) => (typeof v === "string" ? v.trim() : "");

  const body = { customMode, instrumental, model, callBackUrl: callbackUrl(req) };

  if (customMode) {
    body.style = str(input.style);
    body.title = str(input.title);
    if (!body.style || !body.title) return json({ error: "Custom mode needs a style and a title." }, 400);
    if (!instrumental) {
      body.prompt = str(input.prompt);
      if (!body.prompt) return json({ error: "Custom mode with vocals needs lyrics." }, 400);
    }
  } else {
    body.prompt = str(input.prompt);
    if (!body.prompt) return json({ error: "Describe the song you want." }, 400);
    if (body.prompt.length > 500) return json({ error: "Description must be 500 characters or fewer." }, 400);
  }

  const negativeTags = str(input.negativeTags);
  if (negativeTags) body.negativeTags = negativeTags;
  if (input.vocalGender === "m" || input.vocalGender === "f") body.vocalGender = input.vocalGender;

  return relay(await suno("/api/v1/generate", { method: "POST", body }));
};

export const config = { path: "/api/generate" };

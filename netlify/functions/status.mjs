import { guard, suno, relay, json } from "./_suno.mjs";

export default async (req) => {
  const blocked = guard(req);
  if (blocked) return blocked;
  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId || !/^[\w-]{1,128}$/.test(taskId)) return json({ error: "Missing or invalid taskId" }, 400);
  return relay(await suno(`/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`));
};

export const config = { path: "/api/status" };

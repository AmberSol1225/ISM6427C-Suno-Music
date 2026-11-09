import { guard, suno, relay } from "./_suno.mjs";

export default async (req) => {
  const blocked = guard(req);
  if (blocked) return blocked;
  return relay(await suno("/api/v1/generate/credit"));
};

export const config = { path: "/api/credits" };

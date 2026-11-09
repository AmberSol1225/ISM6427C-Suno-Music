// POST /api/callback — Suno requires a callBackUrl on every task.
// The app polls /api/status for results, so this receiver just acknowledges
// the notification (and logs it, visible under Netlify → Logs → Functions).
export default async (req) => {
  try {
    const payload = await req.json();
    console.log("Suno callback:", payload?.data?.callbackType, payload?.data?.task_id || payload?.data?.taskId);
  } catch {
    // ignore malformed bodies
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
};

export const config = { path: "/api/callback" };

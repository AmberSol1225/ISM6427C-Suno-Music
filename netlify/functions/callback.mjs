// Suno API requires a callBackUrl. The app polls for results instead, so this
// endpoint simply acknowledges the webhook.
export default async () =>
  new Response(JSON.stringify({ code: 200, msg: "received" }), {
    headers: { "content-type": "application/json" },
  });

export const config = { path: "/api/callback" };

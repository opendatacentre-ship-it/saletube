// ============================================================
// TELECARD WORKER — heartbeat.js
// Runs every 3 days via Cloudflare Cron.
// Pings Supabase so the free tier never pauses.
// ============================================================

export async function handleHeartbeat(env) {
  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/heartbeat_log`,
      {
        method: 'POST',
        headers: {
          'apikey':        env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal'
        },
        body: JSON.stringify({ status: 'ok' })
      }
    );

    if (response.ok) {
      console.log('Heartbeat OK — Supabase is alive.');
    } else {
      console.error('Heartbeat failed:', response.status, await response.text());
    }

  } catch (err) {
    console.error('Heartbeat error:', err);
  }
}

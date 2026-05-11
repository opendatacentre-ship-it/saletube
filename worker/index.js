// ============================================================
// TELECARD WORKER — index.js
// Entry point. Receives ALL Telegram webhook calls + Cron.
// ============================================================

import { handleUpdate } from './router.js';
import { handleHeartbeat } from './heartbeat.js';

export default {

  // ----------------------------------------------------------
  // FETCH: Handles every incoming Telegram webhook POST
  // ----------------------------------------------------------
  async fetch(request, env) {

    // Only accept POST requests from Telegram
    if (request.method !== 'POST') {
      return new Response('TeleCard is running.', { status: 200 });
    }

    try {
      const update = await request.json();
      await handleUpdate(update, env);
      return new Response('OK', { status: 200 });

    } catch (err) {
      console.error('index.js fetch error:', err);
      // Always return 200 to Telegram — otherwise it retries endlessly
      return new Response('OK', { status: 200 });
    }
  },

  // ----------------------------------------------------------
  // SCHEDULED: Runs on Cron schedule (every 3 days)
  // Keeps Supabase free tier alive — never pauses
  // ----------------------------------------------------------
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleHeartbeat(env));
  }

};

// ============================================================
// TELECARD WORKER — router.js
// Reads every Telegram update.
// Identifies who sent it and routes to the right handler.
// ============================================================

import { handleRepUpdate }      from './handlers/rep.js';
import { handleManagerUpdate }  from './handlers/manager.js';
import { handleAdminUpdate }    from './handlers/admin.js';
import { handleCustomerUpdate } from './handlers/customer.js';
import { getUser, getCustomer } from './db.js';

export async function handleUpdate(update, env) {

  // ----------------------------------------------------------
  // Extract the message (could be message or callback_query)
  // ----------------------------------------------------------
  const message  = update.message || update.callback_query?.message;
  const callbackQuery = update.callback_query;

  if (!message && !callbackQuery) return;

  const telegramId = update.message?.from?.id
    || update.callback_query?.from?.id;

  const text = update.message?.text || '';

  if (!telegramId) return;

  // ----------------------------------------------------------
  // Look up who this Telegram ID belongs to in our DB
  // Check users table first (reps + managers + admin)
  // Then check customers table
  // ----------------------------------------------------------
  const [user, customer] = await Promise.all([
    getUser(telegramId, env),
    getCustomer(telegramId, env)
  ]);

  // ----------------------------------------------------------
  // ROUTE: Platform Admin
  // ----------------------------------------------------------
  if (user?.role === 'admin') {
    return await handleAdminUpdate({ update, message, text, user, callbackQuery }, env);
  }

  // ----------------------------------------------------------
  // ROUTE: Manager
  // ----------------------------------------------------------
  if (user?.role === 'manager') {
    return await handleManagerUpdate({ update, message, text, user, callbackQuery }, env);
  }

  // ----------------------------------------------------------
  // ROUTE: Sales Rep
  // ----------------------------------------------------------
  if (user?.role === 'rep') {
    return await handleRepUpdate({ update, message, text, user, callbackQuery }, env);
  }

  // ----------------------------------------------------------
  // ROUTE: Known Customer
  // ----------------------------------------------------------
  if (customer) {
    return await handleCustomerUpdate({ update, message, text, customer, callbackQuery }, env);
  }

  // ----------------------------------------------------------
  // ROUTE: Unknown user — could be new customer via deep link
  // Check if they used a /start rep_XXXX deep link
  // ----------------------------------------------------------
  if (text.startsWith('/start')) {
    const payload = text.split(' ')[1]; // e.g. "rep_abc123"

    if (payload?.startsWith('rep_')) {
      // New customer arriving via rep's QR code / link
      return await handleCustomerUpdate(
        { update, message, text, customer: null, payload, callbackQuery },
        env
      );
    }

    // Unknown /start with no payload — show generic welcome
    await sendMessage(telegramId, env,
      `👋 Welcome to TeleCard.\n\nTo get started, scan a sales rep's QR code or use their personal link.`
    );
    return;
  }

  // Unknown user, unknown context — ignore silently
}


// ----------------------------------------------------------
// TELEGRAM API HELPER
// Used throughout the worker to send messages
// ----------------------------------------------------------
export async function sendMessage(chatId, env, text, extra = {}) {
  const body = {
    chat_id:    chatId,
    text:       text,
    parse_mode: 'HTML',
    ...extra
  };

  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    }
  );

  if (!res.ok) {
    console.error('sendMessage failed:', await res.text());
  }

  return res;
}

// Send an inline keyboard message
export async function sendMenu(chatId, env, text, buttons) {
  return sendMessage(chatId, env, text, {
    reply_markup: {
      inline_keyboard: buttons
    }
  });
}

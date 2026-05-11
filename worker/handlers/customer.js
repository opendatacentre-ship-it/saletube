// ============================================================
// TELECARD WORKER — handlers/customer.js
// Handles new customers arriving via QR/deep link
// AND relays their messages to the assigned rep
// ============================================================

import { sendMessage }   from '../router.js';
import { createCustomer, createConversation,
         getActiveConversation, saveMessage,
         getUser }       from '../db.js';

// ============================================================
// MAIN CUSTOMER ROUTER
// ============================================================
export async function handleCustomerUpdate(
  { update, message, text, customer, payload, callbackQuery }, env
) {
  const chatId     = message.chat.id;
  const telegramId = message.from.id;
  const from       = message.from;

  // ----------------------------------------------------------
  // NEW CUSTOMER: arrived via deep link rep_XXXX
  // ----------------------------------------------------------
  if (!customer && payload?.startsWith('rep_')) {
    return await onboardNewCustomer({ chatId, telegramId, from, payload }, env);
  }

  // ----------------------------------------------------------
  // KNOWN CUSTOMER: relay their message to the rep
  // ----------------------------------------------------------
  if (customer && text && !text.startsWith('/')) {
    return await relayCustomerMessage({ chatId, telegramId, customer, text, message }, env);
  }

  // ----------------------------------------------------------
  // KNOWN CUSTOMER: /start again — show welcome back
  // ----------------------------------------------------------
  if (customer && text?.startsWith('/start')) {
    return await sendMessage(chatId, env,
      `👋 Welcome back, <b>${customer.full_name || 'there'}</b>!\n\n` +
      `You're connected with your sales representative.\n` +
      `Just type your message and they'll get back to you shortly.`
    );
  }

  // Fallback
  if (customer) {
    return await sendMessage(chatId, env,
      `Just type your message and your sales rep will respond. 💬`
    );
  }
}


// ============================================================
// NEW CUSTOMER ONBOARDING
// They scanned the QR / tapped the deep link
// payload = "rep_<user_uuid>"
// ============================================================
async function onboardNewCustomer({ chatId, telegramId, from, payload }, env) {
  // Extract rep UUID from payload
  const repId = payload.replace('rep_', '');

  // Load the rep
  const rep = await getUserById(repId, env);

  if (!rep) {
    return sendMessage(chatId, env,
      `❌ This link is not valid. Please ask your sales rep for a new link.`
    );
  }

  // Welcome the customer
  const repName = rep.full_name || 'your sales representative';

  await sendMessage(chatId, env,
    `👋 <b>Welcome to TeleCard!</b>\n\n` +
    `You're now connected with <b>${repName}</b>.\n\n` +
    `This is your private channel — just type your message below and they'll respond.\n\n` +
    `What can we help you with today?`
  );

  // Create customer record
  const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ');

  const customer = await createCustomer(env, {
    telegramId:  telegramId,
    fullName:    fullName || 'New Customer',
    username:    from.username || null,
    companyId:   rep.company_id,
    repId:       rep.id
  });

  if (!customer) {
    console.error('Failed to create customer for telegram_id:', telegramId);
    return;
  }

  // Create a conversation
  await createConversation(env, {
    customerId: customer.id,
    repId:      rep.id,
    companyId:  rep.company_id
  });

  // Notify the rep
  await sendMessage(rep.telegram_id, env,
    `🔔 <b>New Customer!</b>\n\n` +
    `<b>${fullName || 'Someone'}</b> just scanned your TeleCard.\n` +
    (from.username ? `@${from.username}\n` : '') +
    `\nThey're waiting for your response. Reply here and I'll relay it to them.`
  );
}


// ============================================================
// RELAY: Customer message → Rep
// ============================================================
async function relayCustomerMessage({ chatId, telegramId, customer, text, message }, env) {
  // Load rep
  const rep = await getUserById(customer.assigned_rep_id, env);
  if (!rep) return;

  // Get or create active conversation
  let conversation = await getActiveConversation(customer.id, rep.id, env);

  if (!conversation) {
    conversation = await createConversation(env, {
      customerId: customer.id,
      repId:      rep.id,
      companyId:  customer.company_id
    });
  }

  if (!conversation) {
    console.error('Could not find or create conversation');
    return;
  }

  // Save message to DB
  await saveMessage(env, {
    conversationId:   conversation.id,
    companyId:        customer.company_id,
    senderType:       'customer',
    senderId:         telegramId,
    content:          text,
    isSophiaWhisper:  false,
    telegramMessageId: message.message_id
  });

  // Forward to rep
  const customerName = customer.full_name || 'Customer';

  await sendMessage(rep.telegram_id, env,
    `💬 <b>${customerName}</b>:\n${text}`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: `Reply to ${customerName}`, callback_data: `reply:${customer.id}` }
        ]]
      }
    }
  );

  // Acknowledge receipt to customer (optional — feels more professional)
  // We do NOT send a read receipt to avoid noise
  // Sophia coaching will be added in Phase 3
}


// ============================================================
// HELPER: Get user by UUID (not telegram_id)
// ============================================================
async function getUserById(userId, env) {
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/users?id=eq.${userId}&limit=1`,
      {
        headers: {
          'apikey':        env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
        }
      }
    );
    const data = await res.json();
    return data?.[0] || null;
  } catch {
    return null;
  }
}

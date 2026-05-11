// ============================================================
// TELECARD WORKER — handlers/rep.js
// Handles all messages and commands from Sales Reps
// ============================================================

import { sendMessage, sendMenu } from '../router.js';
import { saveMessage, saveKnowledge, getRepKnowledge,
         deleteKnowledge, getRepCustomers,
         getActiveConversation, updateSophiaStyle } from '../db.js';

// ============================================================
// MAIN REP ROUTER
// ============================================================
export async function handleRepUpdate({ update, message, text, user, callbackQuery }, env) {
  const chatId = message.chat.id;

  // Handle button callbacks
  if (callbackQuery) {
    return await handleRepCallback({ callbackQuery, user, chatId }, env);
  }

  // Handle commands
  if (text.startsWith('/')) {
    const command = text.split(' ')[0].toLowerCase();

    switch (command) {
      case '/start':
      case '/menu':    return await showRepMenu(chatId, user, env);
      case '/card':    return await showRepCard(chatId, user, env);
      case '/customers': return await showCustomers(chatId, user, env);
      case '/teach':   return await showTeachMenu(chatId, user, env);
      case '/settings': return await showSettings(chatId, user, env);
      default:         return await showRepMenu(chatId, user, env);
    }
  }

  // Non-command message from rep — check if they are in a teach flow
  // (State machine: if rep recently tapped /teach, save their text as knowledge)
  const state = await getRepState(user.id, env);

  if (state?.action === 'awaiting_knowledge_title') {
    return await handleKnowledgeTitle({ chatId, user, text, state }, env);
  }

  if (state?.action === 'awaiting_knowledge_content') {
    return await handleKnowledgeContent({ chatId, user, text, state }, env);
  }

  // Default: show menu
  return await showRepMenu(chatId, user, env);
}


// ============================================================
// REP MAIN MENU
// ============================================================
async function showRepMenu(chatId, user, env) {
  const firstName = user.full_name.split(' ')[0];

  await sendMenu(chatId, env,
    `👋 Hi <b>${firstName}</b>! What would you like to do?`,
    [
      [
        { text: '👥 My Customers',  callback_data: 'rep:customers' },
        { text: '📊 BANT Scores',   callback_data: 'rep:bant' }
      ],
      [
        { text: '📚 Teach Sophia',  callback_data: 'rep:teach' },
        { text: '⚙️ Settings',      callback_data: 'rep:settings' }
      ],
      [
        { text: '📇 My TeleCard',   callback_data: 'rep:card' },
        { text: '📄 Orders',        callback_data: 'rep:orders' }
      ]
    ]
  );
}


// ============================================================
// REP TELECARD (QR + deep link)
// ============================================================
async function showRepCard(chatId, user, env) {
  const deepLink = `https://t.me/${env.BOT_USERNAME}?start=rep_${user.id}`;

  await sendMessage(chatId, env,
    `📇 <b>Your TeleCard</b>\n\n` +
    `Share this link with your customers:\n` +
    `${deepLink}\n\n` +
    `When they tap it, they enter your private sales channel.\n` +
    `Sophia will coach you through every conversation.\n\n` +
    `<i>You can also screenshot and share your QR code from your Telegram profile settings.</i>`
  );
}


// ============================================================
// CUSTOMER LIST
// ============================================================
async function showCustomers(chatId, user, env) {
  const customers = await getRepCustomers(user.id, env);

  if (!customers || customers.length === 0) {
    return sendMessage(chatId, env,
      `👥 <b>My Customers</b>\n\nNo customers yet.\n\n` +
      `Share your TeleCard link to get started:\n/card`
    );
  }

  let text = `👥 <b>My Customers</b> (${customers.length})\n\n`;

  for (const c of customers) {
    text += `• <b>${c.full_name || 'Unknown'}</b>`;
    if (c.username) text += ` @${c.username}`;
    text += `\n`;
  }

  await sendMessage(chatId, env, text);
}


// ============================================================
// TEACH SOPHIA MENU
// ============================================================
async function showTeachMenu(chatId, user, env) {
  const knowledge = await getRepKnowledge(user.id, env);
  const count = knowledge?.length || 0;

  await sendMenu(chatId, env,
    `📚 <b>Teach Sophia</b>\n\n` +
    `Sophia currently knows <b>${count} thing(s)</b> about your business.\n\n` +
    `What would you like to add?`,
    [
      [
        { text: '📖 Sales Manual',    callback_data: 'teach:manual' },
        { text: '🛍️ Product Catalog', callback_data: 'teach:catalog' }
      ],
      [
        { text: '💰 Pricing',         callback_data: 'teach:pricing' },
        { text: '🛡️ Objections',      callback_data: 'teach:objection' }
      ],
      [
        { text: '📋 View What I Taught', callback_data: 'teach:view' }
      ]
    ]
  );
}


// ============================================================
// SETTINGS — Sophia coaching style
// ============================================================
async function showSettings(chatId, user, env) {
  const current = user.sophia_style || 'balanced';

  await sendMenu(chatId, env,
    `⚙️ <b>Sophia Settings</b>\n\n` +
    `Current coaching style: <b>${current}</b>\n\n` +
    `🔴 <b>Aggressive</b> — Sophia pushes hard on every missing BANT pillar\n` +
    `🟡 <b>Balanced</b> — Sophia nudges gently but consistently\n` +
    `🟢 <b>Gentle</b> — Sophia only coaches when asked\n\n` +
    `Choose your style:`,
    [
      [
        { text: current === 'aggressive' ? '🔴 Aggressive ✓' : '🔴 Aggressive', callback_data: 'style:aggressive' },
        { text: current === 'balanced'   ? '🟡 Balanced ✓'   : '🟡 Balanced',   callback_data: 'style:balanced' },
        { text: current === 'gentle'     ? '🟢 Gentle ✓'     : '🟢 Gentle',     callback_data: 'style:gentle' }
      ]
    ]
  );
}


// ============================================================
// CALLBACK HANDLER
// ============================================================
async function handleRepCallback({ callbackQuery, user, chatId }, env) {
  const data = callbackQuery.data;

  // Answer the callback to remove loading state on button
  await answerCallback(callbackQuery.id, env);

  // Main menu actions
  if (data === 'rep:customers') return await showCustomers(chatId, user, env);
  if (data === 'rep:card')      return await showRepCard(chatId, user, env);
  if (data === 'rep:teach')     return await showTeachMenu(chatId, user, env);
  if (data === 'rep:settings')  return await showSettings(chatId, user, env);
  if (data === 'rep:menu')      return await showRepMenu(chatId, user, env);

  // Teach Sophia — select knowledge type
  if (data.startsWith('teach:')) {
    const type = data.split(':')[1];

    if (type === 'view') return await viewKnowledge(chatId, user, env);

    // Save state: rep is about to type knowledge
    await setRepState(user.id, env, { action: 'awaiting_knowledge_title', type });

    const typeLabels = {
      manual:    'Sales Manual',
      catalog:   'Product Catalog',
      pricing:   'Pricing Info',
      objection: 'Objection Script',
      other:     'Other Info'
    };

    return sendMessage(chatId, env,
      `📝 <b>Adding: ${typeLabels[type] || type}</b>\n\n` +
      `First, give this a short title.\n` +
      `Example: <i>"iPhone 15 Pro pricing"</i> or <i>"How to handle price objections"</i>\n\n` +
      `Type your title now:`
    );
  }

  // Coaching style change
  if (data.startsWith('style:')) {
    const style = data.split(':')[1];
    await updateSophiaStyle(env, user.id, style);

    const emoji = { aggressive: '🔴', balanced: '🟡', gentle: '🟢' };
    return sendMessage(chatId, env,
      `${emoji[style]} Sophia's coaching style set to <b>${style}</b>.\n\n` +
      `She'll adjust her advice in your next conversations.`
    );
  }
}


// ============================================================
// TEACH FLOW — Step 1: Title
// ============================================================
async function handleKnowledgeTitle({ chatId, user, text, state }, env) {
  // Save title in state, ask for content
  await setRepState(user.id, env, {
    action: 'awaiting_knowledge_content',
    type:   state.type,
    title:  text
  });

  return sendMessage(chatId, env,
    `✅ Title saved: <i>${text}</i>\n\n` +
    `Now type or paste the full content.\n` +
    `This can be as long as you need — product descriptions, scripts, pricing tables, anything.\n\n` +
    `Sophia will read all of this before every customer conversation.`
  );
}


// ============================================================
// TEACH FLOW — Step 2: Content
// ============================================================
async function handleKnowledgeContent({ chatId, user, text, state }, env) {
  await saveKnowledge(env, {
    repId:     user.id,
    companyId: user.company_id,
    type:      state.type,
    title:     state.title,
    content:   text
  });

  // Clear state
  await clearRepState(user.id, env);

  return sendMenu(chatId, env,
    `🧠 <b>Sophia has learned it!</b>\n\n` +
    `<b>${state.title}</b> has been saved.\n` +
    `She'll use this knowledge in all your future conversations.\n\n` +
    `What would you like to do next?`,
    [
      [
        { text: '📚 Teach More',   callback_data: 'rep:teach' },
        { text: '🏠 Main Menu',    callback_data: 'rep:menu' }
      ]
    ]
  );
}


// ============================================================
// VIEW KNOWLEDGE
// ============================================================
async function viewKnowledge(chatId, user, env) {
  const items = await getRepKnowledge(user.id, env);

  if (!items || items.length === 0) {
    return sendMessage(chatId, env,
      `📋 You haven't taught Sophia anything yet.\n\nUse /teach to get started.`
    );
  }

  let text = `📋 <b>What Sophia Knows (${items.length} items)</b>\n\n`;

  const typeEmoji = {
    manual: '📖', catalog: '🛍️',
    pricing: '💰', objection: '🛡️', other: '📄'
  };

  for (const item of items) {
    const emoji = typeEmoji[item.type] || '📄';
    text += `${emoji} <b>${item.title}</b>\n`;
    text += `<i>${item.content.substring(0, 80)}${item.content.length > 80 ? '...' : ''}</i>\n\n`;
  }

  await sendMessage(chatId, env, text);
}


// ============================================================
// STATE MACHINE
// Simple key-value state stored in Supabase (users table notes)
// Tracks multi-step flows like /teach
// ============================================================

async function getRepState(userId, env) {
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=sophia_style`,
      {
        headers: {
          'apikey':        env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
        }
      }
    );
    // We use Cloudflare KV or a simple in-memory approach
    // For MVP: state stored in env KV if available, else stateless
    return null; // Will be enhanced in Phase 3
  } catch { return null; }
}

async function setRepState(userId, env, state) {
  // MVP: use Cloudflare Worker KV in Phase 3
  // For now: state passed via inline context
}

async function clearRepState(userId, env) {
  // MVP: clear KV state in Phase 3
}


// ============================================================
// TELEGRAM HELPER
// ============================================================
async function answerCallback(callbackId, env) {
  await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ callback_query_id: callbackId })
    }
  );
}

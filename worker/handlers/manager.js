// ============================================================
// TELECARD WORKER — handlers/manager.js
// Handles all messages and commands from Managers
// ============================================================

import { sendMessage, sendMenu } from '../router.js';
import { getCompanyCustomers, getCompanyConversations,
         getCompanyOrders, createUser, getUser } from '../db.js';

// ============================================================
// MAIN MANAGER ROUTER
// ============================================================
export async function handleManagerUpdate({ update, message, text, user, callbackQuery }, env) {
  const chatId = message.chat.id;

  if (callbackQuery) {
    return await handleManagerCallback({ callbackQuery, user, chatId }, env);
  }

  if (text.startsWith('/')) {
    const command = text.split(' ')[0].toLowerCase();

    switch (command) {
      case '/start':
      case '/menu':  return await showManagerMenu(chatId, user, env);
      case '/team':  return await showTeamOverview(chatId, user, env);
      case '/invite': return await showInviteRep(chatId, user, env);
      case '/export': return await exportLeads(chatId, user, env);
      default:       return await showManagerMenu(chatId, user, env);
    }
  }

  return await showManagerMenu(chatId, user, env);
}


// ============================================================
// MANAGER MAIN MENU
// ============================================================
async function showManagerMenu(chatId, user, env) {
  const firstName = user.full_name.split(' ')[0];

  await sendMenu(chatId, env,
    `👔 <b>${firstName}'s Manager Console</b>\n\nWhat would you like to do?`,
    [
      [
        { text: '👥 Team Overview',  callback_data: 'mgr:team' },
        { text: '📊 All Leads',      callback_data: 'mgr:leads' }
      ],
      [
        { text: '📄 All Orders',     callback_data: 'mgr:orders' },
        { text: '➕ Invite Rep',     callback_data: 'mgr:invite' }
      ],
      [
        { text: '📥 Export CSV',     callback_data: 'mgr:export' }
      ]
    ]
  );
}


// ============================================================
// TEAM OVERVIEW
// Shows all reps + their BANT scores
// ============================================================
async function showTeamOverview(chatId, user, env) {
  const conversations = await getCompanyConversations(user.company_id, env);

  if (!conversations || conversations.length === 0) {
    return sendMessage(chatId, env,
      `👥 <b>Team Overview</b>\n\nNo conversations yet.\n\nInvite your reps with /invite`
    );
  }

  // Group by rep and calculate avg BANT score
  const repMap = {};
  for (const conv of conversations) {
    if (!repMap[conv.rep_id]) {
      repMap[conv.rep_id] = { scores: [], count: 0 };
    }
    repMap[conv.rep_id].scores.push(conv.bant_score || 0);
    repMap[conv.rep_id].count++;
  }

  let text = `👥 <b>Team Overview</b>\n\n`;

  for (const [repId, data] of Object.entries(repMap)) {
    const avg = Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length);
    const bar = bantBar(avg);
    text += `${bar} ${avg}% — ${data.count} conversation(s)\n`;
  }

  text += `\n<i>Tap a rep's name in /team for full details (coming in Phase 5)</i>`;

  await sendMessage(chatId, env, text);
}


// ============================================================
// LEADS OVERVIEW
// ============================================================
async function showLeads(chatId, user, env) {
  const customers = await getCompanyCustomers(user.company_id, env);

  if (!customers || customers.length === 0) {
    return sendMessage(chatId, env,
      `📊 <b>All Leads</b>\n\nNo leads yet.`
    );
  }

  let text = `📊 <b>All Leads</b> (${customers.length} total)\n\n`;

  for (const c of customers.slice(0, 20)) {
    text += `• <b>${c.full_name || 'Unknown'}</b>`;
    if (c.username) text += ` @${c.username}`;
    text += '\n';
  }

  if (customers.length > 20) {
    text += `\n<i>...and ${customers.length - 20} more. Use /export to see all.</i>`;
  }

  await sendMessage(chatId, env, text);
}


// ============================================================
// ORDERS OVERVIEW
// ============================================================
async function showOrders(chatId, user, env) {
  const orders = await getCompanyOrders(user.company_id, env);

  if (!orders || orders.length === 0) {
    return sendMessage(chatId, env,
      `📄 <b>All Orders</b>\n\nNo orders yet.`
    );
  }

  let text = `📄 <b>All Orders</b> (${orders.length})\n\n`;
  let total = 0;

  for (const o of orders.slice(0, 15)) {
    const status = { draft: '🟡', sent: '🔵', confirmed: '🟢', cancelled: '🔴' };
    text += `${status[o.status] || '⚪'} $${o.total_amount} — ${o.status}\n`;
    total += parseFloat(o.total_amount) || 0;
  }

  text += `\n<b>Total: $${total.toFixed(2)}</b>`;

  await sendMessage(chatId, env, text);
}


// ============================================================
// INVITE REP
// Manager generates a one-time invite link for a new rep
// ============================================================
async function showInviteRep(chatId, user, env) {
  // Invite link encodes company + manager IDs
  const invitePayload = `invite_${user.company_id}_${user.id}`;
  const inviteLink = `https://t.me/${env.BOT_USERNAME}?start=${invitePayload}`;

  await sendMessage(chatId, env,
    `➕ <b>Invite a Sales Rep</b>\n\n` +
    `Share this link with your new rep:\n\n` +
    `${inviteLink}\n\n` +
    `When they tap it, they'll be onboarded into your team automatically.\n\n` +
    `<i>This link is for your company only. Keep it private.</i>`
  );
}


// ============================================================
// EXPORT (CSV via text message — full export in Phase 5)
// ============================================================
async function exportLeads(chatId, user, env) {
  const customers = await getCompanyCustomers(user.company_id, env);
  const conversations = await getCompanyConversations(user.company_id, env);

  if (!customers || customers.length === 0) {
    return sendMessage(chatId, env, `📥 No data to export yet.`);
  }

  // Build simple CSV string
  let csv = 'Name,Username,BANT Score,Status,Date\n';

  for (const c of customers) {
    const conv = conversations?.find(cv => cv.customer_id === c.id);
    csv += `"${c.full_name || ''}","${c.username || ''}","${conv?.bant_score || 0}","${conv?.status || 'new'}","${c.created_at?.split('T')[0] || ''}"\n`;
  }

  await sendMessage(chatId, env,
    `📥 <b>Leads Export</b>\n\n` +
    `<code>${csv}</code>\n\n` +
    `<i>Copy the data above. Full CSV download coming in Phase 5.</i>`
  );
}


// ============================================================
// CALLBACK HANDLER
// ============================================================
async function handleManagerCallback({ callbackQuery, user, chatId }, env) {
  const data = callbackQuery.data;

  await answerCallback(callbackQuery.id, env);

  if (data === 'mgr:team')   return await showTeamOverview(chatId, user, env);
  if (data === 'mgr:leads')  return await showLeads(chatId, user, env);
  if (data === 'mgr:orders') return await showOrders(chatId, user, env);
  if (data === 'mgr:invite') return await showInviteRep(chatId, user, env);
  if (data === 'mgr:export') return await exportLeads(chatId, user, env);
}


// ============================================================
// HELPERS
// ============================================================
function bantBar(score) {
  const filled = Math.round(score / 20); // 0-5 blocks
  return '█'.repeat(filled) + '░'.repeat(5 - filled);
}

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

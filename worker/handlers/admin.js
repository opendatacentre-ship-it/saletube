// ============================================================
// TELECARD WORKER — handlers/admin.js
// Platform Admin only. You — the founder.
// Commands to onboard companies and manage the platform.
// ============================================================

import { sendMessage, sendMenu } from '../router.js';
import { createCompany, createUser, getAllCompanies } from '../db.js';

export async function handleAdminUpdate({ update, message, text, user, callbackQuery }, env) {
  const chatId = message.chat.id;

  if (callbackQuery) {
    await answerCallback(callbackQuery.id, env);
    return;
  }

  if (text.startsWith('/')) {
    const parts   = text.split(' ');
    const command = parts[0].toLowerCase();

    switch (command) {
      case '/start':
      case '/menu':       return await showAdminMenu(chatId, env);
      case '/newcompany': return await startNewCompany(chatId, env);
      case '/companies':  return await listCompanies(chatId, env);
      default:            return await showAdminMenu(chatId, env);
    }
  }

  return await showAdminMenu(chatId, env);
}


// ============================================================
// ADMIN MENU
// ============================================================
async function showAdminMenu(chatId, env) {
  await sendMenu(chatId, env,
    `🌐 <b>TeleCard Platform Admin</b>\n\nWhat would you like to do?`,
    [
      [
        { text: '🏢 New Company',    callback_data: 'admin:newcompany' },
        { text: '📋 All Companies',  callback_data: 'admin:companies' }
      ]
    ]
  );
}


// ============================================================
// NEW COMPANY ONBOARDING
// You run this to add each new client company
// ============================================================
async function startNewCompany(chatId, env) {
  await sendMessage(chatId, env,
    `🏢 <b>Onboard New Company</b>\n\n` +
    `Send company details in this format:\n\n` +
    `<code>/newcompany [Company Name] | [Manager Telegram ID] | [Industry]</code>\n\n` +
    `Example:\n` +
    `<code>/newcompany Phnom Penh Auto Parts | 123456789 | Automotive</code>\n\n` +
    `<i>Get the manager's Telegram ID by asking them to message @userinfobot</i>`
  );
}


// We handle the full /newcompany command with arguments here
export async function handleNewCompanyCommand(chatId, text, env) {
  // Format: /newcompany Name | ManagerTelegramId | Industry
  const args = text.replace('/newcompany ', '').split('|').map(s => s.trim());

  if (args.length < 2) {
    return sendMessage(chatId, env,
      `❌ Format: <code>/newcompany Company Name | Manager Telegram ID | Industry</code>`
    );
  }

  const [name, managerTelegramId, industry] = args;

  if (!name || !managerTelegramId || isNaN(managerTelegramId)) {
    return sendMessage(chatId, env,
      `❌ Invalid format. Manager Telegram ID must be a number.\n\n` +
      `Ask the manager to send a message to @userinfobot to get their ID.`
    );
  }

  // Create company
  const company = await createCompany(env, {
    name,
    industry: industry || 'General',
    country: 'Cambodia'
  });

  if (!company) {
    return sendMessage(chatId, env, `❌ Failed to create company. Try again.`);
  }

  // Create manager user
  const manager = await createUser(env, {
    telegramId: parseInt(managerTelegramId),
    fullName:   `Manager - ${name}`,
    role:       'manager',
    companyId:  company.id
  });

  if (!manager) {
    return sendMessage(chatId, env,
      `⚠️ Company created but failed to create manager.\n` +
      `Company ID: <code>${company.id}</code>\n` +
      `Try adding manager manually.`
    );
  }

  await sendMessage(chatId, env,
    `✅ <b>${name}</b> is live!\n\n` +
    `Company ID: <code>${company.id}</code>\n` +
    `Manager Telegram ID: <code>${managerTelegramId}</code>\n\n` +
    `The manager can now message the bot and start adding their reps.\n` +
    `Ask them to open: t.me/${env.BOT_USERNAME}`
  );
}


// ============================================================
// LIST ALL COMPANIES
// ============================================================
async function listCompanies(chatId, env) {
  const companies = await getAllCompanies(env);

  if (!companies || companies.length === 0) {
    return sendMessage(chatId, env,
      `📋 No companies yet.\n\nUse /newcompany to add the first one.`
    );
  }

  let text = `📋 <b>All Companies</b> (${companies.length})\n\n`;

  for (const c of companies) {
    const status = c.is_active ? '🟢' : '🔴';
    text += `${status} <b>${c.name}</b>\n`;
    text += `   ${c.industry || 'General'} · ${c.country}\n`;
    text += `   <code>${c.id}</code>\n\n`;
  }

  await sendMessage(chatId, env, text);
}


// ============================================================
// HELPER
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

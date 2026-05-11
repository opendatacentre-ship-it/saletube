// ============================================================
// TELECARD WORKER — db.js
// All Supabase calls live here. One place to maintain.
// Uses service_role key — bypasses RLS safely.
// Company scoping is enforced in code here.
// ============================================================

// ----------------------------------------------------------
// CORE FETCH HELPER
// All DB calls go through this
// ----------------------------------------------------------
async function supabase(env, path, method = 'GET', body = null) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;

  const headers = {
    'apikey':        env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type':  'application/json',
    'Prefer':        method === 'POST' ? 'return=representation' : undefined
  };

  // Remove undefined headers
  Object.keys(headers).forEach(k => headers[k] === undefined && delete headers[k]);

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`DB error [${method} ${path}]:`, err);
    return null;
  }

  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}


// ============================================================
// USERS
// ============================================================

// Get user by Telegram ID (rep, manager, or admin)
export async function getUser(telegramId, env) {
  const data = await supabase(env,
    `users?telegram_id=eq.${telegramId}&limit=1`
  );
  return data?.[0] || null;
}

// Create a new user (rep or manager)
export async function createUser(env, { telegramId, fullName, username, role, companyId }) {
  const data = await supabase(env, 'users', 'POST', {
    telegram_id: telegramId,
    full_name:   fullName,
    username:    username || null,
    role,
    company_id:  companyId
  });
  return data?.[0] || null;
}

// Update user's Sophia coaching style
export async function updateSophiaStyle(env, userId, style) {
  return supabase(env,
    `users?id=eq.${userId}`,
    'PATCH',
    { sophia_style: style }
  );
}


// ============================================================
// COMPANIES
// ============================================================

// Get company by ID
export async function getCompany(companyId, env) {
  const data = await supabase(env,
    `companies?id=eq.${companyId}&limit=1`
  );
  return data?.[0] || null;
}

// Create a new company (called by admin /newcompany)
export async function createCompany(env, { name, industry, country }) {
  const data = await supabase(env, 'companies', 'POST', {
    name,
    industry: industry || null,
    country:  country || 'Cambodia'
  });
  return data?.[0] || null;
}

// Get all companies (admin only)
export async function getAllCompanies(env) {
  return supabase(env, 'companies?order=created_at.desc');
}


// ============================================================
// CUSTOMERS
// ============================================================

// Get customer by Telegram ID
export async function getCustomer(telegramId, env) {
  const data = await supabase(env,
    `customers?telegram_id=eq.${telegramId}&limit=1`
  );
  return data?.[0] || null;
}

// Create a new customer (first contact via rep's deep link)
export async function createCustomer(env, { telegramId, fullName, username, companyId, repId }) {
  const data = await supabase(env, 'customers', 'POST', {
    telegram_id:      telegramId,
    full_name:        fullName || 'New Customer',
    username:         username || null,
    company_id:       companyId,
    assigned_rep_id:  repId
  });
  return data?.[0] || null;
}

// Get all customers for a rep
export async function getRepCustomers(repId, env) {
  return supabase(env,
    `customers?assigned_rep_id=eq.${repId}&order=created_at.desc`
  );
}

// Get all customers for a company (manager view)
export async function getCompanyCustomers(companyId, env) {
  return supabase(env,
    `customers?company_id=eq.${companyId}&order=created_at.desc`
  );
}


// ============================================================
// CONVERSATIONS
// ============================================================

// Get active conversation between rep and customer
export async function getActiveConversation(customerId, repId, env) {
  const data = await supabase(env,
    `conversations?customer_id=eq.${customerId}&rep_id=eq.${repId}&status=eq.active&limit=1`
  );
  return data?.[0] || null;
}

// Create a new conversation
export async function createConversation(env, { customerId, repId, companyId }) {
  const data = await supabase(env, 'conversations', 'POST', {
    customer_id: customerId,
    rep_id:      repId,
    company_id:  companyId,
    status:      'active'
  });
  return data?.[0] || null;
}

// Update BANT fields and score
export async function updateBANT(env, conversationId, bantUpdates) {
  return supabase(env,
    `conversations?id=eq.${conversationId}`,
    'PATCH',
    {
      ...bantUpdates,
      last_message_at: new Date().toISOString()
    }
  );
}

// Get all conversations for a company (manager dashboard)
export async function getCompanyConversations(companyId, env) {
  return supabase(env,
    `conversations?company_id=eq.${companyId}&order=last_message_at.desc`
  );
}


// ============================================================
// MESSAGES
// ============================================================

// Save a message to the database
export async function saveMessage(env, {
  conversationId, companyId, senderType, senderId,
  content, isSophiaWhisper, telegramMessageId
}) {
  return supabase(env, 'messages', 'POST', {
    conversation_id:     conversationId,
    company_id:          companyId,
    sender_type:         senderType,
    sender_id:           senderId,
    content,
    is_sophia_whisper:   isSophiaWhisper || false,
    telegram_message_id: telegramMessageId || null
  });
}

// Get last N messages for a conversation (for Sophia's context)
export async function getRecentMessages(conversationId, env, limit = 20) {
  return supabase(env,
    `messages?conversation_id=eq.${conversationId}&order=created_at.desc&limit=${limit}`
  );
}


// ============================================================
// REP KNOWLEDGE
// ============================================================

// Get all knowledge entries for a rep (Sophia reads these)
export async function getRepKnowledge(repId, env) {
  return supabase(env,
    `rep_knowledge?rep_id=eq.${repId}&is_active=eq.true&order=type.asc`
  );
}

// Save a new knowledge entry
export async function saveKnowledge(env, { repId, companyId, type, title, content }) {
  const data = await supabase(env, 'rep_knowledge', 'POST', {
    rep_id:     repId,
    company_id: companyId,
    type,
    title,
    content
  });
  return data?.[0] || null;
}

// Delete a knowledge entry
export async function deleteKnowledge(env, knowledgeId, repId) {
  return supabase(env,
    `rep_knowledge?id=eq.${knowledgeId}&rep_id=eq.${repId}`,
    'DELETE'
  );
}


// ============================================================
// ORDERS
// ============================================================

// Create a new order
export async function createOrder(env, { conversationId, repId, customerId, companyId, items, totalAmount }) {
  const data = await supabase(env, 'orders', 'POST', {
    conversation_id: conversationId,
    rep_id:          repId,
    customer_id:     customerId,
    company_id:      companyId,
    items:           items,
    total_amount:    totalAmount,
    status:          'draft'
  });
  return data?.[0] || null;
}

// Update order status (e.g. draft → sent)
export async function updateOrderStatus(env, orderId, status, pdfUrl = null) {
  const patch = { status };
  if (pdfUrl) patch.pdf_url = pdfUrl;
  return supabase(env, `orders?id=eq.${orderId}`, 'PATCH', patch);
}

// Get orders for a company (manager view)
export async function getCompanyOrders(companyId, env) {
  return supabase(env,
    `orders?company_id=eq.${companyId}&order=created_at.desc`
  );
}

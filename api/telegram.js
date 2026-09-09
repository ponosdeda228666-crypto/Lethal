import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

const BOT_TOKEN = process.env.BOT_TOKEN || "8861768227:AAFbmUHocOR0zatOere_DcXopW-7JYyZbc4";
const CHAT_ID = process.env.CHAT_ID || "8488940016";
const USERS_FILE = path.join(process.cwd(), 'users.json');
const JWT_SECRET = 'lethal-dlc-super-secret-key-2026';

const processedRequests = new Map();

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch { return {}; }
}

function saveUsers(users) {
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); } catch {}
}

function getLocalDecisions() {
  try {
    const file = path.join('/tmp', 'tg_decisions.json');
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify({}));
      return {};
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return {}; }
}

function saveLocalDecision(id, status) {
  try {
    const file = path.join('/tmp', 'tg_decisions.json');
    const data = getLocalDecisions();
    data[id] = status;
    fs.writeFileSync(file, JSON.stringify(data));
  } catch {}
}

async function syncDecisionCloud(id, status) {
  saveLocalDecision(id, status);
  try {
    await fetch(`https://kvdb.io/8861768227_lethal_dlc/${id}`, { method: 'POST', body: status });
  } catch {}
}

async function getDecisionCloud(id) {
  const local = getLocalDecisions();
  if (local[id]) return local[id];
  try {
    const res = await fetch(`https://kvdb.io/8861768227_lethal_dlc/${id}`);
    if (res.ok) {
      const val = (await res.text()).trim();
      if (val) {
        saveLocalDecision(id, val);
        return val;
      }
    }
  } catch {}
  return null;
}

function verifyToken(token) {
  try {
    if (!token) return null;
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(JSON.stringify(decoded.payload))
      .digest('hex');
    if (decoded.signature !== expectedSignature) return null;
    return decoded.payload.email;
  } catch { return null; }
}

async function processMediaApplication(applicationId, approve) {
  const users = loadUsers();
  let foundUser = null;
  let foundEmail = null;
  let foundApp = null;

  for (const [email, user] of Object.entries(users)) {
    if (user.mediaApplications) {
      for (const app of user.mediaApplications) {
        if (app.id === applicationId) {
          foundUser = user;
          foundEmail = email;
          foundApp = app;
          break;
        }
      }
      if (foundUser) break;
    }
  }

  if (!foundUser || !foundApp) {
    return { success: false, error: 'Заявка не найдена' };
  }

  foundApp.status = approve ? 'approved' : 'rejected';
  foundApp.processedAt = new Date().toISOString();

  if (approve) {
    try {
      const PROMO_FILE = path.join(process.cwd(), 'promocodes.json');
      let promocodes = {};
      if (fs.existsSync(PROMO_FILE)) {
        promocodes = JSON.parse(fs.readFileSync(PROMO_FILE, 'utf8'));
      }
      promocodes[foundApp.promoCode] = {
        owner: foundEmail,
        uses: 0,
        volume: 0,
        reward: 0,
        createdAt: new Date().toISOString(),
        approvedAt: new Date().toISOString()
      };
      fs.writeFileSync(PROMO_FILE, JSON.stringify(promocodes, null, 2));
    } catch (e) {
      console.error('Ошибка сохранения промокода:', e);
    }
  }

  users[foundEmail] = foundUser;
  saveUsers(users);
  await syncDecisionCloud(applicationId, approve ? 'approved' : 'rejected');

  return { success: true, user: foundEmail, app: foundApp, status: approve ? 'approved' : 'rejected' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-Signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET' && req.query.setup === 'webhook') {
    const host = req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const webhookUrl = `${proto}://${host}/api/telegram`;
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      const tgData = await tgRes.json();
      return res.status(200).json({ success: true, webhookUrl, tgResponse: tgData });
    } catch (e) {
      return res.status(500).json({ error: 'Ошибка настройки вебхука' });
    }
  }

  if (req.method === 'GET') {
    const { check } = req.query;
    if (check) {
      const status = await getDecisionCloud(check);
      return res.status(200).json({ id: check, status: status || 'pending' });
    }
    return res.status(200).json({ status: 'active' });
  }

  if (req.method === 'POST' && req.body && req.body.callback_query) {
    try {
      const cb = req.body.callback_query;
      const data = cb.data || "";
      const messageId = cb.message?.message_id;
      const chatId = cb.message?.chat?.id;

      if (String(chatId) !== String(CHAT_ID)) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: cb.id,
            text: "❌ Доступ запрещен"
          })
        });
        return res.status(200).json({ status: "error" });
      }

      let response = { success: false };
      let statusText = '';

      if (data.startsWith("media_approve_")) {
        const appId = data.replace("media_approve_", "");
        response = await processMediaApplication(appId, true);
        statusText = response.success ? '✅ ОДОБРЕНО' : '❌ Ошибка';
        
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: cb.id,
            text: response.success ? "✅ Заявка одобрена!" : "❌ Ошибка"
          })
        });

      } else if (data.startsWith("media_reject_")) {
        const appId = data.replace("media_reject_", "");
        response = await processMediaApplication(appId, false);
        statusText = response.success ? '❌ ОТКЛОНЕНО' : '❌ Ошибка';
        
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: cb.id,
            text: response.success ? "❌ Заявка отклонена" : "❌ Ошибка"
          })
        });
      }

      if (messageId && response.success) {
        const originalText = cb.message?.text || "";
        const updatedText = `${originalText}\n\n━━━━━━━━━━━━━━━━━━━━━━━\n📌 <b>РЕШЕНИЕ:</b> ${statusText}\n⏱ <i>${new Date().toLocaleString("ru-RU")}</i>`;

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: CHAT_ID,
            message_id: messageId,
            text: updatedText,
            parse_mode: "HTML",
            reply_markup: {}
          })
        });
      }

      return res.status(200).json({ status: "ok" });

    } catch (error) {
      console.error('❌ Ошибка обработки callback:', error);
      return res.status(200).json({ status: "error" });
    }
  }

  if (req.method === 'POST') {
    const signature = req.headers['x-request-signature'];
    if (!signature) {
      return res.status(403).json({ error: 'Требуется подпись' });
    }

    const { text, actionId, type } = req.body;
    if (!text || !actionId) {
      return res.status(400).json({ error: "Некорректные параметры" });
    }

    const key = `${actionId}_${type}`;
    if (processedRequests.has(key)) {
      return res.status(200).json({ status: 'already_processed' });
    }
    processedRequests.set(key, Date.now());
    
    const now = Date.now();
    for (const [k, time] of processedRequests.entries()) {
      if (now - time > 600000) {
        processedRequests.delete(k);
      }
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: text,
          parse_mode: "HTML",
          disable_web_page_preview: true
        })
      });

      const result = await response.json();
      if (!response.ok) {
        return res.status(500).json({ error: result.description || "Ошибка Telegram API" });
      }

      return res.status(200).json({ success: true, message_id: result.result.message_id });
    } catch (e) {
      return res.status(500).json({ error: 'Ошибка отправки' });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
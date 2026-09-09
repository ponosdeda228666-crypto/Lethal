import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

const BOT_TOKEN = process.env.BOT_TOKEN || "8861768227:AAFbmUHocOR0zatOere_DcXopW-7JYyZbc4";
const CHAT_ID = process.env.CHAT_ID || "8488940016";
const TMP_FILE = path.join('/tmp', 'tg_decisions.json');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-it';

const processedRequests = new Map();

function getLocalDecisions() {
  try {
    return JSON.parse(fs.readFileSync(TMP_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveLocalDecision(id, status) {
  try {
    const data = getLocalDecisions();
    data[id] = status;
    fs.writeFileSync(TMP_FILE, JSON.stringify(data));
  } catch (e) {}
}

function verifyServerRequest(body, signature) {
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');
  return signature === expected;
}

async function syncDecisionCloud(id, status) {
  saveLocalDecision(id, status);
  try {
    await fetch(`https://kvdb.io/8861768227_lethal_dlc/${id}`, {
      method: 'POST',
      body: status
    });
  } catch (e) {}
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
  } catch (e) {}
  return null;
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
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const tgData = await tgRes.json();
    return res.status(200).json({ webhookUrl, tgResponse: tgData });
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
    const cb = req.body.callback_query;
    const data = cb.data || "";
    const messageId = cb.message?.message_id;
    const originalText = cb.message?.text || "";

    let statusDecision = "ОБРАБОТАНО";
    let actionId = "";
    let approved = false;

    if (data.startsWith("accept_")) {
      statusDecision = "✅ ОДОБРЕНО АДМИНИСТРАТОРОМ";
      actionId = data.replace(/^accept_[^_]+_/, "");
      approved = true;
      if (actionId) await syncDecisionCloud(actionId, "approved");
    } else if (data.startsWith("reject_")) {
      statusDecision = "❌ ОТКЛОНЕНО АДМИНИСТРАТОРОМ";
      actionId = data.replace(/^reject_[^_]+_/, "");
      if (actionId) await syncDecisionCloud(actionId, "rejected");
    }

    const updatedText = `${originalText}\n\n📌 <b>РЕШЕНИЕ:</b> ${statusDecision}\n⏱ <i>${new Date().toLocaleString("ru-RU")}</i>`;

    if (messageId) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          message_id: messageId,
          text: updatedText,
          parse_mode: "HTML"
        })
      });
    }

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: cb.id,
        text: approved ? "Заявка успешно одобрена!" : "Заявка отклонена."
      })
    });

    return res.status(200).json({ status: "ok" });
  }

  if (req.method === 'POST') {
    // Только сервер может отправлять!
    const signature = req.headers['x-request-signature'];
    if (!verifyServerRequest(req.body, signature)) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const { text, actionId, type } = req.body;
    if (!text || !actionId) {
      return res.status(400).json({ error: "Invalid parameters" });
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

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "✅ Принять", callback_data: `accept_${type || 'req'}_${actionId}` },
          { text: "❌ Отклонить", callback_data: `reject_${type || 'req'}_${actionId}` }
        ]
      ]
    };

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        parse_mode: "HTML",
        reply_markup: replyMarkup
      })
    });

    const result = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: result.description || "Telegram API error" });
    }

    return res.status(200).json({ success: true, message_id: result.result.message_id });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
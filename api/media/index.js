import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { verifyToken } from '../auth.js';

const USERS_FILE = path.join(process.cwd(), 'users.json');

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {}
}

async function sendTelegramNotification(application, userEmail) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) return;

  const message = `
🎬 <b>НОВАЯ МЕДИА ЗАЯВКА!</b>

👤 <b>Пользователь:</b> ${application.userName}
📧 <b>Email:</b> ${userEmail}
📱 <b>TikTok:</b> ${application.tiktokUrl}
🏷 <b>Промокод:</b> <code>${application.promoCode}</code>
📞 <b>Telegram:</b> ${application.telegramContact}
🆔 <b>ID:</b> <code>${application.id}</code>
📅 <b>Дата:</b> ${new Date(application.createdAt).toLocaleString('ru-RU')}
  `;

  const keyboard = {
    inline_keyboard: [[
      { text: "✅ Одобрить", callback_data: `media_approve_${application.id}` },
      { text: "❌ Отклонить", callback_data: `media_reject_${application.id}` }
    ]]
  };

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        reply_markup: keyboard,
        disable_web_page_preview: true
      })
    });
  } catch (e) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const token = req.headers['x-auth-token'];
    if (!token) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const email = verifyToken(token);
    if (!email) {
      return res.status(401).json({ error: 'Неверный токен' });
    }

    const users = loadUsers();
    const user = users[email];
    if (!user) {
      return res.status(401).json({ 
        error: 'Пользователь не найден. Пожалуйста, перезайдите в аккаунт.'
      });
    }

    // GET - получение заявок
    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        applications: user.mediaApplications || []
      });
    }

    // POST - подача заявки
    if (req.method === 'POST') {
      const { tiktokUrl, promoCode, telegramContact } = req.body;

      if (!tiktokUrl || !promoCode || !telegramContact) {
        return res.status(400).json({ error: 'Заполните все поля' });
      }

      const applicationId = 'M' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(4).toString('hex').toUpperCase();
      
      const application = {
        id: applicationId,
        tiktokUrl: tiktokUrl,
        promoCode: promoCode.toUpperCase(),
        telegramContact: telegramContact,
        status: 'pending',
        createdAt: new Date().toISOString(),
        userName: user.name || email.split('@')[0],
        userEmail: email
      };

      if (!user.mediaApplications) {
        user.mediaApplications = [];
      }
      user.mediaApplications.push(application);
      
      users[email] = user;
      saveUsers(users);

      await sendTelegramNotification(application, email);

      return res.status(200).json({
        success: true,
        application: application,
        message: 'Заявка подана!'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('❌ Ошибка media:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка' });
  }
}
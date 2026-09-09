import crypto from 'crypto';
import { loadUsers, saveUsers, verifyToken, setCors } from './_utils.js';

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
🆔 <b>ID заявки:</b> <code>${application.id}</code>
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
  setCors(res);

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
      return res.status(401).json({ error: 'Пользователь не найден. Перезайдите в аккаунт.' });
    }

    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        applications: user.mediaApplications || []
      });
    }

    if (req.method === 'POST') {
      const { tiktokUrl, promoCode, telegramContact } = req.body;

      if (!tiktokUrl || !promoCode || !telegramContact) {
        return res.status(400).json({ error: 'Заполните все поля' });
      }

      const tiktokRegex = /^https:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)\/@[a-zA-Z0-9._]+(\/)?$/i;
      if (!tiktokRegex.test(tiktokUrl)) {
        return res.status(400).json({ error: 'Некорректная ссылка TikTok' });
      }

      const promoRegex = /^[A-Z0-9_]{3,12}$/;
      if (!promoRegex.test(promoCode.toUpperCase())) {
        return res.status(400).json({ error: 'Промокод: 3-12 латинских букв, цифр или _' });
      }

      const tgRegex = /^@[a-zA-Z0-9_]{3,32}$/;
      if (!tgRegex.test(telegramContact)) {
        return res.status(400).json({ error: 'Некорректный Telegram (@username)' });
      }

      // Проверяем, не используется ли промокод
      for (const [key, u] of Object.entries(users)) {
        if (u.mediaApplications) {
          for (const app of u.mediaApplications) {
            if (app.status === 'approved' && app.promoCode === promoCode.toUpperCase()) {
              return res.status(400).json({ error: 'Этот промокод уже используется' });
            }
          }
        }
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
        message: '✅ Заявка подана!'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('❌ Ошибка media:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка' });
  }
}
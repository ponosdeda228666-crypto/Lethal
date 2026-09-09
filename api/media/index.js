import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { verifyTokenAndGetUser } from '../auth.js';

const USERS_FILE = path.join(process.cwd(), 'users.json');

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error('Ошибка загрузки пользователей:', e);
    return {};
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Ошибка сохранения пользователей:', e);
  }
}

async function sendTelegramNotification(application, userEmail) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('⚠️ Telegram не настроен');
    return;
  }

  const message = `
🎬 <b>НОВАЯ МЕДИА ЗАЯВКА!</b>

👤 <b>Пользователь:</b> ${application.userName}
📧 <b>Email:</b> ${userEmail}
📱 <b>TikTok:</b> <a href="${application.tiktokUrl}">${application.tiktokUrl}</a>
🏷 <b>Промокод:</b> <code>${application.promoCode}</code>
📞 <b>Telegram:</b> ${application.telegramContact}
🆔 <b>ID заявки:</b> <code>${application.id}</code>
📅 <b>Дата:</b> ${new Date(application.createdAt).toLocaleString('ru-RU')}

━━━━━━━━━━━━━━━━━━━━━━━
<i>Нажмите кнопку ниже для обработки</i>
  `;

  const keyboard = {
    inline_keyboard: [
      [
        { 
          text: "✅ Одобрить", 
          callback_data: `media_approve_${application.id}` 
        },
        { 
          text: "❌ Отклонить", 
          callback_data: `media_reject_${application.id}` 
        }
      ]
    ]
  };

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
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

    if (!response.ok) {
      console.error('❌ Ошибка Telegram:', await response.text());
    } else {
      console.log('✅ Уведомление отправлено в Telegram');
    }
  } catch (e) {
    console.error('❌ Ошибка отправки в Telegram:', e);
  }
}

export default async function handler(req, res) {
  // Настройка CORS
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

    const users = loadUsers();
    const result = verifyTokenAndGetUser(token, users);
    
    if (!result) {
      return res.status(401).json({ error: 'Недействительный токен или пользователь не найден' });
    }

    const { email: foundEmail, user: foundUser } = result;

    // GET - получение заявок
    if (req.method === 'GET') {
      const applications = foundUser.mediaApplications || [];
      return res.status(200).json({
        success: true,
        applications: applications
      });
    }

    // POST - подача заявки
    if (req.method === 'POST') {
      const { tiktokUrl, promoCode, telegramContact } = req.body;

      if (!tiktokUrl || !promoCode || !telegramContact) {
        return res.status(400).json({ 
          error: 'Заполните все поля' 
        });
      }

      const tiktokRegex = /^https:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)\/@[a-zA-Z0-9._]+(\/)?$/i;
      if (!tiktokRegex.test(tiktokUrl)) {
        return res.status(400).json({ 
          error: 'Некорректная ссылка TikTok' 
        });
      }

      const promoRegex = /^[A-Z0-9_]{3,12}$/;
      if (!promoRegex.test(promoCode.toUpperCase())) {
        return res.status(400).json({ 
          error: 'Промокод: 3-12 латинских букв, цифр или _' 
        });
      }

      const tgRegex = /^@[a-zA-Z0-9_]{3,32}$/;
      if (!tgRegex.test(telegramContact)) {
        return res.status(400).json({ 
          error: 'Некорректный Telegram (@username)' 
        });
      }

      // Проверка на дубликат промокода
      for (const [key, user] of Object.entries(users)) {
        if (user.mediaApplications) {
          for (const app of user.mediaApplications) {
            if (app.status === 'approved' && app.promoCode === promoCode.toUpperCase()) {
              return res.status(400).json({ 
                error: 'Этот промокод уже используется' 
              });
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
        userName: foundUser.name || foundEmail.split('@')[0],
        userEmail: foundEmail
      };

      if (!foundUser.mediaApplications) {
        foundUser.mediaApplications = [];
      }
      foundUser.mediaApplications.push(application);
      
      users[foundEmail] = foundUser;
      saveUsers(users);

      await sendTelegramNotification(application, foundEmail);

      return res.status(200).json({
        success: true,
        application: application,
        message: 'Заявка подана! Ожидайте подтверждения.'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('❌ Ошибка media:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера: ' + error.message });
  }
}
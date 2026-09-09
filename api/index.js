import crypto from 'crypto';
import fs from 'fs';

const USERS_FILE = '/tmp/users.json';
const PROMO_FILE = '/tmp/promocodes.json';

// === UTILS ===
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

function loadPromocodes() {
  try {
    if (!fs.existsSync(PROMO_FILE)) {
      fs.writeFileSync(PROMO_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    return JSON.parse(fs.readFileSync(PROMO_FILE, 'utf8'));
  } catch { return {}; }
}

function savePromocodes(data) {
  try { fs.writeFileSync(PROMO_FILE, JSON.stringify(data, null, 2)); } catch {}
}

// ПРОСТЕЙШИЙ ТОКЕН - случайная строка
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Проверка токена - ищем пользователя с таким токеном
function verifyToken(token) {
  try {
    if (!token) return null;
    const users = loadUsers();
    for (const [email, user] of Object.entries(users)) {
      if (user.token === token) {
        return email;
      }
    }
    return null;
  } catch { return null; }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token, X-Requested-With');
}

// === TELEGRAM NOTIFY ===
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

// === MAIN HANDLER ===
export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // === GET /api/balance ===
  if (path === '/api/balance' && req.method === 'GET') {
    try {
      const token = req.headers['x-auth-token'];
      if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
      const email = verifyToken(token);
      if (!email) return res.status(401).json({ error: 'Неверный токен' });
      const users = loadUsers();
      const user = users[email];
      if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
      return res.status(200).json({ success: true, balance: user.balance || 0 });
    } catch (e) {
      return res.status(500).json({ error: 'Внутренняя ошибка' });
    }
  }

  // === POST /api/auth ===
  if (path === '/api/auth' && req.method === 'POST') {
    try {
      const { email, password, name, action } = req.body;
      const normalizedEmail = email.toLowerCase().trim();
      const users = loadUsers();

      if (action === 'register') {
        if (users[normalizedEmail]) {
          return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        
        const token = generateToken();
        
        users[normalizedEmail] = {
          email: normalizedEmail,
          name: name || normalizedEmail.split('@')[0],
          password: password,
          token: token,
          balance: 0,
          keys: [],
          withdrawals: [],
          mediaApplications: [],
          createdAt: new Date().toISOString()
        };
        saveUsers(users);
        
        return res.status(200).json({
          success: true,
          token: token,
          user: { email: normalizedEmail, name: users[normalizedEmail].name, balance: 0 }
        });
      }

      if (action === 'login') {
        const user = users[normalizedEmail];
        if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
        if (user.password !== password) return res.status(401).json({ error: 'Неверный пароль' });
        
        // Обновляем токен при входе
        const token = generateToken();
        user.token = token;
        users[normalizedEmail] = user;
        saveUsers(users);
        
        return res.status(200).json({
          success: true,
          token: token,
          user: { email: normalizedEmail, name: user.name, balance: user.balance || 0 }
        });
      }

      return res.status(400).json({ error: 'Неизвестное действие' });
    } catch (e) {
      return res.status(500).json({ error: 'Внутренняя ошибка' });
    }
  }

  // === GET /api/auth (проверка сессии) ===
  if (path === '/api/auth' && req.method === 'GET') {
    try {
      const token = req.headers['x-auth-token'];
      if (!token) return res.status(401).json({ error: 'Нет токена' });
      const email = verifyToken(token);
      if (!email) return res.status(401).json({ error: 'Неверный токен' });
      const users = loadUsers();
      const user = users[email];
      if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
      return res.status(200).json({
        success: true,
        user: { email, name: user.name || 'User', balance: user.balance || 0 }
      });
    } catch (e) {
      return res.status(500).json({ error: 'Внутренняя ошибка' });
    }
  }

  // === GET /api/media ===
  if (path === '/api/media' && req.method === 'GET') {
    try {
      const token = req.headers['x-auth-token'];
      if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
      const email = verifyToken(token);
      if (!email) return res.status(401).json({ error: 'Неверный токен' });
      const users = loadUsers();
      const user = users[email];
      if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
      return res.status(200).json({ success: true, applications: user.mediaApplications || [] });
    } catch (e) {
      return res.status(500).json({ error: 'Внутренняя ошибка' });
    }
  }

  // === POST /api/media ===
  if (path === '/api/media' && req.method === 'POST') {
    try {
      const token = req.headers['x-auth-token'];
      if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
      const email = verifyToken(token);
      if (!email) return res.status(401).json({ error: 'Неверный токен' });

      const users = loadUsers();
      const user = users[email];
      if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

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

      if (!user.mediaApplications) user.mediaApplications = [];
      user.mediaApplications.push(application);
      users[email] = user;
      saveUsers(users);

      await sendTelegramNotification(application, email);

      return res.status(200).json({
        success: true,
        application: application,
        message: '✅ Заявка подана!'
      });
    } catch (e) {
      return res.status(500).json({ error: 'Внутренняя ошибка' });
    }
  }

  // === POST /api/purchase ===
  if (path === '/api/purchase' && req.method === 'POST') {
    try {
      const token = req.headers['x-auth-token'];
      if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
      const email = verifyToken(token);
      if (!email) return res.status(401).json({ error: 'Неверный токен' });

      const users = loadUsers();
      const user = users[email];
      if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

      const PRICES = { month: 250, quarter: 400, lifetime: 600, hwid: 400 };
      const { planId } = req.body;
      if (!planId) return res.status(400).json({ error: 'Укажите тариф' });

      const price = PRICES[planId];
      if (!price) return res.status(400).json({ error: 'Неверный тариф' });
      if (user.balance < price) {
        return res.status(400).json({ error: 'Недостаточно средств', balance: user.balance, required: price });
      }

      user.balance -= price;
      const key = 'L101N-' + crypto.randomBytes(6).toString('hex').toUpperCase();

      if (!user.keys) user.keys = [];
      user.keys.push({ key, plan: planId, price, date: new Date().toISOString() });

      if (planId === 'hwid') {
        user.hwid = 'RESET-' + Date.now().toString(36).toUpperCase();
      } else {
        user.subscription = {
          active: true,
          plan: planId,
          expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };
      }

      users[email] = user;
      saveUsers(users);

      return res.status(200).json({ success: true, key, balance: user.balance, plan: planId });
    } catch (e) {
      return res.status(500).json({ error: 'Внутренняя ошибка' });
    }
  }

  // === GET /api/media/stats ===
  if (path === '/api/media/stats' && req.method === 'GET') {
    try {
      const token = req.headers['x-auth-token'];
      if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
      const email = verifyToken(token);
      if (!email) return res.status(401).json({ error: 'Неверный токен' });

      const users = loadUsers();
      const user = users[email];
      if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

      const { promo } = url.searchParams;
      if (!promo) return res.status(400).json({ error: 'Укажите промокод' });

      const hasAccess = user.mediaApplications?.some(app => app.status === 'approved' && app.promoCode === promo);
      if (!hasAccess) return res.status(403).json({ error: 'Доступ запрещен' });

      const promocodes = loadPromocodes();
      const stats = promocodes[promo] || { uses: 0, volume: 0, reward: 0 };

      return res.status(200).json({ success: true, stats });
    } catch (e) {
      return res.status(500).json({ error: 'Внутренняя ошибка' });
    }
  }

  // === POST /api/media/claim ===
  if (path === '/api/media/claim' && req.method === 'POST') {
    try {
      const token = req.headers['x-auth-token'];
      if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
      const email = verifyToken(token);
      if (!email) return res.status(401).json({ error: 'Неверный токен' });

      const users = loadUsers();
      const user = users[email];
      if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

      const { promoCode } = req.body;
      if (!promoCode) return res.status(400).json({ error: 'Укажите промокод' });

      const hasAccess = user.mediaApplications?.some(app => app.status === 'approved' && app.promoCode === promoCode);
      if (!hasAccess) return res.status(403).json({ error: 'Доступ запрещен' });

      const promocodes = loadPromocodes();
      const stats = promocodes[promoCode];
      if (!stats || !stats.reward || stats.reward <= 0) {
        return res.status(400).json({ error: 'Нет средств для вывода' });
      }

      const amount = stats.reward;
      user.balance = (user.balance || 0) + amount;
      stats.reward = 0;

      users[email] = user;
      saveUsers(users);
      savePromocodes(promocodes);

      return res.status(200).json({ success: true, amount, balance: user.balance });
    } catch (e) {
      return res.status(500).json({ error: 'Внутренняя ошибка' });
    }
  }

  // === 404 ===
  return res.status(404).json({ error: 'API endpoint not found' });
}
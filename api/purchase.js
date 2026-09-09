import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

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

function verifyToken(token) {
  try {
    if (!token) return null;
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    return decoded.payload?.email || null;
  } catch {
    return null;
  }
}

const PRICES = { 
  'month': 250, 
  'quarter': 400, 
  'lifetime': 600, 
  'hwid': 400 
};

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
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    const { planId } = req.body;
    if (!planId) {
      return res.status(400).json({ error: 'Укажите тариф' });
    }

    const price = PRICES[planId];
    if (!price) {
      return res.status(400).json({ error: 'Неверный тариф' });
    }

    if (user.balance < price) {
      return res.status(400).json({ 
        error: 'Недостаточно средств',
        balance: user.balance,
        required: price
      });
    }

    user.balance -= price;
    
    const key = 'L101N-' + crypto.randomBytes(6).toString('hex').toUpperCase();

    if (!user.keys) user.keys = [];
    user.keys.push({
      key: key,
      plan: planId,
      price: price,
      date: new Date().toISOString()
    });

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

    // Уведомление в Telegram
    if (process.env.BOT_TOKEN && process.env.CHAT_ID) {
      try {
        const tgText = `🛒 <b>НОВАЯ ПОКУПКА!</b>\n\n` +
                       `👤 <b>Пользователь:</b> ${email}\n` +
                       `📦 <b>Тариф:</b> ${planId}\n` +
                       `💰 <b>Сумма:</b> ${price} ₽\n` +
                       `🔑 <b>Ключ:</b> ${key}\n` +
                       `💳 <b>Остаток:</b> ${user.balance} ₽`;
        
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.CHAT_ID,
            text: tgText,
            parse_mode: 'HTML'
          })
        });
      } catch (e) {}
    }

    return res.status(200).json({
      success: true,
      key: key,
      balance: user.balance,
      plan: planId
    });

  } catch (error) {
    console.error('❌ Ошибка purchase:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка' });
  }
}
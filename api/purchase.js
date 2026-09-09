import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const USERS_FILE = path.join(__dirname, '..', 'users.json');

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Ошибка сохранения:', e);
  }
}

function verifyToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(JSON.stringify(decoded.payload))
      .digest('hex');
    if (decoded.signature !== expectedSignature) return null;
    return decoded.payload.userId;
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

    const userId = verifyToken(token);
    if (!userId) {
      return res.status(401).json({ error: 'Недействительный токен' });
    }

    const { planId } = req.body;
    if (!planId) {
      return res.status(400).json({ error: 'Укажите тариф' });
    }

    const price = PRICES[planId];
    if (!price) {
      return res.status(400).json({ error: 'Неверный тариф' });
    }

    const users = loadUsers();
    let foundUser = null;
    let foundEmail = null;
    for (const [key, user] of Object.entries(users)) {
      if (user.id === userId) {
        foundUser = user;
        foundEmail = key;
        break;
      }
    }

    if (!foundUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (foundUser.balance < price) {
      return res.status(400).json({ 
        error: 'Недостаточно средств',
        balance: foundUser.balance,
        required: price
      });
    }

    // Списываем баланс
    foundUser.balance -= price;
    
    // Генерируем ключ
    const key = 'L101N-' + crypto.randomBytes(6).toString('hex').toUpperCase();

    if (!foundUser.keys) foundUser.keys = [];
    foundUser.keys.push({
      key: key,
      plan: planId,
      price: price,
      date: new Date().toISOString()
    });

    if (planId === 'hwid') {
      foundUser.hwid = 'RESET-' + Date.now().toString(36).toUpperCase();
    } else {
      foundUser.subscription = {
        active: true,
        plan: planId,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };
    }

    saveUsers(users);

    // Уведомление в Telegram
    if (process.env.BOT_TOKEN && process.env.CHAT_ID) {
      try {
        const tgText = `🛒 <b>НОВАЯ ПОКУПКА!</b>\n\n` +
                       `👤 <b>Пользователь:</b> ${foundEmail}\n` +
                       `📦 <b>Тариф:</b> ${planId}\n` +
                       `💰 <b>Сумма:</b> ${price} ₽\n` +
                       `🔑 <b>Ключ:</b> ${key}\n` +
                       `💳 <b>Остаток:</b> ${foundUser.balance} ₽`;
        
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.CHAT_ID,
            text: tgText,
            parse_mode: 'HTML'
          })
        });
      } catch (e) {
        console.error('Ошибка отправки в Telegram:', e);
      }
    }

    return res.status(200).json({
      success: true,
      key: key,
      balance: foundUser.balance,
      plan: planId
    });

  } catch (error) {
    console.error('❌ Ошибка purchase:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
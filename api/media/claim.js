import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const USERS_FILE = path.join(process.cwd(), 'users.json');
const PROMO_FILE = path.join(process.cwd(), 'promocodes.json');

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
    if (!fs.existsSync(PROMO_FILE)) return {};
    return JSON.parse(fs.readFileSync(PROMO_FILE, 'utf8'));
  } catch { return {}; }
}

function savePromocodes(promocodes) {
  try { fs.writeFileSync(PROMO_FILE, JSON.stringify(promocodes, null, 2)); } catch {}
}

function getUserIdFromToken(token) {
  try {
    if (!token) return null;
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    return decoded.payload?.userId || decoded.payload?.email || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = req.headers['x-auth-token'];
    if (!token) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const userId = getUserIdFromToken(token);
    if (!userId) {
      return res.status(401).json({ error: 'Неверный токен' });
    }

    const users = loadUsers();
    let foundUser = null;
    let foundEmail = null;
    for (const [email, user] of Object.entries(users)) {
      if (user.id === userId || email === userId) {
        foundUser = user;
        foundEmail = email;
        break;
      }
    }

    if (!foundUser) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    const { promoCode } = req.body;
    if (!promoCode) {
      return res.status(400).json({ error: 'Укажите промокод' });
    }

    const hasAccess = foundUser.mediaApplications?.some(app => 
      app.status === 'approved' && app.promoCode === promoCode
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const promocodes = loadPromocodes();
    const stats = promocodes[promoCode];
    if (!stats || !stats.reward || stats.reward <= 0) {
      return res.status(400).json({ error: 'Нет средств для вывода' });
    }

    const amount = stats.reward;
    foundUser.balance = (foundUser.balance || 0) + amount;
    stats.reward = 0;

    users[foundEmail] = foundUser;
    saveUsers(users);
    savePromocodes(promocodes);

    return res.status(200).json({
      success: true,
      amount: amount,
      balance: foundUser.balance
    });

  } catch (error) {
    console.error('❌ Ошибка claim:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка' });
  }
}
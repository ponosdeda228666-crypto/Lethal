import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-it';
const USERS_FILE = path.join(process.cwd(), 'users.json');
const PROMO_FILE = path.join(process.cwd(), 'promocodes.json');

function loadUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadPromocodes() {
  try {
    const data = fs.readFileSync(PROMO_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function savePromocodes(promocodes) {
  fs.writeFileSync(PROMO_FILE, JSON.stringify(promocodes, null, 2));
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = req.headers['x-auth-token'];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { planId, promoCode } = req.body;
  if (!planId) {
    return res.status(400).json({ error: 'Plan ID required' });
  }

  const prices = {
    'month': 250,
    'quarter': 400,
    'lifetime': 600,
    'hwid': 400
  };

  const price = prices[planId];
  if (!price) {
    return res.status(400).json({ error: 'Invalid plan' });
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
    return res.status(404).json({ error: 'User not found' });
  }

  // Проверка промокода
  let discount = 0;
  if (promoCode) {
    const promocodes = loadPromocodes();
    if (promocodes[promoCode] && promocodes[promoCode].owner !== foundEmail) {
      discount = Math.round(price * 0.10);
      promocodes[promoCode].uses = (promocodes[promoCode].uses || 0) + 1;
      promocodes[promoCode].volume = (promocodes[promoCode].volume || 0) + (price - discount);
      promocodes[promoCode].reward = (promocodes[promoCode].reward || 0) + Math.round((price - discount) * 0.15);
      savePromocodes(promocodes);
    }
  }

  const finalPrice = Math.max(0, price - discount);
  
  if (foundUser.balance < finalPrice) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  // Списываем баланс
  foundUser.balance -= finalPrice;

  // Генерируем ключ
  const key = 'L101N-' + crypto.randomBytes(6).toString('hex').toUpperCase();

  if (!foundUser.keys) foundUser.keys = [];
  foundUser.keys.push({
    key: key,
    plan: planId,
    price: finalPrice,
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

  return res.status(200).json({
    success: true,
    key: key,
    balance: foundUser.balance,
    plan: planId
  });
}
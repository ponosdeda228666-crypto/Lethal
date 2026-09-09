import crypto from 'crypto';
import { loadUsers, saveUsers, verifyToken, setCors } from './_utils.js';

const PRICES = { 
  'month': 250, 
  'quarter': 400, 
  'lifetime': 600, 
  'hwid': 400 
};

export default async function handler(req, res) {
  setCors(res);

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
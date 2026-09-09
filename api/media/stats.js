import fs from 'fs';
import { loadUsers, verifyToken, setCors } from '../_utils.js';

const PROMO_FILE = '/tmp/promocodes.json';

function loadPromocodes() {
  try {
    if (!fs.existsSync(PROMO_FILE)) {
      fs.writeFileSync(PROMO_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    return JSON.parse(fs.readFileSync(PROMO_FILE, 'utf8'));
  } catch { return {}; }
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
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

    const { promo } = req.query;
    if (!promo) {
      return res.status(400).json({ error: 'Укажите промокод' });
    }

    const hasAccess = user.mediaApplications?.some(app => 
      app.status === 'approved' && app.promoCode === promo
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const promocodes = loadPromocodes();
    const stats = promocodes[promo] || { uses: 0, volume: 0, reward: 0 };

    return res.status(200).json({
      success: true,
      stats: stats
    });

  } catch (error) {
    console.error('❌ Ошибка stats:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка' });
  }
}
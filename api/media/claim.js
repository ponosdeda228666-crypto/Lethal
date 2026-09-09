import { loadUsers, saveUsers, loadPromocodes, savePromocodes, verifyToken, setCors } from '../_utils.js';

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

    const { promoCode } = req.body;
    if (!promoCode) {
      return res.status(400).json({ error: 'Укажите промокод' });
    }

    const hasAccess = user.mediaApplications?.some(app => 
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
    user.balance = (user.balance || 0) + amount;
    stats.reward = 0;

    users[email] = user;
    saveUsers(users);
    savePromocodes(promocodes);

    return res.status(200).json({
      success: true,
      amount: amount,
      balance: user.balance
    });

  } catch (error) {
    console.error('❌ Ошибка claim:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка' });
  }
}
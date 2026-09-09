import { loadUsers, saveUsers, generateToken, verifyToken, setCors } from './_utils.js';

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
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
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = '';
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body);
    const { email, password, name, action } = parsed;

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
    return res.status(500).json({ error: 'Ошибка: ' + e.message });
  }
}
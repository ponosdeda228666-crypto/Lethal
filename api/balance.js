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
  } catch {
    return {};
  }
}

function verifyToken(token) {
  try {
    if (!token) return null;
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    return decoded.email || null;
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

    return res.status(200).json({
      success: true,
      balance: user.balance || 0
    });

  } catch (error) {
    console.error('❌ Ошибка balance:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка' });
  }
}
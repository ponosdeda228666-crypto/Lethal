import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const USERS_FILE = path.join(process.cwd(), 'users.json');
const SECRET = 'lethal-super-secret-2026';

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

function generateToken(email) {
  const data = `${email}|${Date.now()}`;
  const hash = crypto.createHash('sha256').update(data + SECRET).digest('hex');
  return Buffer.from(JSON.stringify({ email, hash, time: Date.now() })).toString('base64');
}

function verifyToken(token) {
  try {
    if (!token) return null;
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const checkHash = crypto.createHash('sha256').update(`${decoded.email}|${decoded.time}` + SECRET).digest('hex');
    if (decoded.hash !== checkHash) return null;
    return decoded.email;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - проверка сессии
  if (req.method === 'GET') {
    const token = req.headers['x-auth-token'];
    if (!token) {
      return res.status(401).json({ error: 'Нет токена' });
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
      user: {
        email: email,
        name: user.name || 'User',
        balance: user.balance || 0
      }
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password, name, action } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const users = loadUsers();

    // РЕГИСТРАЦИЯ
    if (action === 'register') {
      if (users[normalizedEmail]) {
        return res.status(400).json({ error: 'Пользователь уже существует' });
      }

      users[normalizedEmail] = {
        email: normalizedEmail,
        name: name || normalizedEmail.split('@')[0],
        password: password,
        balance: 0,
        keys: [],
        withdrawals: [],
        mediaApplications: [],
        createdAt: new Date().toISOString()
      };

      saveUsers(users);
      
      const token = generateToken(normalizedEmail);
      
      return res.status(200).json({
        success: true,
        token: token,
        user: {
          email: normalizedEmail,
          name: users[normalizedEmail].name,
          balance: 0
        }
      });
    }

    // ЛОГИН
    if (action === 'login') {
      const user = users[normalizedEmail];
      
      if (!user) {
        return res.status(401).json({ error: 'Пользователь не найден' });
      }

      if (user.password !== password) {
        return res.status(401).json({ error: 'Неверный пароль' });
      }

      const token = generateToken(normalizedEmail);
      
      return res.status(200).json({
        success: true,
        token: token,
        user: {
          email: normalizedEmail,
          name: user.name,
          balance: user.balance || 0
        }
      });
    }

    return res.status(400).json({ error: 'Неизвестное действие' });

  } catch (error) {
    console.error('❌ Ошибка auth:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка' });
  }
}
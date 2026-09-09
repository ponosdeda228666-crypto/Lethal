import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const USERS_FILE = path.join(process.cwd(), 'users.json');

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error('Ошибка загрузки пользователей:', e);
    return {};
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Ошибка сохранения пользователей:', e);
  }
}

function generateToken(email) {
  const payload = { 
    email: email,
    timestamp: Date.now(),
    random: crypto.randomBytes(16).toString('hex')
  };
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
}

export function verifyToken(token) {
  try {
    if (!token) return null;
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(JSON.stringify(decoded.payload))
      .digest('hex');
    if (decoded.signature !== expectedSignature) return null;
    return decoded.payload.email;
  } catch (e) {
    console.error('Ошибка verifyToken:', e);
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

    // РЕГИСТРАЦИЯ
    if (action === 'register') {
      const users = loadUsers();
      
      if (users[normalizedEmail]) {
        return res.status(400).json({ error: 'Пользователь уже существует' });
      }

      const passwordHash = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(password)
        .digest('hex');

      users[normalizedEmail] = {
        email: normalizedEmail,
        name: name || normalizedEmail.split('@')[0],
        passwordHash: passwordHash,
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
      const users = loadUsers();
      const user = users[normalizedEmail];
      
      if (!user) {
        return res.status(401).json({ error: 'Пользователь не найден' });
      }

      const passwordHash = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(password)
        .digest('hex');

      if (user.passwordHash !== passwordHash) {
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
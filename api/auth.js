import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const USERS_FILE = path.join(process.cwd(), 'users.json');
const SECRET = 'lethal-dlc-super-secret-2026';

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

// ============================================================
// ПРОСТАЯ ГЕНЕРАЦИЯ ТОКЕНА
// ============================================================
function generateToken(email) {
  const data = `${email}:${Date.now()}`;
  const signature = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
  const token = Buffer.from(JSON.stringify({ email, signature, time: Date.now() })).toString('base64');
  return token;
}

// ============================================================
// ПРОСТАЯ ПРОВЕРКА ТОКЕНА
// ============================================================
function verifyToken(token) {
  try {
    if (!token) return null;
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const expectedSignature = crypto
      .createHmac('sha256', SECRET)
      .update(`${decoded.email}:${decoded.time}`)
      .digest('hex');
    if (decoded.signature !== expectedSignature) return null;
    return decoded.email;
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

  // ============================================================
  // GET - ПРОВЕРКА СЕССИИ
  // ============================================================
  if (req.method === 'GET') {
    const token = req.headers['x-auth-token'];
    console.log('🔍 GET /api/auth - Проверка токена:', token ? 'Есть' : 'Нет');
    
    if (!token) {
      console.log('❌ Токен отсутствует');
      return res.status(401).json({ error: 'Нет токена' });
    }
    
    const email = verifyToken(token);
    console.log('🔍 Email из токена:', email);
    
    if (!email) {
      console.log('❌ Неверный токен');
      return res.status(401).json({ error: 'Неверный токен' });
    }

    const users = loadUsers();
    const user = users[email];
    if (!user) {
      console.log('❌ Пользователь не найден:', email);
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    console.log('✅ Сессия валидна:', email);
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

    console.log('📝 Auth request:', { email: normalizedEmail, action });

    // ============================================================
    // РЕГИСТРАЦИЯ
    // ============================================================
    if (action === 'register') {
      console.log('📝 Регистрация:', normalizedEmail);
      
      if (users[normalizedEmail]) {
        console.log('❌ Пользователь уже существует');
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
      
      console.log('✅ Регистрация успешна:', normalizedEmail);
      
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

    // ============================================================
    // ЛОГИН
    // ============================================================
    if (action === 'login') {
      console.log('📝 Вход:', normalizedEmail);
      
      const user = users[normalizedEmail];
      
      if (!user) {
        console.log('❌ Пользователь не найден:', normalizedEmail);
        return res.status(401).json({ error: 'Пользователь не найден' });
      }

      if (user.password !== password) {
        console.log('❌ Неверный пароль');
        return res.status(401).json({ error: 'Неверный пароль' });
      }

      const token = generateToken(normalizedEmail);
      
      console.log('✅ Вход успешен:', normalizedEmail);
      
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

    console.log('❌ Неизвестное действие:', action);
    return res.status(400).json({ error: 'Неизвестное действие' });

  } catch (error) {
    console.error('❌ Ошибка auth:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка: ' + error.message });
  }
}
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

function generateToken(userId, email) {
  const payload = { 
    userId: userId,
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

export function verifyTokenAndGetUser(token, users) {
  try {
    if (!token) return null;
    
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(JSON.stringify(decoded.payload))
      .digest('hex');
    
    if (decoded.signature !== expectedSignature) return null;

    const userId = decoded.payload.userId;
    const email = decoded.payload.email;

    for (const [userEmail, user] of Object.entries(users)) {
      if (user.id === userId) {
        return { email: userEmail, user };
      }
    }

    if (email && users[email]) {
      return { email, user: users[email] };
    }

    return null;
  } catch (e) {
    console.error('❌ Ошибка проверки токена:', e);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const users = loadUsers();

    // === НОВЫЙ ЭНДПОИНТ: ПРОВЕРКА СЕССИИ ===
    if (req.method === 'GET') {
      const token = req.headers['x-auth-token'];
      if (!token) {
        return res.status(401).json({ error: 'Токен отсутствует' });
      }
      
      const result = verifyTokenAndGetUser(token, users);
      
      if (!result) {
        return res.status(401).json({ error: 'Недействительный токен' });
      }
      
      return res.status(200).json({
        success: true,
        user: {
          id: result.user.id,
          email: result.email,
          name: result.user.name,
          balance: result.user.balance || 0
        }
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, password, name, action } = req.body;
    
    console.log('📝 Auth request:', { email, action, hasPassword: !!password });

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // === РЕГИСТРАЦИЯ ===
    if (action === 'register') {
      console.log('📝 Регистрация:', normalizedEmail);
      
      if (users[normalizedEmail]) {
        return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
      }

      const userId = 'U' + crypto.randomBytes(6).toString('hex').toUpperCase();
      const passwordHash = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(password)
        .digest('hex');

      const newUser = {
        id: userId,
        email: normalizedEmail,
        name: name || normalizedEmail.split('@')[0],
        passwordHash: passwordHash,
        balance: 0,
        keys: [],
        withdrawals: [],
        mediaApplications: [],
        createdAt: new Date().toISOString()
      };

      users[normalizedEmail] = newUser;
      saveUsers(users);
      
      const token = generateToken(userId, normalizedEmail);
      
      console.log('✅ Регистрация успешна:', normalizedEmail);
      
      return res.status(200).json({
        success: true,
        token: token,
        user: {
          id: userId,
          email: normalizedEmail,
          name: newUser.name,
          balance: 0
        }
      });
    }

    // === ЛОГИН ===
    if (action === 'login') {
      console.log('📝 Вход:', normalizedEmail);
      
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

      if (!user.id) {
        user.id = 'U' + crypto.randomBytes(6).toString('hex').toUpperCase();
        users[normalizedEmail] = user;
        saveUsers(users);
        console.log(`🆔 Создан ID для ${normalizedEmail}: ${user.id}`);
      }

      const token = generateToken(user.id, normalizedEmail);
      
      console.log('✅ Вход успешен:', normalizedEmail);
      
      return res.status(200).json({
        success: true,
        token: token,
        user: {
          id: user.id,
          email: normalizedEmail,
          name: user.name,
          balance: user.balance || 0
        }
      });
    }

    return res.status(400).json({ error: 'Неизвестное действие' });

  } catch (error) {
    console.error('❌ Ошибка auth:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const USERS_FILE = path.join(__dirname, '..', 'users.json');

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

function verifyToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(JSON.stringify(decoded.payload))
      .digest('hex');
    if (decoded.signature !== expectedSignature) return null;
    if (Date.now() - decoded.payload.timestamp > 86400000) return null; // 24 часа
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

  try {
    const token = req.headers['x-auth-token'];
    if (!token) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const userId = verifyToken(token);
    if (!userId) {
      return res.status(401).json({ error: 'Недействительный токен' });
    }

    const users = loadUsers();
    let foundUser = null;
    for (const [key, user] of Object.entries(users)) {
      if (user.id === userId) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    return res.status(200).json({
      success: true,
      balance: foundUser.balance || 0,
      currency: 'RUB'
    });

  } catch (error) {
    console.error('❌ Ошибка balance:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
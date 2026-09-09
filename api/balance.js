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
    return {};
  }
}

function verifyTokenAndGetUserDirect(token, users) {
  try {
    if (!token) return null;
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(JSON.stringify(decoded.payload))
      .digest('hex');
    if (decoded.signature !== expectedSignature) return null;
    const userId = decoded.payload.userId;
    for (const [userEmail, user] of Object.entries(users)) {
      if (user.id === userId) return { email: userEmail, user };
    }
    return null;
  } catch { return null; }
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

    const users = loadUsers();
    const result = verifyTokenAndGetUserDirect(token, users);
    
    if (!result) {
      return res.status(401).json({ error: 'Недействительный токен' });
    }

    return res.status(200).json({
      success: true,
      balance: result.user.balance || 0,
      currency: 'RUB'
    });

  } catch (error) {
    console.error('❌ Ошибка balance:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера: ' + error.message });
  }
}
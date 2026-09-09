import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-it';
const USERS_FILE = path.join(process.cwd(), 'users.json');

function loadUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
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

  const token = req.headers['x-auth-token'];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: 'Invalid token' });
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
    return res.status(404).json({ error: 'User not found' });
  }

  return res.status(200).json({
    balance: foundUser.balance || 0,
    currency: 'RUB'
  });
}
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

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function generateToken(userId) {
  const payload = {
    userId: userId,
    timestamp: Date.now()
  };
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, name, action } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const users = loadUsers();
  const normalizedEmail = email.toLowerCase().trim();

  if (action === 'register') {
    if (users[normalizedEmail]) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const userId = 'U' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const passwordHash = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(password)
      .digest('hex');

    users[normalizedEmail] = {
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

    saveUsers(users);
    
    const token = generateToken(userId);
    return res.status(200).json({
      success: true,
      token: token,
      user: {
        id: userId,
        email: normalizedEmail,
        name: users[normalizedEmail].name,
        balance: 0
      }
    });
  }

  // Login
  const user = users[normalizedEmail];
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  const passwordHash = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(password)
    .digest('hex');

  if (user.passwordHash !== passwordHash) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = generateToken(user.id);
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
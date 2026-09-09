import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DA_SECRET = process.env.DA_SECRET || 'your-donationalerts-secret';
const USERS_FILE = path.join(process.cwd(), 'users.json');
const verifiedTransactions = new Map();

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

function verifyDASignature(body, signature) {
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', DA_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');
  return signature === expected;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Проверка подписи
  const signature = req.headers['x-da-signature'];
  if (!verifyDASignature(req.body, signature)) {
    console.log('❌ Invalid DA signature');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  const data = req.body.data || req.body;
  const email = data.email || data.receiver || data.user_email;
  const amount = parseFloat(data.amount || data.amount_total || 0);
  const currency = data.currency || 'RUB';
  const username = data.username || data.name || 'User';
  const transactionId = data.id || data.transaction_id || Date.now().toString();

  // Защита от повторной отправки
  if (verifiedTransactions.has(transactionId)) {
    return res.status(200).json({ status: 'already_processed' });
  }

  if (amount < 1) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const users = loadUsers();
  let foundUser = null;
  let foundEmail = null;

  for (const [key, user] of Object.entries(users)) {
    if (key.toLowerCase() === email.toLowerCase()) {
      foundUser = user;
      foundEmail = key;
      break;
    }
  }

  if (!foundUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Фиксируем транзакцию
  verifiedTransactions.set(transactionId, {
    timestamp: Date.now(),
    email: foundEmail,
    amount: amount
  });

  // Начисляем баланс
  foundUser.balance = (foundUser.balance || 0) + amount;
  
  if (!foundUser.deposits) foundUser.deposits = [];
  foundUser.deposits.push({
    id: 'DA-' + transactionId,
    amount: amount,
    currency: currency,
    date: new Date().toISOString(),
    confirmed: true
  });

  saveUsers(users);

  console.log(`✅ Balance updated: ${foundEmail} +${amount} ${currency}`);

  return res.status(200).json({
    success: true,
    user: foundEmail,
    balance: foundUser.balance,
    credited: amount
  });
}
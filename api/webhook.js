import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DA_SECRET = process.env.DA_SECRET || 'fallback-da-secret';
const USERS_FILE = path.join(__dirname, '..', 'users.json');
const verifiedTransactions = new Map();

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

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Ошибка сохранения:', e);
  }
}

function verifyDASignature(body, signature) {
  if (!signature) return false;
  try {
    const expected = crypto
      .createHmac('sha256', DA_SECRET)
      .update(JSON.stringify(body))
      .digest('hex');
    return signature === expected;
  } catch {
    return false;
  }
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

  try {
    const signature = req.headers['x-da-signature'];
    if (!verifyDASignature(req.body, signature)) {
      console.log('❌ Неверная подпись DonationAlerts');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const data = req.body.data || req.body;
    const email = data.email || data.receiver || data.user_email;
    const amount = parseFloat(data.amount || data.amount_total || 0);
    const currency = data.currency || 'RUB';
    const username = data.username || data.name || 'User';
    const transactionId = data.id || data.transaction_id || Date.now().toString();

    console.log(`📥 Получен донат: ${username} (${email}) - ${amount} ${currency}`);

    // Защита от повторной отправки
    if (verifiedTransactions.has(transactionId)) {
      console.log('⚠️ Повторная транзакция:', transactionId);
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
      console.log('❌ Пользователь не найден:', email);
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

    console.log(`✅ Баланс пополнен: ${foundEmail} +${amount} ${currency}`);

    return res.status(200).json({
      success: true,
      user: foundEmail,
      balance: foundUser.balance,
      credited: amount
    });

  } catch (error) {
    console.error('❌ Ошибка webhook:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка' });
  }
}
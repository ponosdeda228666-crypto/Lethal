import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const USERS_FILE = path.join(process.cwd(), 'users.json');
const DA_SECRET = process.env.DA_SECRET || 'fallback-da-secret-2026';

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

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'Webhook active',
      endpoints: {
        donate: 'https://www.donationalerts.com/r/lethaldlc'
      }
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const signature = req.headers['x-da-signature'];
    
    // Проверяем подпись только если секрет задан
    if (DA_SECRET && DA_SECRET !== 'fallback-da-secret-2026') {
      if (!verifyDASignature(req.body, signature)) {
        console.log('❌ Неверная подпись DonationAlerts');
        return res.status(403).json({ error: 'Invalid signature' });
      }
    }

    const data = req.body.data || req.body;
    
    // Парсим email из разных форматов DonationAlerts
    let email = data.email || data.receiver || data.user_email || data.username;
    
    // Если email не найден, пробуем достать из message
    if (!email && data.message) {
      const match = data.message.match(/USER_([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
      if (match) email = match[1];
    }
    
    const amount = parseFloat(data.amount || data.amount_total || 0);
    const currency = data.currency || 'RUB';
    const transactionId = data.id || data.transaction_id || Date.now().toString();
    const username = data.username || data.name || 'User';

    console.log(`📥 Получен донат: ${username} (${email}) - ${amount} ${currency}`);

    if (!email) {
      console.log('❌ Email не найден в запросе');
      return res.status(400).json({ error: 'Email not found' });
    }

    if (amount < 1) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const users = loadUsers();
    const normalizedEmail = email.toLowerCase().trim();
    
    let foundUser = null;
    let foundEmail = null;

    // Ищем пользователя по email
    for (const [key, user] of Object.entries(users)) {
      if (key.toLowerCase() === normalizedEmail) {
        foundUser = user;
        foundEmail = key;
        break;
      }
    }

    if (!foundUser) {
      console.log('❌ Пользователь не найден:', normalizedEmail);
      return res.status(404).json({ error: 'User not found' });
    }

    // Начисляем баланс
    foundUser.balance = (foundUser.balance || 0) + amount;
    
    // Добавляем в историю пополнений
    if (!foundUser.deposits) foundUser.deposits = [];
    foundUser.deposits.push({
      id: 'DA-' + transactionId,
      amount: amount,
      currency: currency,
      date: new Date().toISOString(),
      confirmed: true
    });

    // Генерируем ключ если сумма >= 250 (минимальная цена тарифа)
    if (amount >= 250) {
      const key = 'DA-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      if (!foundUser.keys) foundUser.keys = [];
      foundUser.keys.push({
        key: key,
        plan: 'DonationAlerts',
        price: amount,
        date: new Date().toISOString()
      });
      
      // Активируем подписку на 30 дней
      foundUser.subscription = {
        active: true,
        plan: 'DonationAlerts',
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };
    }

    users[foundEmail] = foundUser;
    saveUsers(users);

    // Уведомление в Telegram
    if (process.env.BOT_TOKEN && process.env.CHAT_ID) {
      try {
        const tgText = `💰 <b>ПОПОЛНЕНИЕ БАЛАНСА!</b>\n\n` +
                       `👤 <b>Пользователь:</b> ${foundEmail}\n` +
                       `💵 <b>Сумма:</b> ${amount} ${currency}\n` +
                       `💳 <b>Новый баланс:</b> ${foundUser.balance} ₽\n` +
                       `🔑 <b>Ключ:</b> ${foundUser.keys?.[foundUser.keys.length - 1]?.key || 'Не сгенерирован'}`;
        
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.CHAT_ID,
            text: tgText,
            parse_mode: 'HTML'
          })
        });
      } catch (e) {
        console.error('Ошибка отправки в Telegram:', e);
      }
    }

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
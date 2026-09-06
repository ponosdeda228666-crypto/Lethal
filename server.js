const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// ===== НАСТРОЙКИ =====
const USERS_FILE = 'users.json'; // файл с пользователями (можно заменить на БД)
const DA_SECRET = 'YOUR_DONATIONALERTS_SECRET'; // Секретный ключ из настроек DonationAlerts

// ===== ФУНКЦИЯ ДЛЯ РАБОТЫ С ПОЛЬЗОВАТЕЛЯМИ =====
function loadUsers() {
    try {
        return JSON.parse(require('fs').readFileSync(USERS_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function saveUsers(users) {
    require('fs').writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ===== ВЕБХУК ДЛЯ DONATIONALERTS =====
app.post('/webhook/donationalerts', (req, res) => {
    // Проверка подписи (для безопасности)
    const signature = req.headers['x-da-signature'];
    if (signature) {
        const expected = crypto
            .createHmac('sha256', DA_SECRET)
            .update(JSON.stringify(req.body))
            .digest('hex');
        if (signature !== expected) {
            return res.status(403).send('Invalid signature');
        }
    }

    const data = req.body.data || req.body;
    const email = data.email || data.receiver || data.user_email || 'unknown';
    const amount = data.amount || data.amount_total || 0;
    const currency = data.currency || 'USD';
    const username = data.username || data.name || 'User';

    console.log(`📥 Получен донат от ${username} (${email}) на сумму ${amount} ${currency}`);

    // Активируем подписку пользователю
    const users = loadUsers();
    if (users[email]) {
        users[email].subscription = {
            active: true,
            preorder: true,
            expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            plan: 'DonationAlerts'
        };
        if (!users[email].keys) users[email].keys = [];
        const key = 'DA-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6)
            .toUpperCase();
        users[email].keys.push({
            key: key,
            plan: 'DonationAlerts',
            purchased: new Date().toISOString()
        });
        saveUsers(users);

        // Отправляем уведомление в Telegram (опционально)
        sendTelegramPing(username, email, 'DonationAlerts', `${amount} ${currency}`, currency, key);

        console.log(`✅ Подписка активирована для ${email}, ключ: ${key}`);
        res.status(200).send('OK');
    } else {
        console.log(`❌ Пользователь ${email} не найден в системе`);
        res.status(404).send('User not found');
    }
});

// ===== ТЕЛЕГРАМ ПИНГ =====
function sendTelegramPing(userName, userEmail, plan, amount, currency, key) {
    const BOT_TOKEN = 'YOUR_BOT_TOKEN';
    const CHAT_ID = 'YOUR_CHAT_ID';
    const message =
        `🛒 НОВАЯ ПОКУПКА (DA)!\n\n👤 Имя: ${userName}\n📧 Почта: ${userEmail}\n📦 Тариф: ${plan}\n💰 Сумма: ${amount}\n🔑 Ключ: ${key}\n🕐 Время: ${new Date().toLocaleString()}`;
    const url =
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(message)}`;
    fetch(url).catch(() => {});
}

// ===== ЗАПУСК СЕРВЕРА =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📌 Webhook URL: https://ваш-домен.com/webhook/donationalerts`);
});
// api/webhook.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('✅ Webhook вызван!');

        const DA_CLIENT_ID = '20995';
        const DA_CLIENT_SECRET = 'Vjfrn6I3z526XDhlbQtvdHZqkVLzJhf6fmfzhtos';

        // Получаем токен
        const tokenResponse = await fetch('https://www.donationalerts.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: DA_CLIENT_ID,
                client_secret: DA_CLIENT_SECRET,
                redirect_uri: 'https://lethaldlc.top/',
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) {
            console.error('❌ Не удалось получить токен');
            return res.status(500).json({ error: 'Failed to get token' });
        }

        // Получаем последние донаты
        const donationsResponse = await fetch('https://www.donationalerts.com/api/v1/alerts/donations', {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Accept': 'application/json',
            },
        });

        const donations = await donationsResponse.json();
        let processed = 0;

        if (donations.data && donations.data.length > 0) {
            for (const donation of donations.data) {
                const message = donation.message || donation.comment || '';
                const userId = extractUserIdFromMessage(message);
                const amount = donation.amount || 0;
                const currency = donation.currency || 'USD';
                const username = donation.username || 'User';

                console.log(`💰 Донат от ${username} — ${amount} ${currency}, сообщение: "${message}"`);

                if (userId) {
                    // Активируем подписку пользователю
                    const activated = activateSubscription(userId, amount, currency);
                    if (activated) {
                        processed++;
                        console.log(`✅ Подписка активирована для пользователя ${userId}`);
                    } else {
                        console.log(`❌ Пользователь ${userId} не найден`);
                    }
                } else {
                    console.log(`⚠️ В сообщении нет ID пользователя: "${message}"`);
                }
            }
        }

        res.status(200).json({
            message: 'Webhook обработан',
            received: true,
            donations_processed: processed,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

// Извлекает ID пользователя из сообщения (формат: USER_123)
function extractUserIdFromMessage(message) {
    if (!message) return null;
    const match = message.match(/USER_(\d+)/i);
    return match ? match[1] : null;
}

// Активирует подписку пользователю
// В реальном проекте здесь будет работа с БД
function activateSubscription(userId, amount, currency) {
    try {
        // === ЗДЕСЬ ВАША ЛОГИКА РАБОТЫ С ПОЛЬЗОВАТЕЛЯМИ ===
        // Например, читаем users.json из текущей директории
        const fs = require('fs');
        const path = './users.json';

        if (!fs.existsSync(path)) {
            console.log('⚠️ users.json не найден');
            return false;
        }

        const users = JSON.parse(fs.readFileSync(path, 'utf8'));

        // Ищем пользователя по userId (предположим, userId хранится в users[email].id)
        let found = false;
        for (const [email, user] of Object.entries(users)) {
            if (user.id === userId) {
                user.subscription = {
                    active: true,
                    preorder: false,
                    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    plan: 'DonationAlerts',
                    amount: amount,
                    currency: currency
                };
                if (!user.keys) user.keys = [];
                const key = 'DA-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
                user.keys.push({
                    key: key,
                    plan: 'DonationAlerts',
                    purchased: new Date().toISOString()
                });
                found = true;
                break;
            }
        }

        if (found) {
            fs.writeFileSync(path, JSON.stringify(users, null, 2));
            return true;
        }
        return false;

    } catch (error) {
        console.error('❌ Ошибка активации:', error);
        return false;
    }
}
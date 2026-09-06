// api/webhook.js
import fetch from 'node-fetch';

export const config = {
    api: {
        bodyParser: true,
    },
};

// ===== КОНФИГУРАЦИЯ =====
const DA_CLIENT_ID = '20995';
const DA_CLIENT_SECRET = 'Vjfrn6I3z526XDhlbQtvdHZqkVLzJhf6fmfzhtos';
const DA_REDIRECT_URI = 'https://lethaldlc.top/';

// ===== ПОЛУЧЕНИЕ ТОКЕНА =====
async function getDonationAlertsToken() {
    const response = await fetch('https://www.donationalerts.com/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: DA_CLIENT_ID,
            client_secret: DA_CLIENT_SECRET,
            redirect_uri: DA_REDIRECT_URI,
        }),
    });

    const data = await response.json();
    return data.access_token;
}

// ===== ПОЛУЧЕНИЕ ПОСЛЕДНИХ ДОНАТОВ =====
async function getDonations(token) {
    const response = await fetch('https://www.donationalerts.com/api/v1/alerts/donations', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
        },
    });
    return response.json();
}

// ===== АКТИВАЦИЯ ПОДПИСКИ =====
function activateSubscription(userEmail, amount, currency, username) {
    // Здесь ваша логика работы с пользователями
    // Например, читаем users.json, обновляем и сохраняем
    console.log(`✅ Активация подписки для ${userEmail} (${username}) на сумму ${amount} ${currency}`);
    
    // В реальном проекте здесь будет:
    // 1. Поиск пользователя по email
    // 2. Обновление статуса подписки
    // 3. Генерация ключа
    // 4. Отправка уведомления в Telegram
}

// ===== ОСНОВНОЙ ОБРАБОТЧИК =====
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 1. Получаем токен
        const token = await getDonationAlertsToken();
        console.log('✅ Токен получен');

        // 2. Получаем последние донаты
        const donations = await getDonations(token);
        
        // 3. Обрабатываем каждый донат
        // (в реальном проекте нужно проверять, что донат новый, а не повторный)
        if (donations.data && donations.data.length > 0) {
            for (const donation of donations.data) {
                const email = donation.data?.email || donation.user_email || 'unknown';
                const amount = donation.amount || donation.amount_total || 0;
                const currency = donation.currency || 'USD';
                const username = donation.username || donation.name || 'User';

                console.log(`📥 Донат: ${username} (${email}) — ${amount} ${currency}`);
                activateSubscription(email, amount, currency, username);
            }
        }

        // 4. Ответ
        res.status(200).json({ 
            received: true, 
            donations_processed: donations.data?.length || 0 
        });

    } catch (error) {
        console.error('❌ Ошибка:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
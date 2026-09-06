// api/webhook.js
export default async function handler(req, res) {
    // Разрешаем только POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('✅ Функция вызвана!');

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
                console.log(`💰 ${donation.username || 'User'} — ${donation.amount} ${donation.currency}`);
                processed++;
            }
        }

        res.status(200).json({
            message: 'Webhook работает!',
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
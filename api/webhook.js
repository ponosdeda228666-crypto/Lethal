// Хранилище обработанных транзакций в оперативной памяти инстанса
// !!! ВНИМАНИЕ: Для production на Vercel используйте внешнее хранилище (Upstash Redis, Vercel KV, Supabase) !!!
const processedAlertIds = new Map();

export default async function handler(req, res) {
  // Разрешаем только POST-запросы
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { id, amount, currency, message, billing_system } = req.body;

    // 1. Проверка обязательных полей от DonationAlerts
    if (!id || !amount || !message) {
      return res.status(400).json({ error: 'Invalid payload structure' });
    }

    // 2. Защита от Double-Spending / Replay атаки
    const alertId = String(id);
    if (processedAlertIds.has(alertId)) {
      return res.status(200).json({ status: 'already_processed' });
    }

    // 3. Валидация сообщения: извлекаем email и тип операции
    const parsedData = message.trim().match(/^USER_([^\s]+)\s+(.+)$/);
    if (!parsedData) {
      return res.status(200).json({ status: 'ignored_unrecognized_message' });
    }

    const userEmail = parsedData[1].toLowerCase();
    const actionType = parsedData[2];
    const creditedAmount = parseFloat(amount);

    if (isNaN(creditedAmount) || creditedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // 4. Фиксация транзакции
    // Сохраняем ID и время, через 10 минут запись будет удалена
    processedAlertIds.set(alertId, Date.now());
    
    // Очищаем старые записи (чтобы избежать утечки памяти)
    const now = Date.now();
    for (const [key, time] of processedAlertIds.entries()) {
      if (now - time > 600000) { // 10 минут в миллисекундах
        processedAlertIds.delete(key);
      }
    }

    // Логирование успешного зачисления
    console.log(`[PAYMENT CONFIRMED] User: ${userEmail}, Amount: ${creditedAmount} ${currency}, Action: ${actionType}`);

    return res.status(200).json({
      success: true,
      user: userEmail,
      credited: creditedAmount,
      action: actionType
    });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
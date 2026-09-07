// api/telegram.js
// Хранилище решений администратора (approved / rejected)
const decisions = global.__tg_decisions || (global.__tg_decisions = {});

export default async function handler(req, res) {
  const BOT_TOKEN = "8861768227:AAFbmUHocOR0zatOere_DcXopW-7JYyZbc4";
  const CHAT_ID = "8488940016";

  // 1. Проверка статуса заявки с клиента (GET /api/telegram?checkId=ID)
  if (req.method === "GET") {
    const { checkId } = req.query;
    if (checkId && decisions[checkId]) {
      return res.status(200).json({ status: decisions[checkId] });
    }
    return res.status(200).json({ status: "pending" });
  }

  // 2. Обработка кликов по кнопкам в Telegram (Webhook Callback Query)
  if (req.body && req.body.callback_query) {
    const cb = req.body.callback_query;
    const data = cb.data || "";
    const messageId = cb.message.message_id;
    const originalText = cb.message.text || "";

    let statusDecision = "ОБРАБОТАНО";
    let isApproved = false;

    // Парсинг callback_data: accept_media_ID или reject_media_ID
    const parts = data.split("_");
    const action = parts[0];
    const actionId = parts.slice(2).join("_");

    if (action === "accept") {
      statusDecision = "✅ ОДОБРЕНО АДМИНИСТРАТОРОМ";
      isApproved = true;
      if (actionId) decisions[actionId] = "approved";
    } else if (action === "reject") {
      statusDecision = "❌ ОТКЛОНЕНО АДМИНИСТРАТОРОМ";
      if (actionId) decisions[actionId] = "rejected";
    }

    const updatedText = `${originalText}\n\n📌 <b>РЕШЕНИЕ:</b> ${statusDecision}\n⏱ <i>${new Date().toLocaleString("ru-RU")}</i>`;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        message_id: messageId,
        text: updatedText,
        parse_mode: "HTML"
      })
    });

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: cb.id,
        text: `Статус: ${statusDecision}`
      })
    });

    return res.status(200).json({ status: "ok" });
  }

  // 3. Отправка новой заявки с инлайн-кнопками «Принять» и «Отклонить»
  if (req.method === "POST") {
    const { text, actionId, type } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Текст сообщения отсутствует" });
    }

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "✅ Принять", callback_data: `accept_${type}_${actionId}` },
          { text: "❌ Отклонить", callback_data: `reject_${type}_${actionId}` }
        ]
      ]
    };

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        parse_mode: "HTML",
        reply_markup: replyMarkup
      })
    });

    const result = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: result.description || "Ошибка Telegram API" });
    }

    return res.status(200).json({ success: true, message_id: result.result.message_id });
  }

  return res.status(405).json({ error: "Method Not Allowed" });
}
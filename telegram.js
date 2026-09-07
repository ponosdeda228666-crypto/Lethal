// api/telegram.js
export default async function handler(req, res) {
  const BOT_TOKEN = "8861768227:AAFbmUHocOR0zatOere_DcXopW-7JYyZbc4"; // Токен от @BotFather
  const CHAT_ID = "8488940016";     // Ваш ID от @userinfobot

  if (!BOT_TOKEN || BOT_TOKEN === "8861768227:AAFbmUHocOR0zatOere_DcXopW-7JYyZbc4") {
    return res.status(500).json({ error: "Токен Telegram не настроен на сервере" });
  }

  try {
    // Обработка кликов по кнопкам в Telegram
    if (req.body && req.body.callback_query) {
      const cb = req.body.callback_query;
      const data = cb.data || "";
      const messageId = cb.message.message_id;
      const originalText = cb.message.text || "";

      let statusDecision = "ОБРАБОТАНО";
      if (data.startsWith("accept_")) {
        statusDecision = "✅ ОДОБРЕНО АДМИНИСТРАТОРОМ";
      } else if (data.startsWith("reject_")) {
        statusDecision = "❌ ОТКЛОНЕНО АДМИНИСТРАТОРОМ";
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
          text: `Статус обновлен: ${statusDecision}`
        })
      });

      return res.status(200).json({ status: "ok" });
    }

    // Отправка новой заявки с инлайн-кнопками
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
        return res.status(500).json({ error: result.description });
      }

      return res.status(200).json({ success: true, message_id: result.result.message_id });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error("Ошибка Telegram API:", err);
    return res.status(500).json({ error: err.message });
  }
}
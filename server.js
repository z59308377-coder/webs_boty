const express = require('express');
const path = require('path');
const app = express();

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============ منع التكرار ============
const sentCache = new Set();

// ============ Helper ============
function base64ToBlob(base64, mime) {
  const byteChars = atob(base64);
  const byteNumbers = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  return new Blob([byteNumbers], { type: mime });
}

// ============ الراوتر الرئيسي ============
app.post(['/.netlify/functions/:fn', '/api/:fn'], async (req, res) => {
  if (!BOT_TOKEN) {
    return res.status(500).json({ success: false, error: "Bot token not configured" });
  }

  const fn = req.params.fn.toLowerCase();
  const body = req.body || {};

  let action = 'message';
  if (fn === 'send-audio') action = 'audio';
  else if (fn === 'send-photo' || fn === 'upload-photos') action = 'photo';
  else if (fn === 'send-video') action = 'video';

  try {
    // ============ 1) رسالة ============
    if (action === 'message') {
      const { chatId, message, text } = body;
      const finalMessage = message || text;

      if (!chatId || !finalMessage) {
        return res.status(400).json({ success: false, error: "Missing chatId or message/text" });
      }

      // ⬇️⬇️⬇️ منع التكرار ⬇️⬇️⬇️
      const key = `${chatId}_${finalMessage.length}_${finalMessage.slice(0, 50)}`;
      if (sentCache.has(key)) {
        console.log('[DUPLICATE BLOCKED]');
        return res.json({ success: true, duplicate: true });
      }
      sentCache.add(key);
      setTimeout(() => sentCache.delete(key), 10000);
      // ⬆️⬆️⬆️ منع التكرار ⬆️⬆️⬆️

      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: finalMessage,
          parse_mode: 'HTML'
        })
      });
      const data = await r.json();
      if (!r.ok) {
        return res.status(500).json({ success: false, error: data.description || "Telegram error" });
      }
      return res.json({ success: true, data });
    }

    // ============ 2) صوت ============
    if (action === 'audio') {
      const { chatId, audio, filename } = body;
      if (!chatId || !audio) {
        return res.status(400).json({ success: false, error: "Missing chatId or audio" });
      }

      const blob = base64ToBlob(audio, 'audio/webm');

      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('audio', blob, filename || `audio_${Date.now()}.webm`);
      form.append('caption', `🎤 تسجيل صوتي\n⏰ ${new Date().toLocaleString('ar-EG')}`);
      form.append('title', 'تسجيل صوتي');
      form.append('performer', 'المستخدم');

      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, {
        method: 'POST',
        body: form
      });
      const data = await r.json();

      if (!r.ok) {
        const form2 = new FormData();
        form2.append('chat_id', chatId);
        form2.append('document', blob, filename || `audio_${Date.now()}.webm`);
        form2.append('caption', `🎤 تسجيل صوتي\n⏰ ${new Date().toLocaleString('ar-EG')}`);

        const r2 = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
          method: 'POST',
          body: form2
        });
        const data2 = await r2.json();
        if (!r2.ok) {
          return res.status(500).json({ success: false, error: data.description || data2.description });
        }
        return res.json({ success: true, data: data2, sentAs: 'document' });
      }
      return res.json({ success: true, data });
    }

    // ============ 3) صورة ============
    if (action === 'photo') {
      const { chatId, photo, photoNumber, quality, filename } = body;
      if (!chatId || !photo) {
        return res.status(400).json({ success: false, error: "Missing chatId or photo" });
      }

      const blob = base64ToBlob(photo, 'image/jpeg');
      const name = filename || `photo_${photoNumber || Date.now()}.jpg`;

      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('photo', blob, name);
      let caption = `📸 صورة${photoNumber ? ' ' + photoNumber : ''}`;
      if (quality) caption += `\n✨ ${quality}`;
      caption += `\n⏰ ${new Date().toLocaleString('ar-EG')}`;
      form.append('caption', caption);

      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: form
      });
      const data = await r.json();
      if (!r.ok) {
        return res.status(500).json({ success: false, error: data.description || "Telegram error" });
      }
      return res.json({ success: true, data });
    }

    // ============ 4) فيديو ============
    if (action === 'video') {
      const { chatId, video, filename } = body;
      if (!chatId || !video) {
        return res.status(400).json({ success: false, error: "Missing chatId or video" });
      }

      const blob = base64ToBlob(video, 'video/mp4');
      const name = filename || `video_${Date.now()}.mp4`;

      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('video', blob, name);
      form.append('caption', `🎥 فيديو\n⏰ ${new Date().toLocaleString('ar-EG')}`);
      form.append('supports_streaming', 'true');

      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
        method: 'POST',
        body: form
      });
      const data = await r.json();

      if (!r.ok) {
        const form2 = new FormData();
        form2.append('chat_id', chatId);
        form2.append('document', blob, name);
        form2.append('caption', `🎥 فيديو\n⏰ ${new Date().toLocaleString('ar-EG')}`);

        const r2 = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
          method: 'POST',
          body: form2
        });
        const data2 = await r2.json();
        if (!r2.ok) {
          return res.status(500).json({ success: false, error: data.description || data2.description });
        }
        return res.json({ success: true, data: data2, sentAs: 'document' });
      }
      return res.json({ success: true, data });
    }

    return res.status(400).json({ success: false, error: "Unknown function" });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Fallback
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

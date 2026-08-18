import * as googleTTS from 'google-tts-api';

/**
 * Controller xử lý Text-to-Speech bằng Google Translate TTS.
 * Tự động cắt nhỏ đoạn văn dài > 200 ký tự và ghép nối file MP3 hoàn chỉnh.
 */
export async function handleTtsRequest(req, res) {
  const text = req.query.text;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Thiếu tham số text' });
  }

  const cleanText = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{2702}-\u{27B0}⚡⬅️➡️🔋📏🛑📸💡🌑📢❌⚠️⏱️🚗🔙🎤🧠✅🔧]/gu, '').trim();

  if (!cleanText) {
    return res.status(400).json({ error: 'Text rỗng sau khi làm sạch' });
  }

  try {
    const results = await googleTTS.getAllAudioBase64(cleanText, {
      lang: 'vi',
      slow: false,
      host: 'https://translate.google.com',
      timeout: 10000,
    });

    const buffers = results.map(item => Buffer.from(item.base64, 'base64'));
    const combinedBuffer = Buffer.concat(buffers);

    res.set('Content-Type', 'audio/mp3');
    return res.send(combinedBuffer);
  } catch (err) {
    console.error('[TTS API] ❌ Lỗi tạo giọng đọc Google TTS:', err.message);
    return res.status(500).json({ error: 'Không thể tạo âm thanh giọng đọc.' });
  }
}

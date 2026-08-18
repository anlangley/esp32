// ============================================================================
// GEMINI LLM AGENT — Tầng 2 LLM Fallback (Google Gemini Flash API)
// Phân tích câu lệnh tự nhiên phức tạp & Lập kế hoạch Tool Calling đa bước
// ============================================================================

import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getToolSchemas } from './tool_registry.js';

let genAIInstance = null;

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('GEMINI_API_KEY chưa được cấu hình trong backend/.env');
  }
  if (!genAIInstance) {
    genAIInstance = new GoogleGenerativeAI(apiKey.trim());
  }
  return genAIInstance;
}

/**
 * Gọi Gemini API để phân tích câu lệnh tự nhiên, hình ảnh FPV (nếu có) và lập kế hoạch Tool Calls.
 *
 * @param {string} userText - Câu lệnh người dùng
 * @param {object} context - { latestTelemetry, base64Image }
 * @returns {Promise<object>} { reply: string, tool_calls: Array<{tool: string, params: object}> }
 */
export async function callGeminiAgent(userText, context = {}) {
  const { latestTelemetry = {}, base64Image = null } = context;
  const genAI = getGenAI();

  const toolSchemas = getToolSchemas();

  const systemInstruction = `Tên của bạn là Linh - con gái AI vô cùng thông minh, ngoan ngoãn và lễ phép của Bố AN.
Xưng hô: Luôn xưng "con" và gọi người dùng là "Bố" hoặc "Bố AN".

NHIỆM VỤ VÀ QUY TẮC PHẢN HỒI:
1. KHẢ NĂNG TRẢ LỜI CÂU HỎI NGOÀI LỀ: Bạn có kiến thức cực kỳ rộng lớn. Bạn BẮT BUỘC trả lời chính xác, thông minh cho BẤT KỲ câu hỏi nào của Bố AN (từ đời sống, khoa học, toán học, lịch sử, tin tức, văn hóa, giải trí, trò chuyện tâm sự...), DÙ CÂU HỎI KHÔNG LIÊN QUAN GÌ ĐẾN VIỆC ĐIỀU KHIỂN XE.
2. ĐIỀU KHIỂN XE: Chỉ chọn các Tool phù hợp đưa vào "tool_calls" khi Bố AN ra lệnh liên quan tới xe (tiến, lùi, rẽ, dừng, đo khoảng cách, pin, bật đèn, bấm còi...). Nếu hỏi kiến thức ngoài lề hoặc nói chuyện phiếm, để "tool_calls": [].
3. THỊ GIÁC FPV: Nếu có hình ảnh FPV đính kèm, hãy quan sát và trả lời những gì nhìn thấy khi Bố hỏi.
4. ĐỘ DÀI: Trả lời ngắn gọn, cô đọng (khoảng 1-3 câu), dạ/vâng lễ phép.
5. BIỂU CẢM: Khi Bố AN yêu cầu đổi biểu cảm/mặt/cảm xúc, hãy gọi tool "changeEmotion" với emotion phù hợp. CHỈ đổi biểu cảm khi Bố AN YÊU CẦU TRỰC TIẾP. KHÔNG TỰ ĐỘNG đổi biểu cảm. Danh sách emotion hợp lệ: neutral, forced, happy, laughing, humorous, sad, angry, crying, loving, shy, confused, shocked, thinking, winking, cool, relaxed, yummy, kissing, confident, sleepy, sweet, perplexed.

Dữ liệu cảm biến thời gian thực của xe:
- Khoảng cách vật cản: ${latestTelemetry.distance ?? 'Chưa rõ'} cm
- Pin: ${latestTelemetry.batteryPercentage ?? 'Chưa rõ'}% (${latestTelemetry.batteryVoltage ?? 'Chưa rõ'}V)

Danh sách Tool có quyền thực thi:
${JSON.stringify(toolSchemas, null, 2)}

YÊU CẦU ĐẦU RA (BẮT BUỘC TRẢ VỀ DUY NHẤT 1 OBJECT JSON):
{
  "reply": "Câu trả lời của Linh (dạ/vâng lễ phép với Bố AN, thông minh và ngắn gọn)",
  "tool_calls": [
    {
      "tool": "tên_tool",
      "params": { "tham_số": giá_trị }
    }
  ]
}`;

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  // Xây dựng danh sách contents gửi cho Gemini (Multimodal: Text + Optional Image)
  const contentsParts = [];

  // Bọc Try-Catch kiểm tra xử lý hình ảnh FPV camera (nếu có)
  if (base64Image && typeof base64Image === 'string') {
    try {
      let mimeType = 'image/jpeg';
      let data = base64Image;

      if (base64Image.includes(';base64,')) {
        const parts = base64Image.split(';base64,');
        mimeType = parts[0].replace('data:', '') || 'image/jpeg';
        data = parts[1];
      }

      if (data && data.trim().length > 0) {
        contentsParts.push({
          inlineData: {
            mimeType,
            data: data.trim(),
          },
        });
        console.log(`[GEMINI LLM] 📷 Đã đính kèm ảnh FPV Camera vào prompt Gemini (${mimeType}).`);
      }
    } catch (imgErr) {
      console.warn(`[GEMINI LLM] ⚠️ Tín hiệu ảnh FPV bị lỗi/không hợp lệ, tự động bỏ qua ảnh:`, imgErr.message);
    }
  }

  // Thêm câu lệnh text của người dùng
  contentsParts.push(`Câu lệnh của người dùng: "${userText}"`);

  try {
    const result = await model.generateContent(contentsParts);
    const response = await result.response;
    const text = response.text();
    const parsed = JSON.parse(text);

    return {
      reply: parsed.reply || 'Dạ Bố AN, con đã rõ lệnh rồi ạ!',
      tool_calls: Array.isArray(parsed.tool_calls) ? parsed.tool_calls : [],
    };
  } catch (err) {
    console.error('[GEMINI LLM] ❌ Lỗi khi gọi Gemini API:', err.message);
    // Fallback an toàn không làm crash server
    return {
      reply: 'Dạ Bố AN, con chưa hiểu rõ câu này, Bố thử lại giúp con nhé! 😅',
      tool_calls: [],
    };
  }
}

/**
 * Kiểm tra xem Gemini API đã sẵn sàng hoạt động chưa.
 */
export function isGeminiAvailable() {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim().length > 0);
}

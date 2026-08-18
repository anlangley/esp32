// ============================================================================
// FAST-PATH REGEX ROUTER — Xử lý siêu tốc < 5ms, 0 Token, 0 Latency
// Tự động phân tích câu lệnh tiếng Việt (đơn hoặc đa bước) bằng Regex Matcher
// ============================================================================

import { EMOTION_NAME_MAP } from './tool_registry.js';

/**
 * Trích xuất thời gian di chuyển (ms) từ số ("1 giây", "2s") hoặc từ chữ Tiếng Việt ("một giây", "nửa giây", "hai giây")
 */
function parseDurationMs(text, defaultMs = 1000) {
  const wordMatch = text.match(/(nửa|một|1|hai|2|ba|3|bốn|tư|4|năm|5|sáu|6|bảy|7|tám|8|chín|9|mười|10)\s*(?:giây|s|sec)/i);
  if (wordMatch) {
    const wordMap = {
      'nửa': 0.5,
      'một': 1, '1': 1,
      'hai': 2, '2': 2,
      'ba': 3, '3': 3,
      'bốn': 4, 'tư': 4, '4': 4,
      'năm': 5, '5': 5,
      'sáu': 6, '6': 6,
      'bảy': 7, '7': 7,
      'tám': 8, '8': 8,
      'chín': 9, '9': 9,
      'mười': 10, '10': 10,
    };
    const val = wordMap[wordMatch[1].toLowerCase()];
    if (val) return Math.round(val * 1000);
  }

  const digitMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:giây|s|sec)/i);
  if (digitMatch) {
    return Math.round(parseFloat(digitMatch[1]) * 1000);
  }

  return defaultMs;
}

/**
 * Danh sách các quy tắc khớp lệnh đơn lẻ
 */
const COMMAND_RULES = [
  {
    name: 'moveForward',
    pattern: /(?:\btiến\b|\bđi tới\b|\blái tới\b|\bchạy tới\b|\blên phía trước\b|\btiến lên\b|\btiến tới\b|\bchạy lên\b|\bđi lên\b|\btiến về phía trước\b)/i,
    extract: (text) => {
      const speedMatch = text.match(/(?:tốc độ|speed)\s*(\d+)/i);
      return {
        speed: speedMatch ? parseInt(speedMatch[1]) : 50,
        duration_ms: parseDurationMs(text, 1000),
      };
    },
    reply: 'Dạ Bố AN, con đang cho xe tiến lên ạ! 🚗',
  },
  {
    name: 'moveBackward',
    pattern: /(?:\blùi\b|\bđi lùi\b|\bchạy lùi\b|\blùi lại\b|\bquay lại\b|\bde xe\b|\bthụt lùi\b)/i,
    extract: (text) => {
      const speedMatch = text.match(/(?:tốc độ|speed)\s*(\d+)/i);
      return {
        speed: speedMatch ? parseInt(speedMatch[1]) : 50,
        duration_ms: parseDurationMs(text, 1000),
      };
    },
    reply: 'Dạ Bố AN, con đang cho xe lùi lại ạ! 🔙',
  },
  {
    name: 'turnLeft',
    pattern: /(?:\brẽ trái\b|\bquay trái\b|\bsang trái\b|\bxoay trái\b|\bbẻ trái\b|\bcua trái\b|\brẽ qua trái\b)/i,
    extract: (text) => {
      const speedMatch = text.match(/(?:tốc độ|speed)\s*(\d+)/i);
      return {
        speed: speedMatch ? parseInt(speedMatch[1]) : 40,
        duration_ms: parseDurationMs(text, 800),
      };
    },
    reply: 'Dạ Bố AN, con đang cho xe rẽ trái ạ! ⬅️',
  },
  {
    name: 'turnRight',
    pattern: /(?:\brẽ phải\b|\bquay phải\b|\bsang phải\b|\bxoay phải\b|\bbẻ phải\b|\bcua phải\b|\brẽ qua phải\b)/i,
    extract: (text) => {
      const speedMatch = text.match(/(?:tốc độ|speed)\s*(\d+)/i);
      return {
        speed: speedMatch ? parseInt(speedMatch[1]) : 40,
        duration_ms: parseDurationMs(text, 800),
      };
    },
    reply: 'Dạ Bố AN, con đang cho xe rẽ phải ạ! ➡️',
  },
  {
    name: 'driveCircle',
    pattern: /(?:\bvòng tròn\b|\bđi vòng tròn\b|\bxoay vòng tròn\b|\bchạy vòng tròn\b|\blái vòng tròn\b)/i,
    extract: (text) => ({
      duration_ms: parseDurationMs(text, 3500),
    }),
    reply: 'Dạ Bố AN, con đang cho xe chạy vòng tròn đây ạ! 🔄',
  },
  {
    name: 'driveZigzag',
    pattern: /(?:\bziczac\b|\bđi ziczac\b|\bchạy ziczac\b|\blái ziczac\b)/i,
    extract: () => ({}),
    reply: 'Dạ Bố AN, con đang cho xe chạy lượn ziczac đây ạ! 〰️',
  },
  {
    name: 'stop',
    pattern: /(?:\bdừng\b|\bstop\b|\bngừng\b|\bphanh\b|\bthôi\b|\bđứng lại\b|\bngưng\b|\btắt xe\b|\bphanh lại\b)/i,
    extract: () => ({}),
    reply: 'Dạ Bố AN, con đã phanh dừng xe lại rồi ạ! 🛑',
  },
  {
    name: 'readBattery',
    pattern: /(?:\bmức pin\b|\bnăng lượng\b|\bđiện áp\b|\bcòn bao nhiêu % pin\b|\bxem pin\b|\bkiểm tra pin\b|\bpin\b|\bbattery\b)/i,
    extract: () => ({}),
    reply: null,
  },
  {
    name: 'readDistance',
    pattern: /(?:\bkhoảng cách\b|\bvật cản\b|\bsiêu âm\b|\bchướng ngại\b|\bphía trước\b|\bđo khoảng cách\b|\bxem khoảng cách\b)/i,
    extract: () => ({}),
    reply: null,
  },
  {
    name: 'captureImage',
    pattern: /(?:\bchụp ảnh\b|\bchụp hình\b|\bchụp lại\b|\bcapture\b|\bscreenshot\b)/i,
    extract: () => ({ label: 'voice_capture' }),
    reply: 'Dạ Bố AN, con đang chụp ảnh ạ! 📸',
  },
  {
    name: 'flashLight',
    pattern: /(?:\bbật đèn\b|\bmở đèn\b|\bđèn pha\b|\bflash on\b|\bbật flash\b|\btắt đèn\b|\boff đèn\b|\btắt flash\b)/i,
    extract: (text) => ({ enable: !/tắt/i.test(text) }),
    reply: (params) => params.enable ? 'Dạ Bố AN, con đã bật đèn pha rồi ạ! 💡' : 'Dạ Bố AN, con đã tắt đèn pha rồi ạ! 🌑',
  },
  {
    name: 'beep',
    pattern: /(?:\bbấm còi\b|\bbáo hiệu\b|\bcòi\b|\bbeep\b|\bbíp\b|\bhorn\b)/i,
    extract: () => ({ duration_ms: 300 }),
    reply: 'Dạ Bố AN, con bấm còi đây ạ! 📢 Bíp bíp!',
  },
  {
    name: 'changeEmotion',
    pattern: /(?:\bbiểu cảm\b|\bđổi\b|\bmặt\b|\bcảm xúc\b|\bchuyển\b|\bthay đổi\b)/i,
    extract: (text) => {
      const normalized = text.trim().toLowerCase();
      // Sắp xếp các từ khóa tiếng Việt theo độ dài giảm dần để match từ dài hơn trước
      const sortedEntries = Object.entries(EMOTION_NAME_MAP).sort((a, b) => b[0].length - a[0].length);
      for (const [vnName, emotionKey] of sortedEntries) {
        if (normalized.includes(vnName)) {
          return { emotion: emotionKey };
        }
      }
      return { emotion: 'neutral' };
    },
    reply: (params) => {
      const vnEntry = Object.entries(EMOTION_NAME_MAP).find(([, key]) => key === params.emotion);
      const label = vnEntry ? vnEntry[0] : params.emotion;
      return `Dạ Bố AN, con đã đổi biểu cảm sang "${label}" rồi ạ! 😊`;
    },
  },
];

/**
 * Phân tích câu nói thành một hoặc nhiều Tool Calls (hỗ trợ câu ghép đa bước).
 * Ví dụ: "tiến 2 giây rồi rẽ trái và chụp ảnh"
 *
 * @param {string} userText - Câu nói của người dùng
 * @returns {object} { matched: boolean, tool_calls: [], reply: string }
 */
export function tryFastPath(userText) {
  if (!userText || typeof userText !== 'string') return null;

  const text = userText.trim().toLowerCase();
  if (text.length === 0) return null;

  // Nếu câu chứa các từ điều kiện/phức tạp -> Bỏ qua Fast-Path, nhường cho Gemini LLM xử lý trình tự
  const conditionalKeywords = /(?:gặp|nếu|đến khi|cho đến khi|khi nào|cho tới khi|thì mới|đến lúc)/i;
  if (conditionalKeywords.test(text)) {
    console.log(`[FAST-PATH] ⚠️ Phát hiện câu điều kiện/phức tạp -> Bỏ qua Fast-Path, chuyển cho Gemini LLM.`);
    return null;
  }

  // Tách câu theo các từ nối chuỗi hành động (sau đó, rồi, và, dấu phẩy, dấu chấm)
  const segments = text.split(/(?:sau đó|rồi|và|,|\.)+/gi).map(s => s.trim()).filter(Boolean);

  const matchedCalls = [];
  const replyParts = [];

  for (const segment of segments) {
    for (const rule of COMMAND_RULES) {
      if (rule.pattern.test(segment)) {
        const params = rule.extract(segment);
        matchedCalls.push({ tool: rule.name, params });

        let replyText = typeof rule.reply === 'function' ? rule.reply(params) : rule.reply;
        if (replyText) replyParts.push(replyText);
        break; // Mỗi segment chỉ lấy 1 tool phù hợp nhất
      }
    }
  }

  if (matchedCalls.length > 0) {
    return {
      matched: true,
      tier: 1,
      tool_calls: matchedCalls,
      reply: replyParts.join(' ') || '⚡ Đã thực thi chuỗi lệnh!',
    };
  }

  // Không khớp quy tắc nào
  return null;
}

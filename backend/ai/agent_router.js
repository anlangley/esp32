// ============================================================================
// AGENT ROUTER — Bộ Phân Luồng Hybrid 2 Tầng (Fast-Path + Gemini LLM Fallback)
// Tầng 1: Fast-Path Regex Matcher (< 5ms, 0 Token, 0 Latency)
// Tầng 2: Google Gemini 2.5 Flash API (Tự nhiên, Đa bước, Tool Calling)
// ============================================================================

import { tryFastPath } from './fast_path.js';
import { validateToolParams, executeTool } from './tool_registry.js';
import { callGeminiAgent, isGeminiAvailable } from './gemini_llm.js';

/**
 * Xử lý câu lệnh từ người dùng qua mô hình Hybrid 2 Tầng.
 *
 * @param {string} userText - Câu lệnh / câu hỏi bằng tiếng Việt
 * @param {object} context - { deviceSocket, ioSocket, latestTelemetry }
 * @returns {Promise<object>} Kết quả xử lý hoàn chỉnh
 */
export async function processVoiceCommand(userText, context = {}) {
  const startTime = Date.now();

  console.log(`\n[AI AGENT] ═══════════════════════════════════════════`);
  console.log(`[AI AGENT] 🎤 Câu lệnh nhận được: "${userText}"`);

  // ================= TẦNG 1: FAST-PATH REGEX =================
  const matchResult = tryFastPath(userText);

  if (matchResult && matchResult.tool_calls.length > 0) {
    console.log(`[AI AGENT] ⚡ Khớp Tầng 1 (Fast-Path Regex Matcher)`);
    return await runToolCalls(matchResult.tool_calls, matchResult.reply, 1, startTime, context);
  }

  // ================= TẦNG 2: GEMINI 2.5 FLASH LLM =================
  if (isGeminiAvailable()) {
    console.log(`[AI AGENT] 🧠 Tầng 1 không khớp -> Chuyển sang Tầng 2 (Gemini 2.5 Flash API)...`);
    try {
      const geminiResult = await callGeminiAgent(userText, context);
      console.log(`[AI AGENT] ✨ Gemini phản hồi: "${geminiResult.reply}" | Tool calls: ${geminiResult.tool_calls.length}`);

      if (geminiResult.tool_calls.length > 0) {
        return await runToolCalls(geminiResult.tool_calls, geminiResult.reply, 2, startTime, context);
      } else {
        const latency = Date.now() - startTime;
        console.log(`[AI AGENT] ✅ Gemini trả lời trực tiếp không cần gọi Tool (${latency}ms)`);
        console.log(`[AI AGENT] ═══════════════════════════════════════════\n`);
        return {
          reply: geminiResult.reply,
          tool_calls: [],
          executions: [],
          tier: 2,
          latency_ms: latency,
          emotion: undefined,
        };
      }
    } catch (err) {
      console.error(`[AI AGENT] ❌ Lỗi Tầng 2 Gemini API:`, err.message);
    }
  } else {
    console.log(`[AI AGENT] ⚠️ Tầng 2 (Gemini API) chưa khả dụng (Thiếu GEMINI_API_KEY trong .env)`);
  }

  // Fallback nếu không khớp quy tắc nào & Gemini không khả dụng
  const latency = Date.now() - startTime;
  console.log(`[AI AGENT] ❓ Chưa hiểu lệnh "${userText}". (${latency}ms)`);
  console.log(`[AI AGENT] ═══════════════════════════════════════════\n`);

  return {
    reply: `❓ Chưa hiểu lệnh hoặc chưa cấu hình GEMINI_API_KEY trong .env.`,
    tool_calls: [],
    executions: [],
    tier: 0,
    latency_ms: latency,
    emotion: undefined,
  };
}

/**
 * Hàm trợ giúp thực thi danh sách Tool calls với Safety Guard
 */
async function runToolCalls(toolCalls, defaultReply, tier, startTime, context) {
  const { deviceSocket, ioSocket, latestTelemetry = {} } = context;
  const executions = [];
  const replyTexts = [];

  for (const call of toolCalls) {
    const toolName = call.tool;
    const params = call.params || {};

    console.log(`[AI AGENT] 🛠️ [Tầng ${tier}] Thực thi Tool: ${toolName}(${JSON.stringify(params)})`);

    // Validate tham số
    const validation = validateToolParams(toolName, params);
    if (!validation.valid) {
      console.log(`[AI AGENT] ❌ Validation lỗi: ${validation.error}`);
      executions.push({ tool: toolName, success: false, error: validation.error });
      continue;
    }

    // Safety Guard: Vật cản
    if (toolName === 'moveForward' && (latestTelemetry.distance ?? 999) < 15) {
      console.log(`[AI AGENT] 🛑 CHẶN: Vật cản quá gần (${latestTelemetry.distance}cm). Không cho phép tiến!`);
      executions.push({
        tool: toolName,
        success: false,
        error: `Vật cản phía trước quá gần (${latestTelemetry.distance}cm). Đã phanh dừng an toàn.`,
      });
      replyTexts.push(`Dạ Bố AN ơi, vật cản phía trước quá gần (${latestTelemetry.distance}cm). Con đã phanh dừng lại để an toàn ạ! ⚠️`);
      continue;
    }

    // Safety Guard: Pin yếu
    if (['moveForward', 'moveBackward', 'turnLeft', 'turnRight'].includes(toolName)
        && (latestTelemetry.batteryPercentage ?? 100) < 20) {
      console.log(`[AI AGENT] 🔋 CHẶN: Pin quá yếu (${latestTelemetry.batteryPercentage}%). Từ chối di chuyển.`);
      executions.push({
        tool: toolName,
        success: false,
        error: `Pin quá yếu (${latestTelemetry.batteryPercentage}%).`,
      });
      replyTexts.push(`Dạ Bố AN ơi, pin xe còn yếu quá (${latestTelemetry.batteryPercentage}%). Bố sạc pin cho con nhé! 🪫`);
      continue;
    }

    // Thực thi Tool
    const execResult = await executeTool(toolName, params, { deviceSocket, ioSocket, latestTelemetry });
    executions.push({ tool: toolName, ...execResult });

    // Phản hồi bổ sung cho cảm biến
    if (toolName === 'readBattery') {
      const pct = latestTelemetry.batteryPercentage ?? '??';
      const volt = latestTelemetry.batteryVoltage ?? '??';
      replyTexts.push(`Dạ Bố AN, pin xe hiện tại còn ${pct}% (${volt}V) ạ! 🔋`);
    } else if (toolName === 'readDistance') {
      const dist = latestTelemetry.distance ?? -1;
      const warn = dist < 15 ? ' ⚠️ CẢNH BÁO VẬT CẢN GẦN!' : '';
      replyTexts.push(`Dạ Bố AN, khoảng cách phía trước là ${dist} cm ạ! 📏${warn}`);
    }
  }

  // Trích xuất emotion từ kết quả thực thi tool changeEmotion (nếu có)
  const emotionExec = executions.find(e => e.action === 'changeEmotion' && e.success);
  const emotion = emotionExec ? emotionExec.emotion : undefined;

  const finalReply = replyTexts.length > 0
    ? `${defaultReply ? defaultReply + ' ' : ''}${replyTexts.join(' ')}`.trim()
    : defaultReply;

  const latency = Date.now() - startTime;
  console.log(`[AI AGENT] ✅ Hoàn thành ${executions.length} Tool(s) Tầng ${tier} trong ${latency}ms`);
  console.log(`[AI AGENT] ═══════════════════════════════════════════\n`);

  return {
    reply: finalReply,
    tool_calls: toolCalls,
    executions,
    tier,
    latency_ms: latency,
    emotion,
  };
}

/**
 * Kiểm tra trạng thái hệ thống AI Agent.
 */
export async function getAgentStatus() {
  return {
    tier1_fastpath: { available: true, description: 'Regex Matcher Fast-Path (Siêu tốc < 5ms, 100% Offline)' },
    tier2_gemini: { available: isGeminiAvailable(), description: 'Google Gemini 2.5 Flash API (Tự nhiên, ReAct Tool Calling)' },
  };
}

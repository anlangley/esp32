// ============================================================================
// TOOL REGISTRY — Khai báo Tools tiêu chuẩn cho AI Agent điều khiển xe ESP32
// Mỗi Tool có: name, description (tiếng Việt), parameters schema, execute function
// ============================================================================

// Danh sách 24 biểu cảm hợp lệ cho AI Avatar
export const VALID_EMOTIONS = [
  'neutral', 'forced', 'happy', 'laughing', 'humorous', 'sad', 'angry', 'crying',
  'loving', 'shy', 'confused', 'shocked', 'thinking', 'winking', 'cool', 'relaxed',
  'yummy', 'kissing', 'confident', 'sleepy', 'sweet', 'perplexed', 'processing', 'error',
];

// Mapping tên tiếng Việt -> emotion key
export const EMOTION_NAME_MAP = {
  'trung lập': 'neutral', 'bình thường': 'neutral', 'mặc định': 'neutral',
  'bất buộc': 'forced', 'miễn cưỡng': 'forced',
  'vui vẻ': 'happy', 'vui': 'happy', 'hạnh phúc': 'happy',
  'cười lớn': 'laughing', 'cười to': 'laughing', 'cười': 'laughing',
  'hài hước': 'humorous', 'hài': 'humorous',
  'buồn': 'sad', 'buồn bã': 'sad',
  'giận dữ': 'angry', 'giận': 'angry', 'tức giận': 'angry',
  'khóc': 'crying', 'khóc lóc': 'crying',
  'yêu thương': 'loving', 'yêu': 'loving', 'thương': 'loving',
  'xấu hổ': 'shy', 'ngại': 'shy', 'mắc cỡ': 'shy',
  'bối ngỡ': 'confused', 'ngạc nhiên': 'confused',
  'sốc': 'shocked', 'kinh ngạc': 'shocked',
  'suy nghĩ': 'thinking', 'đang nghĩ': 'thinking',
  'nháy mắt': 'winking',
  'ngầu': 'cool', 'chất': 'cool',
  'thoải mái': 'relaxed', 'thư giãn': 'relaxed',
  'ngon miệng': 'yummy', 'ngon': 'yummy',
  'hôn': 'kissing', 'chu môi': 'kissing',
  'tự tin': 'confident',
  'buồn ngủ': 'sleepy', 'ngủ': 'sleepy',
  'ngọt ngào': 'sweet', 'dễ thương': 'sweet',
  'bối rối': 'perplexed', 'lúng túng': 'perplexed',
};

/**
 * Danh sách Schema cho tất cả Tools mà AI Agent được phép gọi.
 * Mỗi Tool chứa:
 * - name: Tên function duy nhất
 * - description: Mô tả ngắn gọn bằng tiếng Việt
 * - parameters: JSON Schema cho tham số đầu vào
 * - execute(params, context): Hàm thực thi Tool, trả về kết quả JSON
 */
const TOOLS = [
  {
    name: 'moveForward',
    description: 'Lái xe tiến lên phía trước',
    parameters: {
      type: 'object',
      properties: {
        speed:       { type: 'number', minimum: 10, maximum: 100, description: 'Tốc độ (10-100%)' },
        duration_ms: { type: 'number', minimum: 100, maximum: 10000, description: 'Thời gian chạy (ms)' },
      },
      required: ['speed'],
    },
  },
  {
    name: 'moveBackward',
    description: 'Lái xe lùi lại phía sau',
    parameters: {
      type: 'object',
      properties: {
        speed:       { type: 'number', minimum: 10, maximum: 100, description: 'Tốc độ (10-100%)' },
        duration_ms: { type: 'number', minimum: 100, maximum: 10000, description: 'Thời gian chạy (ms)' },
      },
      required: ['speed'],
    },
  },
  {
    name: 'turnLeft',
    description: 'Rẽ / Quay xe sang trái',
    parameters: {
      type: 'object',
      properties: {
        speed: { type: 'number', minimum: 10, maximum: 100, description: 'Tốc độ xoay (10-100%)' },
        duration_ms: { type: 'number', minimum: 100, maximum: 5000, description: 'Thời gian xoay (ms)' },
      },
    },
  },
  {
    name: 'turnRight',
    description: 'Rẽ / Quay xe sang phải',
    parameters: {
      type: 'object',
      properties: {
        speed: { type: 'number', minimum: 10, maximum: 100, description: 'Tốc độ xoay (10-100%)' },
        duration_ms: { type: 'number', minimum: 100, maximum: 5000, description: 'Thời gian xoay (ms)' },
      },
    },
  },
  {
    name: 'stop',
    description: 'Dừng xe ngay lập tức (phanh khẩn cấp)',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'readBattery',
    description: 'Đọc mức pin và điện áp hiện tại của xe',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'readDistance',
    description: 'Đọc khoảng cách vật cản phía trước từ cảm biến siêu âm HC-SR04',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'captureImage',
    description: 'Chụp ảnh từ camera trên xe',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Nhãn ghi chú cho ảnh chụp' },
      },
    },
  },
  {
    name: 'flashLight',
    description: 'Bật hoặc tắt đèn pha / đèn flash LED trên xe',
    parameters: {
      type: 'object',
      properties: {
        enable: { type: 'boolean', description: 'true = bật đèn, false = tắt đèn' },
      },
      required: ['enable'],
    },
  },
  {
    name: 'beep',
    description: 'Phát tiếng còi / buzzer trên xe',
    parameters: {
      type: 'object',
      properties: {
        duration_ms: { type: 'number', minimum: 50, maximum: 3000, description: 'Thời gian bíp (ms)' },
      },
    },
  },
  {
    name: 'driveCircle',
    description: 'Lái xe chạy theo quỹ đạo vòng tròn',
    parameters: {
      type: 'object',
      properties: {
        speed: { type: 'number', minimum: 10, maximum: 100, description: 'Tốc độ chạy (10-100%)' },
        duration_ms: { type: 'number', minimum: 500, maximum: 10000, description: 'Thời gian xoay vòng (ms)' },
      },
    },
  },
  {
    name: 'driveZigzag',
    description: 'Lái xe chạy lượn theo hình ziczac',
    parameters: {
      type: 'object',
      properties: {
        speed: { type: 'number', minimum: 10, maximum: 100, description: 'Tốc độ chạy (10-100%)' },
      },
    },
  },
  {
    name: 'driveUntilObstacle',
    description: 'Lái xe tiến thẳng phía trước và tự động phanh dừng lại ngay khi gặp vật cản (cảm biến siêu âm < 20cm)',
    parameters: {
      type: 'object',
      properties: {
        speed: { type: 'number', minimum: 10, maximum: 100, description: 'Tốc độ (10-100%)' },
        max_distance_cm: { type: 'number', minimum: 5, maximum: 100, description: 'Khoảng cách dừng an toàn (cm), mặc định 20cm' },
        timeout_ms: { type: 'number', minimum: 1000, maximum: 30000, description: 'Thời gian chạy tối đa nếu không gặp vật cản (ms)' },
      },
    },
  },
  {
    name: 'changeEmotion',
    description: 'Đổi biểu cảm khuôn mặt của AI Agent Linh trên giao diện. CHỈ gọi khi Bố AN ra lệnh đổi biểu cảm.',
    parameters: {
      type: 'object',
      properties: {
        emotion: {
          type: 'string',
          enum: VALID_EMOTIONS,
          description: 'Tên biểu cảm muốn đổi (neutral, happy, sad, angry, loving, shy, cool, thinking, v.v.)',
        },
      },
      required: ['emotion'],
    },
  },
];

/**
 * Lấy danh sách Tools dạng JSON Schema để đưa vào System Prompt cho LLM.
 */
export function getToolSchemas() {
  return TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

/**
 * Tìm Tool theo tên.
 */
export function findTool(name) {
  return TOOLS.find(t => t.name === name);
}

/**
 * Validate tham số đầu vào của Tool theo Schema.
 * Trả về { valid: true } hoặc { valid: false, error: '...' }
 */
export function validateToolParams(toolName, params) {
  const tool = findTool(toolName);
  if (!tool) return { valid: false, error: `Tool "${toolName}" không tồn tại.` };

  const schema = tool.parameters;
  if (schema.required) {
    for (const key of schema.required) {
      if (params[key] === undefined || params[key] === null) {
        return { valid: false, error: `Thiếu tham số bắt buộc: "${key}" cho tool "${toolName}".` };
      }
    }
  }

  // Validate bounds for number fields
  if (schema.properties) {
    for (const [key, spec] of Object.entries(schema.properties)) {
      if (params[key] !== undefined && spec.type === 'number') {
        if (spec.minimum !== undefined && params[key] < spec.minimum) {
          return { valid: false, error: `"${key}" = ${params[key]} nhỏ hơn giới hạn tối thiểu (${spec.minimum}).` };
        }
        if (spec.maximum !== undefined && params[key] > spec.maximum) {
          return { valid: false, error: `"${key}" = ${params[key]} vượt quá giới hạn tối đa (${spec.maximum}).` };
        }
      }
    }
  }

  return { valid: true };
}

/**
 * Gửi lệnh điều khiển tới cả xe thật (nếu kết nối) lẫn giao diện DEMO Web Frontend
 */
function emitDriveCommand(cmd, context = {}) {
  const { deviceSocket, ioSocket } = context;
  if (deviceSocket) {
    deviceSocket.emit('drive_command', cmd);
  }
  if (ioSocket) {
    ioSocket.emit('drive_command', cmd);
  }
}

/**
 * Thực thi Tool trên xe thông qua Socket.IO.
 *
 * @param {string} toolName - Tên tool cần gọi
 * @param {object} params - Tham số đầu vào
 * @param {object} context - { deviceSocket, ioSocket, latestTelemetry }
 * @returns {Promise<object>} Kết quả thực thi tool
 */
export async function executeTool(toolName, params = {}, context = {}) {
  const { deviceSocket, ioSocket, latestTelemetry } = context;

  switch (toolName) {
    // ==================== DI CHUYỂN ====================
    case 'moveForward': {
      const speed = params.speed || 50;
      const duration = params.duration_ms || 2000;
      const speedLimit = Math.min(100, Math.max(10, speed));

      emitDriveCommand({ x: 0, y: 1.0, speedLimit }, context);

      // Nếu có duration, tự dừng sau khoảng thời gian
      if (duration > 0) {
        await sleep(duration);
        emitDriveCommand({ x: 0, y: 0, speedLimit }, context);
      }

      return { success: true, action: 'moveForward', speed: speedLimit, duration_ms: duration };
    }

    case 'moveBackward': {
      const speed = params.speed || 50;
      const duration = params.duration_ms || 2000;
      const speedLimit = Math.min(100, Math.max(10, speed));

      emitDriveCommand({ x: 0, y: -1.0, speedLimit }, context);

      if (duration > 0) {
        await sleep(duration);
        emitDriveCommand({ x: 0, y: 0, speedLimit }, context);
      }

      return { success: true, action: 'moveBackward', speed: speedLimit, duration_ms: duration };
    }

    case 'turnLeft': {
      const speed = params.speed || 40;
      const duration = params.duration_ms || 800;
      const speedLimit = Math.min(100, Math.max(10, speed));

      emitDriveCommand({ x: -1.0, y: 0.3, speedLimit }, context);

      if (duration > 0) {
        await sleep(duration);
        emitDriveCommand({ x: 0, y: 0, speedLimit }, context);
      }

      return { success: true, action: 'turnLeft', speed: speedLimit, duration_ms: duration };
    }

    case 'turnRight': {
      const speed = params.speed || 40;
      const duration = params.duration_ms || 800;
      const speedLimit = Math.min(100, Math.max(10, speed));

      emitDriveCommand({ x: 1.0, y: 0.3, speedLimit }, context);

      if (duration > 0) {
        await sleep(duration);
        emitDriveCommand({ x: 0, y: 0, speedLimit }, context);
      }

      return { success: true, action: 'turnRight', speed: speedLimit, duration_ms: duration };
    }

    case 'driveCircle': {
      const speed = params.speed || 50;
      const duration = params.duration_ms || 3500;
      const speedLimit = Math.min(100, Math.max(10, speed));

      emitDriveCommand({ x: 0.85, y: 0.85, speedLimit }, context);

      if (duration > 0) {
        await sleep(duration);
        emitDriveCommand({ x: 0, y: 0, speedLimit }, context);
      }

      return { success: true, action: 'driveCircle', speed: speedLimit, duration_ms: duration };
    }

    case 'driveZigzag': {
      const speed = params.speed || 50;
      const speedLimit = Math.min(100, Math.max(10, speed));

      emitDriveCommand({ x: -0.8, y: 0.8, speedLimit }, context);
      await sleep(600);
      emitDriveCommand({ x: 0.8, y: 0.8, speedLimit }, context);
      await sleep(600);
      emitDriveCommand({ x: -0.8, y: 0.8, speedLimit }, context);
      await sleep(600);
      emitDriveCommand({ x: 0, y: 0, speedLimit: 0 }, context);

      return { success: true, action: 'driveZigzag', speed: speedLimit };
    }

    case 'driveUntilObstacle': {
      const speed = params.speed || 50;
      const stopDistance = params.max_distance_cm || 20;
      const timeout = params.timeout_ms || 10000;
      const speedLimit = Math.min(100, Math.max(10, speed));

      // 1. Phát lệnh tiến
      emitDriveCommand({ x: 0, y: 1.0, speedLimit }, context);

      const startTime = Date.now();
      let stoppedReason = 'timeout';

      // 2. Vòng lặp kiểm tra cảm biến liên tục mỗi 100ms
      while (Date.now() - startTime < timeout) {
        await sleep(100);
        const currentDist = context.latestTelemetry?.distance;
        if (currentDist !== undefined && currentDist > 0 && currentDist <= stopDistance) {
          stoppedReason = 'obstacle';
          break;
        }
      }

      // 3. Phanh dừng xe
      emitDriveCommand({ x: 0, y: 0, speedLimit: 0 }, context);

      return {
        success: true,
        action: 'driveUntilObstacle',
        stopped_by: stoppedReason,
        final_distance: context.latestTelemetry?.distance ?? -1,
      };
    }

    case 'stop': {
      emitDriveCommand({ x: 0, y: 0, speedLimit: 0 }, context);
      return { success: true, action: 'stop' };
    }

    // ==================== CẢM BIẾN ====================
    case 'readBattery': {
      const t = latestTelemetry || {};
      return {
        success: true,
        action: 'readBattery',
        percentage: t.batteryPercentage ?? -1,
        voltage: t.batteryVoltage ?? -1,
      };
    }

    case 'readDistance': {
      const t = latestTelemetry || {};
      return {
        success: true,
        action: 'readDistance',
        distance_cm: t.distance ?? -1,
        is_obstacle: (t.distance ?? 999) < 15,
      };
    }

    // ==================== NGOẠI VI ====================
    case 'captureImage': {
      const { deviceSocket, ioSocket } = context;
      if (deviceSocket) deviceSocket.emit('capture_image', { label: params.label || 'snapshot' });
      if (ioSocket) ioSocket.emit('capture_image', { label: params.label || 'snapshot' });

      return {
        success: true,
        action: 'captureImage',
        label: params.label || 'snapshot',
        message: 'Đã gửi lệnh chụp ảnh FPV Camera.',
      };
    }

    case 'flashLight': {
      const { deviceSocket, ioSocket } = context;
      const enable = params.enable ?? true;
      if (deviceSocket) deviceSocket.emit('toggle_headlight', { enable });
      if (ioSocket) ioSocket.emit('toggle_headlight', { enable });

      return {
        success: true,
        action: 'flashLight',
        enabled: enable,
        message: `Đã ${enable ? 'bật' : 'tắt'} đèn pha LED.`,
      };
    }

    case 'beep': {
      const { deviceSocket, ioSocket } = context;
      const duration_ms = params.duration_ms || 300;
      if (deviceSocket) deviceSocket.emit('trigger_buzzer', { duration_ms });
      if (ioSocket) ioSocket.emit('trigger_buzzer', { duration_ms });

      return {
        success: true,
        action: 'beep',
        duration_ms,
        message: 'Đã phát tín hiệu còi bíp.',
      };
    }

    case 'changeEmotion': {
      const emotion = params.emotion || 'neutral';
      if (!VALID_EMOTIONS.includes(emotion)) {
        return { success: false, error: `Biểu cảm "${emotion}" không hợp lệ.` };
      }
      // Emit emotion change event tới tất cả frontend clients
      if (ioSocket) {
        ioSocket.emit('emotion_change', { emotion });
      }
      console.log(`[TOOL] 😊 Đã đổi biểu cảm AI Agent sang: ${emotion}`);
      return { success: true, action: 'changeEmotion', emotion };
    }

    default:
      return { success: false, error: `Tool "${toolName}" không được hỗ trợ.` };
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

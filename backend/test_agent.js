import 'dotenv/config';
import { processVoiceCommand, getAgentStatus } from './ai/agent_router.js';

async function runTests() {
  console.log('=== KIỂM TRA HỆ THỐNG AI AGENT (TIER 1 & TIER 2) ===\n');

  const status = await getAgentStatus();
  console.log('Trạng thái AI Agent:', JSON.stringify(status, null, 2));

  console.log('\n--- TEST 1: Câu lệnh đơn giản (Fast-Path Tier 1) ---');
  const res1 = await processVoiceCommand('tiến 2 giây');
  console.log('Kết quả Test 1:', JSON.stringify(res1, null, 2));

  console.log('\n--- TEST 2: Câu lệnh rẽ (Fast-Path Tier 1) ---');
  const res2 = await processVoiceCommand('rẽ trái');
  console.log('Kết quả Test 2:', JSON.stringify(res2, null, 2));

  console.log('\n--- TEST 3: Câu hỏi pin (Fast-Path Tier 1 với Telemetry) ---');
  const res3 = await processVoiceCommand('xem pin', {
    latestTelemetry: { batteryPercentage: 85, batteryVoltage: 7.8, distance: 40 }
  });
  console.log('Kết quả Test 3:', JSON.stringify(res3, null, 2));

  console.log('\n=== HOÀN THÀNH KIỂM TRA SƠ BỘ ===');
}

runTests();

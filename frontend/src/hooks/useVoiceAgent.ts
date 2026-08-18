import { useState, useRef, useCallback, useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import type { EmotionKey } from '../components/EmotionAvatar';

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  tier?: number;
  latency_ms?: number;
  tool_calls?: Array<{ tool: string; params: Record<string, unknown> }>;
  timestamp: string;
}

interface AgentResponse {
  reply: string;
  tool_calls: Array<{ tool: string; params: Record<string, unknown> }>;
  executions: Array<{ tool: string; success: boolean; error?: string; action?: string; emotion?: string }>;
  tier: number;
  model?: string;
  latency_ms: number;
  error?: string;
  emotion?: string;
}

/**
 * Hook quản lý toàn bộ luồng Voice Input & AI Agent Response.
 * - Thu âm giọng nói qua Web Speech API (webkitSpeechRecognition)
 * - Gửi text command qua Socket.IO event 'voice_command'
 * - Nhận phản hồi từ AI Agent qua event 'agent_response'
 * - Hỗ trợ TTS đọc kết quả bằng Web Speech Synthesis
 */
export function useVoiceAgent(
  socketRef: React.RefObject<Socket | null>,
  addLog?: (msg: string, type?: 'info' | 'warning' | 'error' | 'success') => void,
) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const [currentEmotion, setCurrentEmotion] = useState<EmotionKey>('neutral');
  const recognitionRef = useRef<any>(null);
  const lastTranscriptRef = useRef('');

  // Stable refs to prevent stale closure & memory leaks
  const addLogRef = useRef(addLog);
  addLogRef.current = addLog;
  const isTtsEnabledRef = useRef(isTtsEnabled);
  isTtsEnabledRef.current = isTtsEnabled;

  // Hàm gán listener phản hồi AI Agent (luôn xóa sạch listener cũ trước khi gán 1 listener duy nhất)
  const ensureAgentListener = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return false;

    const handleAgentResponse = (data: AgentResponse) => {
      setIsProcessing(false);

      const agentMsg: AgentMessage = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        text: data.reply,
        tier: data.tier,
        latency_ms: data.latency_ms,
        tool_calls: data.tool_calls,
        timestamp: new Date().toLocaleTimeString('vi-VN'),
      };

      setMessages(prev => [...prev, agentMsg]);

      // Log ra System Log
      const tierLabel = 'Voice AI ⚡';
      addLogRef.current?.(`[${tierLabel}] ${data.reply} (${data.latency_ms}ms)`, data.error ? 'warning' : 'success');

      // Text-to-Speech đọc phản hồi bằng giọng Google Tiếng Việt
      if (isTtsEnabledRef.current && data.reply && !data.error) {
        speakVietnamese(data.reply);
      }

      // Cập nhật biểu cảm nếu có trong response
      if (data.emotion) {
        setCurrentEmotion(data.emotion as EmotionKey);
      }
    };

    socket.off('agent_response');
    socket.on('agent_response', handleAgentResponse);

    // Listener cho emotion_change event trực tiếp từ tool execution
    socket.off('emotion_change');
    socket.on('emotion_change', (data: { emotion: string }) => {
      if (data.emotion) {
        setCurrentEmotion(data.emotion as EmotionKey);
      }
    });

    return true;
  }, [socketRef]);

  // Luôn giữ listener hoạt động khi WebSocket sẵn sàng
  useEffect(() => {
    ensureAgentListener();
    const interval = setInterval(() => {
      ensureAgentListener();
    }, 1000);
    return () => clearInterval(interval);
  }, [ensureAgentListener]);

  // Gửi lệnh text (và ảnh FPV nếu có) tới Backend AI Agent
  const sendCommand = useCallback((text: string, image?: string) => {
    if (!text.trim()) return;

    // Mở khóa Audio context trên trình duyệt khi người dùng thao tác
    if (typeof Audio !== 'undefined') {
      const unlockAudio = new Audio();
      unlockAudio.play().catch(() => {});
    }

    // Đảm bảo listener agent_response được gán 100% trước khi emit
    ensureAgentListener();

    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      addLog?.('Chưa kết nối WebSocket. Không thể gửi lệnh AI.', 'error');
      return;
    }

    // Thêm tin nhắn của user vào danh sách chat
    const userMsg: AgentMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString('vi-VN'),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);

    addLog?.(`🎤 Gửi lệnh AI: "${text.trim()}"${image ? ' (kèm ảnh FPV)' : ''}`, 'info');

    socket.emit('voice_command', { text: text.trim(), image: image || null });
  }, [socketRef, addLog, ensureAgentListener]);

  // Bắt đầu / Dừng nhận diện giọng nói qua Web Speech API
  const toggleListening = useCallback(() => {
    if (isListening) {
      // Dừng thu âm
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
      return;
    }

    // Kiểm tra browser hỗ trợ Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addLog?.('❌ Trình duyệt không hỗ trợ Web Speech API. Hãy sử dụng Google Chrome hoặc Microsoft Edge.', 'error');
      alert('Trình duyệt này không hỗ trợ nhận diện giọng nói Web Speech API.\nHãy mở bằng Google Chrome hoặc Microsoft Edge!');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN'; // Nhận diện tiếng Việt chuẩn
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    lastTranscriptRef.current = '';

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('');
      addLog?.('🎙️ Đang lắng nghe giọng nói Tiếng Việt...', 'info');
    };

    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const itemText = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          finalText += itemText;
        } else {
          interimText += itemText;
        }
      }

      const textCaptured = (finalText || interimText).trim();
      if (textCaptured) {
        lastTranscriptRef.current = textCaptured;
        setTranscript(textCaptured);
      }

      // Nếu có kết quả cuối cùng -> Gửi ngay lập tức
      if (finalText.trim()) {
        sendCommand(finalText.trim());
        lastTranscriptRef.current = '';
      }
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      const err = event.error;
      if (err === 'no-speech') {
        addLog?.('🎙️ Không nghe thấy giọng nói. Hãy thử nói to hơn.', 'warning');
      } else if (err === 'not-allowed' || err === 'service-not-allowed') {
        addLog?.('⚠️ Trình duyệt chặn Micro! Hãy bấm icon 🔒/🎙️ ở thanh URL để cho phép Micro.', 'error');
        alert('Trình duyệt chưa được cấp quyền dùng Micro!\nHãy nhấp vào biểu tượng 🔒 hoặc 🎙️ cạnh địa chỉ trang web (http://localhost:5173) -> chọn Allow/Cho phép Microphone.');
      } else {
        addLog?.(`⚠️ Lỗi nhận diện giọng nói: ${err}`, 'error');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // Fallback: nếu ngắt thu âm mà còn text dở dở chưa gửi làm final -> gửi nốt
      if (lastTranscriptRef.current.trim()) {
        sendCommand(lastTranscriptRef.current.trim());
        lastTranscriptRef.current = '';
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e: any) {
      addLog?.(`⚠️ Lỗi khởi chạy Micro: ${e.message}`, 'error');
    }
  }, [isListening, sendCommand, addLog]);

  // Xóa lịch sử chat
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    isListening,
    isProcessing,
    transcript,
    messages,
    isTtsEnabled,
    setIsTtsEnabled,
    toggleListening,
    sendCommand,
    clearMessages,
    currentEmotion,
  };
}

let currentAudioPlayer: HTMLAudioElement | null = null;

/**
 * Text-to-Speech: Đọc câu trả lời bằng CHỊ GOOGLE TIẾNG VIỆT (100% Giọng Nữ Chị Google).
 */
function speakVietnamese(text: string) {
  const cleanText = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{2702}-\u{27B0}⚡⬅️➡️🔋📏🛑📸💡🌑📢❌⚠️⏱️🚗🔙🎤🧠✅🔧]/gu, '').trim();
  if (!cleanText) return;

  // Dừng câu nói trước đó nếu đang phát
  if (currentAudioPlayer) {
    currentAudioPlayer.pause();
    currentAudioPlayer = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  // Gọi Backend Google TTS API (Chị Google Tiếng Việt Chuẩn)
  const host = window.location.hostname || 'localhost';
  const backendUrl = `http://${host}:3000/api/tts?text=${encodeURIComponent(cleanText)}`;

  const audio = new Audio(backendUrl);
  currentAudioPlayer = audio;

  audio.play().catch(err => {
    console.warn('Backend Google TTS playback failed, falling back to Browser Web Speech API:', err);
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'vi-VN';
      utterance.rate = 1.05;
      utterance.pitch = 1.15; // Nâng cao cao độ âm thanh đảm bảo chuẩn giọng Nữ

      const voices = window.speechSynthesis.getVoices();
      // Tìm giọng Nữ Chị Google hoặc giọng Nữ Tiếng Việt, LỌC BỎ HOÀN TOÀN giọng Nam (như An / Male)
      const femaleViVoice = voices.find(v => {
        const name = v.name.toLowerCase();
        const isVi = v.lang.includes('vi') || name.includes('vietnam');
        const isMale = name.includes('an') || name.includes('male') || name.includes('nam');
        return isVi && !isMale;
      }) || voices.find(v => v.lang.includes('vi'));

      if (femaleViVoice) utterance.voice = femaleViVoice;

      window.speechSynthesis.speak(utterance);
    }
  });
}

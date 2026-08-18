import { useState, useRef, useEffect } from 'react';
import type { AgentMessage } from '../hooks/useVoiceAgent';
import { EmotionAvatar, EMOTION_LABELS } from './EmotionAvatar';
import type { EmotionKey } from './EmotionAvatar';

interface VoiceControlProps {
  isListening: boolean;
  isProcessing: boolean;
  transcript: string;
  messages: AgentMessage[];
  isTtsEnabled: boolean;
  setIsTtsEnabled: (v: boolean) => void;
  toggleListening: () => void;
  sendCommand: (text: string) => void;
  clearMessages: () => void;
  currentEmotion: EmotionKey;
}

/**
 * VoiceControl — Bảng điều khiển AI Agent bằng giọng nói.
 * Gồm: Nút micro, chat log, ô nhập lệnh, toggle TTS.
 */
export function VoiceControl({
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
}: VoiceControlProps) {
  const [textInput, setTextInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Cuộn nội bộ khung chat xuống cuối khi có tin nhắn mới (KHÔNG làm cuộn trang chính)
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim()) {
      sendCommand(textInput.trim());
      setTextInput('');
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header} onClick={() => setIsExpanded(!isExpanded)}>
        <div style={styles.headerLeft}>
          <EmotionAvatar emotion={currentEmotion} size={34} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={styles.headerTitle}>AI Agent</span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{EMOTION_LABELS[currentEmotion]}</span>
          </div>
          {isProcessing && <span style={styles.processingDot} />}
        </div>
        <div style={styles.headerRight}>
          <button
            onClick={(e) => { e.stopPropagation(); setIsTtsEnabled(!isTtsEnabled); }}
            style={{ ...styles.ttsBtn, opacity: isTtsEnabled ? 1 : 0.4 }}
            title={isTtsEnabled ? 'Tắt giọng nói phản hồi' : 'Bật giọng nói phản hồi'}
          >
            {isTtsEnabled ? '🔊' : '🔇'}
          </button>
          <span style={styles.collapseBtn}>{isExpanded ? '▼' : '▲'}</span>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* Chat Messages */}
          <div ref={chatContainerRef} style={styles.chatArea}>
            {messages.length === 0 && (
              <div style={styles.emptyState}>
                <div style={{ fontSize: 28 }}>🎤</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 6 }}>
                  Bấm micro hoặc gõ lệnh để điều khiển xe
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} style={{
                ...styles.msgBubble,
                ...(msg.role === 'user' ? styles.userBubble : styles.agentBubble),
              }}>
                <div style={styles.msgText}>{msg.text}</div>
                <div style={styles.msgMeta}>
                  <span>{msg.timestamp}</span>
                  {msg.tier && (
                    <span style={{
                      ...styles.tierBadge,
                      background: msg.tier === 1 ? 'rgba(0,255,136,0.2)' : 'rgba(0,170,255,0.2)',
                      color: msg.tier === 1 ? '#00ff88' : '#00aaff',
                    }}>
                      {msg.tier === 1 ? '⚡ Fast' : '🧠 LLM'}
                    </span>
                  )}
                  {msg.latency_ms !== undefined && (
                    <span style={styles.latencyBadge}>{msg.latency_ms}ms</span>
                  )}
                </div>
                {msg.tool_calls && msg.tool_calls.length > 0 && (
                  <div style={styles.toolCallsBox}>
                    {msg.tool_calls.map((tc, i) => (
                      <span key={i} style={styles.toolChip}>
                        🔧 {tc.tool}({Object.keys(tc.params || {}).length > 0
                          ? Object.entries(tc.params).map(([k, v]) => `${k}=${v}`).join(', ')
                          : ''})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isProcessing && (
              <div style={{ ...styles.msgBubble, ...styles.agentBubble }}>
                <div style={styles.typingIndicator}>
                  <span style={styles.typingDot} /><span style={styles.typingDot} /><span style={styles.typingDot} />
                </div>
              </div>
            )}
            {transcript && isListening && (
              <div style={styles.transcriptPreview}>
                🎙️ {transcript}...
              </div>
            )}
          </div>

          {/* Input Area */}
          <div style={styles.inputArea}>
            <button
              onClick={toggleListening}
              style={{
                ...styles.micBtn,
                background: isListening
                  ? 'linear-gradient(135deg, #ff3366, #ff0044)'
                  : 'linear-gradient(135deg, #00aaff, #0066ff)',
                animation: isListening ? 'pulse 1.2s infinite' : 'none',
              }}
              title={isListening ? 'Dừng thu âm' : 'Bấm để nói'}
            >
              {isListening ? '⏹️' : '🎤'}
            </button>
            <form onSubmit={handleSubmit} style={styles.inputForm}>
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Gõ lệnh cho AI Agent..."
                style={styles.textInput}
                disabled={isProcessing}
              />
              <button
                type="submit"
                style={styles.sendBtn}
                disabled={!textInput.trim() || isProcessing}
              >
                ➤
              </button>
            </form>
            {messages.length > 0 && (
              <button onClick={clearMessages} style={styles.clearBtn} title="Xóa lịch sử chat">
                🗑️
              </button>
            )}
          </div>
        </>
      )}

      {/* Pulse animation CSS */}
      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(255,0,68,0.5); }
          70% { box-shadow: 0 0 0 12px rgba(255,0,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,0,68,0); }
        }
        @keyframes blink {
          0%, 80%, 100% { opacity: 0.3; }
          40% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ==================== STYLES ====================
const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(10, 15, 30, 0.85)',
    backdropFilter: 'blur(16px)',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    cursor: 'pointer',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    userSelect: 'none',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: { fontSize: 18 },
  headerTitle: {
    color: '#e0e6f0',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 0.3,
  },
  processingDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#00aaff',
    animation: 'pulse 1s infinite',
    display: 'inline-block',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  ttsBtn: {
    background: 'none',
    border: 'none',
    fontSize: 16,
    cursor: 'pointer',
    padding: '2px 4px',
  },
  collapseBtn: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
  },
  chatArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 10px',
    maxHeight: 280,
    minHeight: 80,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 0',
    opacity: 0.6,
  },
  msgBubble: {
    padding: '8px 12px',
    borderRadius: 10,
    maxWidth: '92%',
    fontSize: 13,
    lineHeight: 1.5,
    wordBreak: 'break-word' as const,
  },
  userBubble: {
    alignSelf: 'flex-end',
    background: 'linear-gradient(135deg, rgba(0,102,255,0.4), rgba(0,170,255,0.25))',
    color: '#e0f0ff',
    borderBottomRightRadius: 3,
  },
  agentBubble: {
    alignSelf: 'flex-start',
    background: 'rgba(255,255,255,0.06)',
    color: '#d0d8e8',
    borderBottomLeftRadius: 3,
  },
  msgText: {
    margin: 0,
  },
  msgMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
  },
  tierBadge: {
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 700,
  },
  latencyBadge: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.25)',
  },
  toolCallsBox: {
    marginTop: 6,
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
  },
  toolChip: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 6,
    background: 'rgba(255,170,0,0.12)',
    color: '#ffaa44',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  transcriptPreview: {
    alignSelf: 'center',
    padding: '4px 12px',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontStyle: 'italic',
  },
  typingIndicator: {
    display: 'flex',
    gap: 4,
    padding: '4px 0',
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'rgba(0,170,255,0.6)',
    animation: 'blink 1.4s infinite both',
    display: 'inline-block',
  },
  inputArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 10px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  micBtn: {
    width: 38,
    height: 38,
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: '#fff',
    transition: 'transform 0.15s',
  },
  inputForm: {
    flex: 1,
    display: 'flex',
    gap: 4,
  },
  textInput: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#e0e6f0',
    fontSize: 13,
    outline: 'none',
  },
  sendBtn: {
    padding: '6px 12px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #00aaff, #0066ff)',
    color: '#fff',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    fontSize: 16,
    cursor: 'pointer',
    opacity: 0.4,
    padding: '4px',
    transition: 'opacity 0.2s',
  },
};

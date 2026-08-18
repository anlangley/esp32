import { Mic, MicOff } from 'lucide-react';

interface AiFloatingMicProps {
  voiceAgent: {
    isListening: boolean;
    isProcessing: boolean;
    transcript: string;
    messages: any[];
    toggleListening: () => void;
    sendCommand: (text: string) => void;
  };
}

export function AiFloatingMic({ voiceAgent }: AiFloatingMicProps) {
  const lastMsg = voiceAgent.messages.length > 0
    ? voiceAgent.messages[voiceAgent.messages.length - 1]
    : null;

  return (
    <>
      {/* FLOATING MICROPHONE BUTTON ON RIGHT EDGE VERTICALLY CENTERED FOR MOBILE FPV */}
      <div className="fixed right-3 sm:right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center pointer-events-auto select-none">
        <button
          onClick={voiceAgent.toggleListening}
          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 flex flex-col items-center justify-center transition-all duration-300 shadow-2xl active:scale-95 touch-none ${voiceAgent.isListening
              ? 'bg-red-600 border-white text-white shadow-[0_0_30px_rgba(255,0,0,0.9)] animate-pulse scale-110'
              : voiceAgent.isProcessing
                ? 'bg-amber-500 border-white text-white shadow-[0_0_25px_rgba(245,158,11,0.9)] animate-bounce'
                : 'bg-black/65 border-cyber-neonBlue text-cyber-neonBlue hover:bg-cyber-neonBlue/20 shadow-[0_0_20px_rgba(0,240,255,0.6)] backdrop-blur-md'
            }`}
          title={voiceAgent.isListening ? 'Đang lắng nghe... Bấm để dừng' : 'Bấm để nói với AI (Bé Linh)'}
        >
          {voiceAgent.isListening ? (
            <MicOff className="w-7 h-7 sm:w-8 sm:h-8 animate-pulse" />
          ) : (
            <Mic className="w-7 h-7 sm:w-8 sm:h-8" />
          )}
        </button>
        <span className="text-[9px] sm:text-[10px] font-black font-mono uppercase tracking-tighter text-white mt-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] bg-black/70 px-2 py-0.5 rounded-full border border-cyber-neonBlue/30 backdrop-blur-sm">
          {voiceAgent.isListening ? '🔴 ĐANG NGHE' : voiceAgent.isProcessing ? '⚡ ĐANG NGHĨ' : '🎙️ BÉ LINH AI'}
        </span>
      </div>

      {/* FLOATING AI RESPONSE TOAST BANNER ON FPV SCREEN */}
      {lastMsg && (
        <div className="fixed top-12 sm:top-14 left-1/2 -translate-x-1/2 z-50 max-w-sm sm:max-w-md w-[88%] bg-black/85 border border-cyber-neonBlue/60 text-white p-3 rounded-2xl shadow-[0_0_30px_rgba(0,240,255,0.4)] backdrop-blur-md transition-all duration-300 animate-fadeIn pointer-events-auto flex items-start gap-2.5">
          <div className="text-xl shrink-0 mt-0.5">🤖</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-extrabold text-cyber-neonBlue flex items-center gap-1 font-mono uppercase tracking-wider">
                Bé Linh AI {lastMsg.tier === 1 ? '⚡ Fast' : '🧠 Gemini'}
              </span>
              <span className="text-[10px] text-gray-400 font-mono">{lastMsg.timestamp}</span>
            </div>
            <p className="text-xs sm:text-sm font-medium text-gray-100 leading-snug break-words">
              {lastMsg.text}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

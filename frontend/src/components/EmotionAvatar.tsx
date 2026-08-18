import { useMemo, type JSX } from 'react';

// ============================================================================
// EMOTION AVATAR — Component hiển thị khuôn mặt biểu cảm AI Agent Linh
// 24 biểu cảm vẽ bằng CSS/SVG (nền đen, mắt trắng) giống style ESP32 OLED
// ============================================================================

export type EmotionKey =
  | 'neutral' | 'forced' | 'happy' | 'laughing' | 'humorous'
  | 'sad' | 'angry' | 'crying' | 'loving' | 'shy'
  | 'confused' | 'shocked' | 'thinking' | 'winking' | 'cool'
  | 'relaxed' | 'yummy' | 'kissing' | 'confident' | 'sleepy'
  | 'sweet' | 'perplexed' | 'processing' | 'error';

interface EmotionAvatarProps {
  emotion: EmotionKey;
  size?: number;
}

// Tên tiếng Việt cho mỗi biểu cảm
const EMOTION_LABELS: Record<EmotionKey, string> = {
  neutral: 'Trung lập',
  forced: 'Bất buộc',
  happy: 'Vui vẻ',
  laughing: 'Cười lớn',
  humorous: 'Hài hước',
  sad: 'Buồn',
  angry: 'Giận dữ',
  crying: 'Khóc',
  loving: 'Yêu thương',
  shy: 'Xấu hổ',
  confused: 'Bối ngỡ',
  shocked: 'Sốc',
  thinking: 'Suy nghĩ',
  winking: 'Nháy mắt',
  cool: 'Ngầu',
  relaxed: 'Thoải mái',
  yummy: 'Ngon miệng',
  kissing: 'Hôn',
  confident: 'Tự tin',
  sleepy: 'Buồn ngủ',
  sweet: 'Ngọt ngào',
  perplexed: 'Bối rối',
  processing: 'Đang xử lý',
  error: 'Lỗi',
};

/**
 * Hàm render SVG cho mỗi biểu cảm.
 * Mỗi biểu cảm là 1 cặp mắt + miệng trên nền đen, style giống OLED ESP32.
 */
function renderEyesAndMouth(emotion: EmotionKey, s: number): JSX.Element {
  // Scale factor relative to 40px base
  const f = s / 40;

  // Helper: scale px values
  const px = (v: number) => v * f;

  // Common eye positions (center-based in SVG viewBox)
  // ViewBox is 40x40, center at 20,20
  const cx = s / 2;
  const cy = s / 2;

  switch (emotion) {
    case 'neutral':
      return (
        <>
          {/* Neutral eyes — two neat ovals */}
          <ellipse cx={cx - px(7)} cy={cy - px(3)} rx={px(4)} ry={px(5)} fill="white" />
          <ellipse cx={cx + px(7)} cy={cy - px(3)} rx={px(4)} ry={px(5)} fill="white" />
          {/* Small straight mouth */}
          <line x1={cx - px(4)} y1={cy + px(8)} x2={cx + px(4)} y2={cy + px(8)} stroke="white" strokeWidth={px(1.5)} strokeLinecap="round" />
        </>
      );

    case 'forced':
      return (
        <>
          {/* Flat line eyes (—  —) */}
          <line x1={cx - px(11)} y1={cy - px(3)} x2={cx - px(3)} y2={cy - px(3)} stroke="#aaa" strokeWidth={px(2.5)} strokeLinecap="round" />
          <line x1={cx + px(3)} y1={cy - px(3)} x2={cx + px(11)} y2={cy - px(3)} stroke="#aaa" strokeWidth={px(2.5)} strokeLinecap="round" />
          {/* Straight flat unamused mouth */}
          <line x1={cx - px(6)} y1={cy + px(8)} x2={cx + px(6)} y2={cy + px(8)} stroke="#aaa" strokeWidth={px(2)} strokeLinecap="round" />
        </>
      );

    case 'happy':
      return (
        <>
          {/* Happy eyes — upward arcs (^  ^) */}
          <path d={`M${cx - px(10)} ${cy - px(1)} Q${cx - px(7)} ${cy - px(8)} ${cx - px(4)} ${cy - px(1)}`} stroke="#39ff14" fill="none" strokeWidth={px(2.5)} strokeLinecap="round" />
          <path d={`M${cx + px(4)} ${cy - px(1)} Q${cx + px(7)} ${cy - px(8)} ${cx + px(10)} ${cy - px(1)}`} stroke="#39ff14" fill="none" strokeWidth={px(2.5)} strokeLinecap="round" />
          {/* Smile mouth */}
          <path d={`M${cx - px(6)} ${cy + px(5)} Q${cx} ${cy + px(13)} ${cx + px(6)} ${cy + px(5)}`} stroke="white" fill="none" strokeWidth={px(2)} strokeLinecap="round" />
        </>
      );

    case 'laughing':
      return (
        <>
          {/* Upward arcs (^ ^) */}
          <path d={`M${cx - px(10)} ${cy - px(2)} Q${cx - px(7)} ${cy - px(8)} ${cx - px(4)} ${cy - px(2)}`} stroke="#00f0ff" fill="none" strokeWidth={px(2.5)} strokeLinecap="round" />
          <path d={`M${cx + px(4)} ${cy - px(2)} Q${cx + px(7)} ${cy - px(8)} ${cx + px(10)} ${cy - px(2)}`} stroke="#00f0ff" fill="none" strokeWidth={px(2.5)} strokeLinecap="round" />
          {/* Wide open mouth filled with tongue */}
          <path d={`M${cx - px(7)} ${cy + px(4)} Q${cx} ${cy + px(15)} ${cx + px(7)} ${cy + px(4)} Z`} fill="white" stroke="white" strokeWidth={px(1)} />
          <ellipse cx={cx} cy={cy + px(9)} rx={px(3)} ry={px(2)} fill="#ff4466" />
        </>
      );

    case 'humorous':
      return (
        <>
          {/* One eye winking, one big open */}
          <circle cx={cx - px(7)} cy={cy - px(3)} r={px(4.5)} fill="#ffff00" />
          <circle cx={cx - px(7)} cy={cy - px(3)} r={px(1.8)} fill="black" />
          <path d={`M${cx + px(3)} ${cy - px(2)} Q${cx + px(7)} ${cy - px(8)} ${cx + px(11)} ${cy - px(2)}`} stroke="#ffff00" fill="none" strokeWidth={px(2.5)} strokeLinecap="round" />
          {/* Wide grin */}
          <path d={`M${cx - px(6)} ${cy + px(5)} Q${cx} ${cy + px(13)} ${cx + px(6)} ${cy + px(5)}`} stroke="white" fill="none" strokeWidth={px(2)} strokeLinecap="round" />
        </>
      );

    case 'sad':
      return (
        <>
          {/* Sad droopy eyes */}
          <ellipse cx={cx - px(7)} cy={cy - px(1)} rx={px(3)} ry={px(4)} fill="#64b5f6" />
          <ellipse cx={cx + px(7)} cy={cy - px(1)} rx={px(3)} ry={px(4)} fill="#64b5f6" />
          {/* Slanted sad eyebrows \ / */}
          <line x1={cx - px(11)} y1={cy - px(7)} x2={cx - px(3)} y2={cy - px(10)} stroke="#64b5f6" strokeWidth={px(2)} strokeLinecap="round" />
          <line x1={cx + px(3)} y1={cy - px(10)} x2={cx + px(11)} y2={cy - px(7)} stroke="#64b5f6" strokeWidth={px(2)} strokeLinecap="round" />
          {/* Frown mouth ∩ */}
          <path d={`M${cx - px(6)} ${cy + px(10)} Q${cx} ${cy + px(4)} ${cx + px(6)} ${cy + px(10)}`} stroke="#64b5f6" fill="none" strokeWidth={px(2)} strokeLinecap="round" />
        </>
      );

    case 'angry':
      return (
        <>
          {/* Angry red slanted eyes */}
          <ellipse cx={cx - px(7)} cy={cy - px(1)} rx={px(3.5)} ry={px(3.5)} fill="#ff3366" />
          <ellipse cx={cx + px(7)} cy={cy - px(1)} rx={px(3.5)} ry={px(3.5)} fill="#ff3366" />
          {/* Sharp angry eyebrows / \ */}
          <line x1={cx - px(12)} y1={cy - px(6)} x2={cx - px(2)} y2={cy - px(11)} stroke="#ff0044" strokeWidth={px(3)} strokeLinecap="round" />
          <line x1={cx + px(2)} y1={cy - px(11)} x2={cx + px(12)} y2={cy - px(6)} stroke="#ff0044" strokeWidth={px(3)} strokeLinecap="round" />
          {/* Angry serrated mouth */}
          <path d={`M${cx - px(6)} ${cy + px(7)} L${cx - px(3)} ${cy + px(10)} L${cx} ${cy + px(6)} L${cx + px(3)} ${cy + px(10)} L${cx + px(6)} ${cy + px(7)}`} stroke="#ff0044" fill="none" strokeWidth={px(2)} strokeLinecap="round" />
        </>
      );

    case 'crying':
      return (
        <>
          {/* Crying eyes */}
          <ellipse cx={cx - px(7)} cy={cy - px(2)} rx={px(3.5)} ry={px(4.5)} fill="white" />
          <ellipse cx={cx + px(7)} cy={cy - px(2)} rx={px(3.5)} ry={px(4.5)} fill="white" />
          {/* Animated flowing blue tears */}
          <path d={`M${cx - px(7)} ${cy + px(3)} Q${cx - px(9)} ${cy + px(9)} ${cx - px(7)} ${cy + px(13)}`} stroke="#00aaff" fill="none" strokeWidth={px(2)} strokeLinecap="round">
            <animate attributeName="stroke-dashoffset" values="10;0" dur="0.8s" repeatCount="indefinite" />
          </path>
          <path d={`M${cx + px(7)} ${cy + px(3)} Q${cx + px(9)} ${cy + px(9)} ${cx + px(7)} ${cy + px(13)}`} stroke="#00aaff" fill="none" strokeWidth={px(2)} strokeLinecap="round">
            <animate attributeName="stroke-dashoffset" values="10;0" dur="0.8s" repeatCount="indefinite" begin="0.4s" />
          </path>
          {/* Frown mouth */}
          <path d={`M${cx - px(5)} ${cy + px(10)} Q${cx} ${cy + px(5)} ${cx + px(5)} ${cy + px(10)}`} stroke="white" fill="none" strokeWidth={px(2)} strokeLinecap="round" />
        </>
      );

    case 'loving':
      return (
        <>
          {/* Heart eyes (Glowing Pink) */}
          <path d={`M${cx - px(7)} ${cy - px(3)} 
            C${cx - px(7)} ${cy - px(8)} ${cx - px(1)} ${cy - px(7)} ${cx - px(7)} ${cy + px(2)} 
            C${cx - px(13)} ${cy - px(7)} ${cx - px(7)} ${cy - px(8)} ${cx - px(7)} ${cy - px(3)}`} 
            fill="#ff3388" stroke="none">
            <animate attributeName="transform" type="scale" values="1;1.15;1" dur="0.8s" repeatCount="indefinite" transform-origin={`${cx - px(7)} ${cy - px(3)}`} />
          </path>
          <path d={`M${cx + px(7)} ${cy - px(3)} 
            C${cx + px(7)} ${cy - px(8)} ${cx + px(13)} ${cy - px(7)} ${cx + px(7)} ${cy + px(2)} 
            C${cx + px(1)} ${cy - px(7)} ${cx + px(7)} ${cy - px(8)} ${cx + px(7)} ${cy - px(3)}`} 
            fill="#ff3388" stroke="none">
            <animate attributeName="transform" type="scale" values="1;1.15;1" dur="0.8s" repeatCount="indefinite" transform-origin={`${cx + px(7)} ${cy - px(3)}`} />
          </path>
          {/* Big happy smile */}
          <path d={`M${cx - px(6)} ${cy + px(6)} Q${cx} ${cy + px(13)} ${cx + px(6)} ${cy + px(6)}`} stroke="#ff3388" fill="none" strokeWidth={px(2)} strokeLinecap="round" />
        </>
      );

    case 'shy':
      return (
        <>
          {/* Shy eyes looking down-right */}
          <ellipse cx={cx - px(7)} cy={cy - px(1)} rx={px(3)} ry={px(4)} fill="white" />
          <circle cx={cx - px(6)} cy={cy} r={px(1.5)} fill="#ff66aa" />
          <ellipse cx={cx + px(6)} cy={cy - px(1)} rx={px(3)} ry={px(4)} fill="white" />
          <circle cx={cx + px(7)} cy={cy} r={px(1.5)} fill="#ff66aa" />
          {/* Bright pink blush patches */}
          <ellipse cx={cx - px(11)} cy={cy + px(4)} rx={px(3.5)} ry={px(2)} fill="rgba(255,50,150,0.6)" />
          <ellipse cx={cx + px(11)} cy={cy + px(4)} rx={px(3.5)} ry={px(2)} fill="rgba(255,50,150,0.6)" />
          {/* Cute wavy mouth */}
          <path d={`M${cx - px(4)} ${cy + px(8)} Q${cx} ${cy + px(11)} ${cx + px(4)} ${cy + px(8)}`} stroke="#ff66aa" fill="none" strokeWidth={px(1.8)} strokeLinecap="round" />
        </>
      );

    case 'confused':
      return (
        <>
          {/* Confused asymmetric eyes — Left HUGE, Right TINY */}
          <circle cx={cx - px(7)} cy={cy - px(3)} r={px(5)} fill="white" />
          <circle cx={cx - px(7)} cy={cy - px(3)} r={px(2)} fill="black" />
          <circle cx={cx + px(7)} cy={cy - px(2)} r={px(2.5)} fill="white" />
          {/* Confused tilted eyebrow */}
          <line x1={cx - px(11)} y1={cy - px(10)} x2={cx - px(3)} y2={cy - px(9)} stroke="#ffaa00" strokeWidth={px(2)} strokeLinecap="round" />
          <line x1={cx + px(4)} y1={cy - px(6)} x2={cx + px(11)} y2={cy - px(10)} stroke="#ffaa00" strokeWidth={px(2)} strokeLinecap="round" />
          {/* Squiggly mouth ~ */}
          <path d={`M${cx - px(6)} ${cy + px(8)} Q${cx - px(3)} ${cy + px(5)} ${cx} ${cy + px(8)} Q${cx + px(3)} ${cy + px(11)} ${cx + px(6)} ${cy + px(8)}`} stroke="#ffaa00" fill="none" strokeWidth={px(2)} strokeLinecap="round" />
        </>
      );

    case 'shocked':
      return (
        <>
          {/* Shocked huge open eyes with tiny dots */}
          <circle cx={cx - px(7)} cy={cy - px(3)} r={px(6)} fill="white" />
          <circle cx={cx + px(7)} cy={cy - px(3)} r={px(6)} fill="white" />
          <circle cx={cx - px(7)} cy={cy - px(3)} r={px(1.8)} fill="#ff0000" />
          <circle cx={cx + px(7)} cy={cy - px(3)} r={px(1.8)} fill="#ff0000" />
          {/* Huge O mouth */}
          <ellipse cx={cx} cy={cy + px(8)} rx={px(4)} ry={px(5)} fill="black" stroke="white" strokeWidth={px(2)} />
        </>
      );

    case 'thinking':
      return (
        <>
          {/* Eyes looking up-right */}
          <ellipse cx={cx - px(6)} cy={cy - px(4)} rx={px(3.5)} ry={px(4.5)} fill="white" />
          <circle cx={cx - px(4.5)} cy={cy - px(5.5)} r={px(1.8)} fill="#00aaff" />
          <ellipse cx={cx + px(7)} cy={cy - px(4)} rx={px(3.5)} ry={px(4.5)} fill="white" />
          <circle cx={cx + px(8.5)} cy={cy - px(5.5)} r={px(1.8)} fill="#00aaff" />
          {/* Slanted thinking mouth */}
          <line x1={cx - px(3)} y1={cy + px(7)} x2={cx + px(5)} y2={cy + px(9)} stroke="#00aaff" strokeWidth={px(2)} strokeLinecap="round" />
          {/* Floating thought bubbles */}
          <circle cx={cx + px(12)} cy={cy - px(9)} r={px(1.8)} fill="#00aaff">
            <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" repeatCount="indefinite" />
          </circle>
          <circle cx={cx + px(15)} cy={cy - px(13)} r={px(1.2)} fill="#00aaff">
            <animate attributeName="opacity" values="0.1;0.9;0.1" dur="1.2s" repeatCount="indefinite" begin="0.3s" />
          </circle>
        </>
      );

    case 'winking':
      return (
        <>
          {/* Left open eye, Right wink arc */}
          <ellipse cx={cx - px(7)} cy={cy - px(3)} rx={px(4)} ry={px(5)} fill="white" />
          <circle cx={cx - px(7)} cy={cy - px(3)} r={px(1.8)} fill="black" />
          <path d={`M${cx + px(3)} ${cy - px(3)} Q${cx + px(7)} ${cy - px(9)} ${cx + px(11)} ${cy - px(3)}`} stroke="#39ff14" fill="none" strokeWidth={px(2.5)} strokeLinecap="round" />
          {/* Cocky smirk */}
          <path d={`M${cx - px(4)} ${cy + px(7)} Q${cx + px(2)} ${cy + px(12)} ${cx + px(7)} ${cy + px(6)}`} stroke="white" fill="none" strokeWidth={px(2)} strokeLinecap="round" />
        </>
      );

    case 'cool':
      return (
        <>
          {/* Sleek Cool Sunglasses */}
          <polygon points={`${cx - px(12)},${cy - px(6)} ${cx - px(2)},${cy - px(6)} ${cx - px(3)},${cy + px(1)} ${cx - px(11)},${cy + px(1)}`} fill="#39ff14" stroke="white" strokeWidth={px(1)} />
          <polygon points={`${cx + px(2)},${cy - px(6)} ${cx + px(12)},${cy - px(6)} ${cx + px(11)},${cy + px(1)} ${cx + px(3)},${cy + px(1)}`} fill="#39ff14" stroke="white" strokeWidth={px(1)} />
          <line x1={cx - px(2)} y1={cy - px(4)} x2={cx + px(2)} y2={cy - px(4)} stroke="white" strokeWidth={px(2)} />
          {/* Cool smirk */}
          <path d={`M${cx - px(5)} ${cy + px(8)} Q${cx} ${cy + px(11)} ${cx + px(6)} ${cy + px(6)}`} stroke="#39ff14" fill="none" strokeWidth={px(2)} strokeLinecap="round" />
        </>
      );

    case 'relaxed':
      return (
        <>
          {/* Relaxed closed eyes ~ ~ */}
          <path d={`M${cx - px(10)} ${cy - px(2)} Q${cx - px(7)} ${cy - px(6)} ${cx - px(4)} ${cy - px(2)}`} stroke="#a855f7" fill="none" strokeWidth={px(2.5)} strokeLinecap="round" />
          <path d={`M${cx + px(4)} ${cy - px(2)} Q${cx + px(7)} ${cy - px(6)} ${cx + px(10)} ${cy - px(2)}`} stroke="#a855f7" fill="none" strokeWidth={px(2.5)} strokeLinecap="round" />
          {/* Soft gentle smile */}
          <path d={`M${cx - px(5)} ${cy + px(7)} Q${cx} ${cy + px(11)} ${cx + px(5)} ${cy + px(7)}`} stroke="#a855f7" fill="none" strokeWidth={px(2)} strokeLinecap="round" />
        </>
      );

    case 'yummy':
      return (
        <>
          {/* Closed happy eyes ^ ^ */}
          <path d={`M${cx - px(10)} ${cy - px(2)} Q${cx - px(7)} ${cy - px(7)} ${cx - px(4)} ${cy - px(2)}`} stroke="white" fill="none" strokeWidth={px(2.5)} strokeLinecap="round" />
          <path d={`M${cx + px(4)} ${cy - px(2)} Q${cx + px(7)} ${cy - px(7)} ${cx + px(10)} ${cy - px(2)}`} stroke="white" fill="none" strokeWidth={px(2.5)} strokeLinecap="round" />
          {/* Smile with cute pink tongue sticking out */}
          <path d={`M${cx - px(5)} ${cy + px(6)} Q${cx} ${cy + px(12)} ${cx + px(5)} ${cy + px(6)}`} stroke="white" fill="none" strokeWidth={px(2)} strokeLinecap="round" />
          <path d={`M${cx - px(2)} ${cy + px(9)} Q${cx + px(2)} ${cy + px(14)} ${cx + px(4)} ${cy + px(8)} Z`} fill="#ff3366" stroke="none" />
        </>
      );

    case 'kissing':
      return (
        <>
          {/* Closed eyes ^ ^ */}
          <path d={`M${cx - px(10)} ${cy - px(3)} Q${cx - px(7)} ${cy - px(7)} ${cx - px(4)} ${cy - px(3)}`} stroke="#ff66aa" fill="none" strokeWidth={px(2.5)} strokeLinecap="round" />
          <path d={`M${cx + px(4)} ${cy - px(3)} Q${cx + px(7)} ${cy - px(7)} ${cx + px(10)} ${cy - px(3)}`} stroke="#ff66aa" fill="none" strokeWidth={px(2.5)} strokeLinecap="round" />
          {/* Kissing lips 3 */}
          <path d={`M${cx - px(3)} ${cy + px(6)} Q${cx} ${cy + px(8)} ${cx - px(3)} ${cy + px(10)}`} stroke="#ff66aa" fill="none" strokeWidth={px(2)} strokeLinecap="round" />
          <path d={`M${cx - px(3)} ${cy + px(6)} Q${cx + px(3)} ${cy + px(8)} ${cx - px(3)} ${cy + px(10)}`} stroke="#ff66aa" fill="none" strokeWidth={px(2)} strokeLinecap="round" />
          {/* Small floating heart next to mouth */}
          <path d={`M${cx + px(6)} ${cy + px(6)} C${cx + px(6)} ${cy + px(4)} ${cx + px(8)} ${cy + px(4)} ${cx + px(6)} ${cy + px(9)} C${cx + px(4)} ${cy + px(4)} ${cx + px(6)} ${cy + px(4)} ${cx + px(6)} ${cy + px(6)}`} fill="#ff3366" />
        </>
      );

    case 'confident':
      return (
        <>
          {/* Half-closed cool eyes */}
          <ellipse cx={cx - px(7)} cy={cy - px(2)} rx={px(4)} ry={px(2.5)} fill="#39ff14" />
          <ellipse cx={cx + px(7)} cy={cy - px(2)} rx={px(4)} ry={px(2.5)} fill="#39ff14" />
          {/* Raised eyebrow on right */}
          <line x1={cx - px(11)} y1={cy - px(7)} x2={cx - px(3)} y2={cy - px(7)} stroke="white" strokeWidth={px(2)} strokeLinecap="round" />
          <line x1={cx + px(3)} y1={cy - px(9)} x2={cx + px(11)} y2={cy - px(11)} stroke="white" strokeWidth={px(2)} strokeLinecap="round" />
          {/* Asymmetric confident smirk */}
          <path d={`M${cx - px(4)} ${cy + px(8)} L${cx + px(6)} ${cy + px(5)}`} stroke="#39ff14" strokeWidth={px(2)} strokeLinecap="round" />
        </>
      );

    case 'sleepy':
      return (
        <>
          {/* Sleepy flat line eyes */}
          <line x1={cx - px(10)} y1={cy - px(2)} x2={cx - px(4)} y2={cy - px(2)} stroke="#00f0ff" strokeWidth={px(2.5)} strokeLinecap="round" />
          <line x1={cx + px(4)} y1={cy - px(2)} x2={cx + px(10)} y2={cy - px(2)} stroke="#00f0ff" strokeWidth={px(2.5)} strokeLinecap="round" />
          {/* Small yawning mouth */}
          <ellipse cx={cx} cy={cy + px(8)} rx={px(2.5)} ry={px(3.5)} fill="none" stroke="#00f0ff" strokeWidth={px(1.5)} />
          {/* Cyan Zzz floating */}
          <text x={cx + px(10)} y={cy - px(7)} fill="#00f0ff" fontSize={px(7)} fontWeight="bold" fontFamily="monospace">
            Z
            <animate attributeName="opacity" values="0.2;1;0.2" dur="1.5s" repeatCount="indefinite" />
          </text>
        </>
      );

    case 'sweet':
      return (
        <>
          {/* Large starry sparkling anime eyes */}
          <ellipse cx={cx - px(7)} cy={cy - px(2)} rx={px(4.5)} ry={px(5.5)} fill="#ffaafe" />
          <ellipse cx={cx + px(7)} cy={cy - px(2)} rx={px(4.5)} ry={px(5.5)} fill="#ffaafe" />
          {/* Bright white pupils */}
          <circle cx={cx - px(8.5)} cy={cy - px(4)} r={px(1.8)} fill="white" />
          <circle cx={cx + px(5.5)} cy={cy - px(4)} r={px(1.8)} fill="white" />
          {/* Cute tiny mouth */}
          <path d={`M${cx - px(3)} ${cy + px(7)} Q${cx} ${cy + px(11)} ${cx + px(3)} ${cy + px(7)}`} stroke="#ffaafe" fill="none" strokeWidth={px(1.8)} strokeLinecap="round" />
        </>
      );

    case 'perplexed':
      return (
        <>
          {/* Rotating spiral eyes */}
          <circle cx={cx - px(7)} cy={cy - px(2)} r={px(4.5)} fill="none" stroke="#a855f7" strokeWidth={px(2)} strokeDasharray={`${px(4)} ${px(3)}`}>
            <animateTransform attributeName="transform" type="rotate" from={`0 ${cx - px(7)} ${cy - px(2)}`} to={`360 ${cx - px(7)} ${cy - px(2)}`} dur="1.5s" repeatCount="indefinite" />
          </circle>
          <circle cx={cx + px(7)} cy={cy - px(2)} r={px(4.5)} fill="none" stroke="#a855f7" strokeWidth={px(2)} strokeDasharray={`${px(4)} ${px(3)}`}>
            <animateTransform attributeName="transform" type="rotate" from={`360 ${cx + px(7)} ${cy - px(2)}`} to={`0 ${cx + px(7)} ${cy - px(2)}`} dur="1.5s" repeatCount="indefinite" />
          </circle>
          {/* Squiggly mouth */}
          <path d={`M${cx - px(5)} ${cy + px(8)} Q${cx - px(2)} ${cy + px(5)} ${cx} ${cy + px(8)} Q${cx + px(2)} ${cy + px(11)} ${cx + px(5)} ${cy + px(8)}`} stroke="#a855f7" fill="none" strokeWidth={px(2)} strokeLinecap="round" />
        </>
      );

    case 'processing':
      return (
        <>
          {/* Rotating cyan dash-ring eyes */}
          <circle cx={cx - px(7)} cy={cy - px(2)} r={px(4.5)} fill="none" stroke="#00f0ff" strokeWidth={px(2)} strokeDasharray={`${px(5)} ${px(4)}`}>
            <animateTransform attributeName="transform" type="rotate" from={`0 ${cx - px(7)} ${cy - px(2)}`} to={`360 ${cx - px(7)} ${cy - px(2)}`} dur="1s" repeatCount="indefinite" />
          </circle>
          <circle cx={cx + px(7)} cy={cy - px(2)} r={px(4.5)} fill="none" stroke="#00f0ff" strokeWidth={px(2)} strokeDasharray={`${px(5)} ${px(4)}`}>
            <animateTransform attributeName="transform" type="rotate" from={`0 ${cx + px(7)} ${cy - px(2)}`} to={`360 ${cx + px(7)} ${cy - px(2)}`} dur="1s" repeatCount="indefinite" />
          </circle>
          {/* Straight line mouth */}
          <line x1={cx - px(4)} y1={cy + px(8)} x2={cx + px(4)} y2={cy + px(8)} stroke="#00f0ff" strokeWidth={px(2)} strokeLinecap="round" />
        </>
      );

    case 'error':
      return (
        <>
          {/* Sharp glowing Red X X eyes */}
          <line x1={cx - px(11)} y1={cy - px(6)} x2={cx - px(3)} y2={cy + px(1)} stroke="#ff0044" strokeWidth={px(2.5)} strokeLinecap="round" />
          <line x1={cx - px(3)} y1={cy - px(6)} x2={cx - px(11)} y2={cy + px(1)} stroke="#ff0044" strokeWidth={px(2.5)} strokeLinecap="round" />
          <line x1={cx + px(3)} y1={cy - px(6)} x2={cx + px(11)} y2={cy + px(1)} stroke="#ff0044" strokeWidth={px(2.5)} strokeLinecap="round" />
          <line x1={cx + px(11)} y1={cy - px(6)} x2={cx + px(3)} y2={cy + px(1)} stroke="#ff0044" strokeWidth={px(2.5)} strokeLinecap="round" />
          {/* Frown mouth */}
          <path d={`M${cx - px(6)} ${cy + px(10)} Q${cx} ${cy + px(4)} ${cx + px(6)} ${cy + px(10)}`} stroke="#ff0044" fill="none" strokeWidth={px(2.5)} strokeLinecap="round" />
        </>
      );

    default:
      return renderEyesAndMouth('neutral', s);
  }
}

/**
 * EmotionAvatar — Hiển thị khuôn mặt biểu cảm AI bằng SVG animation
 * Nền đen, mắt trắng, style giống OLED ESP32
 */
export function EmotionAvatar({ emotion, size = 40 }: EmotionAvatarProps) {
  const label = EMOTION_LABELS[emotion] || emotion;
  const svgContent = useMemo(() => renderEyesAndMouth(emotion, size), [emotion, size]);

  return (
    <div
      title={`Biểu cảm: ${label}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        background: '#0a0a0a',
        border: '1.5px solid rgba(255,255,255,0.15)',
        overflow: 'hidden',
        flexShrink: 0,
        transition: 'all 0.3s ease',
        boxShadow: '0 0 8px rgba(0,170,255,0.15)',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: 'block', transition: 'all 0.3s ease' }}
      >
        {svgContent}
      </svg>
    </div>
  );
}

export { EMOTION_LABELS };

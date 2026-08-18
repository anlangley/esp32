import { useState, useRef, useCallback } from 'react';
import type { CameraConfig } from '../types/control';

/**
 * Hook quản lý luồng âm thanh từ IP Camera.
 * Tách từ App.tsx dòng 62-63, 410-426.
 */
export function useAudioStream(cameraConfig: CameraConfig) {
  const [audioState, setAudioState] = useState<'off' | 'connecting' | 'playing' | 'error'>('off');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Audio Stream Toggle
  const toggleAudio = useCallback(() => {
    if (!audioRef.current) return;

    if (audioState === 'playing' || audioState === 'connecting') {
      audioRef.current.pause();
      audioRef.current.src = '';
      setAudioState('off');
    } else {
      setAudioState('connecting');
      const preferredPath = cameraConfig.audioPath || '/audio.aac';
      const liveAudioUrl = `http://${cameraConfig.ip}:${cameraConfig.port}${preferredPath}?live=${Date.now()}`;

      const audio = audioRef.current;
      audio.src = liveAudioUrl;
      audio.load();

      let isConnected = false;
      const connectionTimer = setTimeout(() => {
        if (!isConnected && audioRef.current) {
          console.warn('[AudioStream] QUÁ THỜI GIAN KẾT NỐI (Timeout 5s). IP Camera chưa phát âm thanh.');
          audioRef.current.pause();
          audioRef.current.src = '';
          setAudioState('error');
          alert(`⚠️ KHÔNG THỂ KẾT NỐI ÂM THANH IP CAMERA!\n\nĐịa chỉ: http://${cameraConfig.ip}:${cameraConfig.port}${preferredPath}\nTrạng thái: Không nhận được phản hồi luồng âm thanh.\nHãy kiểm tra xem IP Camera đã được bật Mic và đúng IP/Port chưa!`);
        }
      }, 5000);

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            isConnected = true;
            clearTimeout(connectionTimer);
            setAudioState('playing');
          })
          .catch((err) => {
            console.warn('[AudioStream] AAC play failed, trying fallback /audio.wav:', err);
            const fallbackPath = preferredPath.includes('aac') ? '/audio.wav' : '/audio.aac';
            const fallbackUrl = `http://${cameraConfig.ip}:${cameraConfig.port}${fallbackPath}?live=${Date.now()}`;
            audio.src = fallbackUrl;
            audio.load();
            audio.play()
              .then(() => {
                isConnected = true;
                clearTimeout(connectionTimer);
                setAudioState('playing');
              })
              .catch((err2) => {
                isConnected = true;
                clearTimeout(connectionTimer);
                console.error('[AudioStream] Tất cả định dạng âm thanh đều thất bại:', err2);
                setAudioState('error');
                alert(`⚠️ KHÔNG THỂ KẾT NỐI ÂM THANH IP CAMERA!\n\nĐịa chỉ: http://${cameraConfig.ip}:${cameraConfig.port}${preferredPath}\nLỗi: Camera từ chối kết nối hoặc sai đường dẫn âm thanh.\nHãy kiểm tra lại Camera IP trong menu Cài đặt!`);
              });
          });
      }
    }
  }, [audioState, cameraConfig]);

  return { audioState, audioRef, toggleAudio };
}

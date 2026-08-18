import { useState, useCallback } from 'react';
import type { CameraConfig } from '../types/control';

interface UseFpvViewStateOptions {
  onCameraConfigSave: (config: CameraConfig) => void;
}

export function useFpvViewState({ onCameraConfigSave }: UseFpvViewStateOptions) {
  const [camError, setCamError] = useState(false);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [controlStyle, setControlStyle] = useState<'split' | 'joystick'>('split');

  const handleSettingsSave = useCallback((newConfig: CameraConfig) => {
    onCameraConfigSave(newConfig);
    setShowSettingsModal(false);
  }, [onCameraConfigSave]);

  const toggleRotation = useCallback(() => {
    setRotation(prev => ((prev + 90) % 360) as 0 | 90 | 180 | 270);
  }, []);

  const toggleControlStyle = useCallback(() => {
    setControlStyle(prev => (prev === 'split' ? 'joystick' : 'split'));
  }, []);

  return {
    camError,
    setCamError,
    rotation,
    toggleRotation,
    showSettingsModal,
    setShowSettingsModal,
    controlStyle,
    toggleControlStyle,
    handleSettingsSave,
  };
}

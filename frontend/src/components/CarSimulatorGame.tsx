import { useEffect, useRef, useState, useCallback } from 'react';
import { RotateCcw, ShieldAlert, Navigation, Zap } from 'lucide-react';
import type { TelemetryData } from '../types/control';

interface CarSimulatorGameProps {
  driveCommand: { x: number; y: number; speedLimit: number };
  onDriveCommand?: (cmd: { x: number; y: number }) => void;
  onTelemetryUpdate?: (telemetryPartial: Partial<TelemetryData>) => void;
  isCollisionWarning?: boolean;
  isMouseSteerActive?: boolean;
}

interface Obstacle {
  x: number;
  y: number;
  radius: number;
  type: 'cone' | 'barrier' | 'pillar';
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export const CarSimulatorGame = ({
  driveCommand,
  onDriveCommand,
  onTelemetryUpdate,
  isMouseSteerActive = false,
}: CarSimulatorGameProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);

  // Simulated Car State
  const carState = useRef({
    x: 400,
    y: 300,
    angle: -Math.PI / 2, // Heading facing UP initially
    speed: 0,
    maxSpeed: 7.5,
    accel: 0.15,
    friction: 0.96,
    steerAngle: 0,
    maxSteer: 0.05,
    distanceToObstacle: 150,
    batteryPercentage: 88,
    temperature: 34.2,
    driftScore: 0,
  });

  const [hudInfo, setHudInfo] = useState({
    speedKmh: 0,
    distanceCm: 150,
    steerPercent: 0,
    gear: 'N',
    collisionAlert: false,
  });

  const particlesRef = useRef<Particle[]>([]);
  const lastTimeRef = useRef<number>(performance.now());
  const mousePosRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });

  // Map & Obstacles Setup
  const obstaclesRef = useRef<Obstacle[]>([
    { x: 250, y: 180, radius: 24, type: 'barrier', color: '#ff003c' },
    { x: 550, y: 180, radius: 24, type: 'barrier', color: '#ff003c' },
    { x: 400, y: 120, radius: 18, type: 'pillar', color: '#00f0ff' },
    { x: 200, y: 400, radius: 20, type: 'cone', color: '#ffbd03' },
    { x: 600, y: 400, radius: 20, type: 'cone', color: '#ffbd03' },
    { x: 400, y: 480, radius: 30, type: 'barrier', color: '#ff003c' },
    { x: 120, y: 280, radius: 22, type: 'pillar', color: '#00f0ff' },
    { x: 680, y: 280, radius: 22, type: 'pillar', color: '#00f0ff' },
  ]);

  // Reset Car Position
  const resetCar = useCallback(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    carState.current.x = canvas.width / 2;
    carState.current.y = canvas.height / 2;
    carState.current.angle = -Math.PI / 2;
    carState.current.speed = 0;
    carState.current.steerAngle = 0;
    particlesRef.current = [];
  }, []);

  // Raycasting Ultrasonic Distance Sensor Calculation
  const calculateRaycastDistance = (carX: number, carY: number, carAngle: number, obstacles: Obstacle[], width: number, height: number) => {
    // Front bumper offset
    const frontX = carX + Math.cos(carAngle) * 22;
    const frontY = carY + Math.sin(carAngle) * 22;
    const maxRayDistance = 350; // max sensor range in pixels
    let minDistance = maxRayDistance;

    // Check bounds (walls)
    const bounds = [
      { x1: 20, y1: 20, x2: width - 20, y2: 20 },
      { x1: width - 20, y1: 20, x2: width - 20, y2: height - 20 },
      { x1: width - 20, y1: height - 20, x2: 20, y2: height - 20 },
      { x1: 20, y1: height - 20, x2: 20, y2: 20 },
    ];

    // Check obstacle circles
    obstacles.forEach((obs) => {
      const dx = obs.x - frontX;
      const dy = obs.y - frontY;
      
      // Vector along ray angle
      const rayDx = Math.cos(carAngle);
      const rayDy = Math.sin(carAngle);
      
      // Project obstacle onto ray
      const dot = dx * rayDx + dy * rayDy;
      if (dot > 0) {
        // Closest point on ray to obstacle center
        const closestX = frontX + rayDx * dot;
        const closestY = frontY + rayDy * dot;
        const perpDist = Math.sqrt((obs.x - closestX) ** 2 + (obs.y - closestY) ** 2);
        
        if (perpDist < obs.radius) {
          const hitDist = dot - Math.sqrt(obs.radius ** 2 - perpDist ** 2);
          if (hitDist > 0 && hitDist < minDistance) {
            minDistance = hitDist;
          }
        }
      }
    });

    // Check boundaries raycast
    bounds.forEach((b) => {
      const rayDx = Math.cos(carAngle);
      const rayDy = Math.sin(carAngle);
      
      // Line intersection
      const denominator = (b.x2 - b.x1) * rayDy - (b.y2 - b.y1) * rayDx;
      if (Math.abs(denominator) > 0.0001) {
        const t = ((b.x1 - frontX) * rayDy - (b.y1 - frontY) * rayDx) / denominator;
        const u = ((b.x1 - frontX) * (b.y2 - b.y1) - (b.y1 - frontY) * (b.x2 - b.x1)) / denominator;

        if (t >= 0 && t <= 1 && u >= 0) {
          if (u < minDistance) minDistance = u;
        }
      }
    });

    // Convert pixel distance to simulated cm (e.g. 1px ~ 0.5cm)
    const cmDistance = Math.max(5, Math.round(minDistance * 0.45));
    return { minDistance, cmDistance };
  };

  // Canvas Mouse Steering Handler
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMouseSteerActive) {
      mousePosRef.current.active = false;
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    
    // Calculate normalized X offset (-1.0 to 1.0) relative to canvas center
    const centerX = rect.left + width / 2;
    let relX = (e.clientX - centerX) / (width / 2);
    relX = Math.max(-1, Math.min(1, relX));
    if (Math.abs(relX) < 0.05) relX = 0;

    mousePosRef.current = { x: relX, y: 0, active: true };
    if (onDriveCommand) {
      onDriveCommand({ x: relX, y: driveCommand.y });
    }
  };

  const handleCanvasMouseLeave = () => {
    mousePosRef.current.active = false;
    if (isMouseSteerActive && onDriveCommand) {
      onDriveCommand({ x: 0, y: 0 });
    }
  };

  // Keep a realtime ref of driveCommand to prevent stale closures in requestAnimationFrame loop
  const driveCommandRef = useRef(driveCommand);
  useEffect(() => {
    driveCommandRef.current = driveCommand;
  }, [driveCommand]);

  // Main Physics & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI crisp rendering
    const width = 800;
    const height = 450;
    canvas.width = width;
    canvas.height = height;

    const car = carState.current;

    const loop = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      // 1. Process Inputs (from driveCommand props or mouse steering)
      const currentCmd = driveCommandRef.current || { x: 0, y: 0, speedLimit: 80 };
      let inputX = currentCmd.x;
      let inputY = currentCmd.y;

      if (isMouseSteerActive && mousePosRef.current.active && Math.abs(mousePosRef.current.x) > 0.05) {
        inputX = mousePosRef.current.x;
      }

      // Apply speed limit scaling factor (10% to 100%)
      const speedFactor = (currentCmd.speedLimit || 80) / 100;
      const targetMaxSpeed = car.maxSpeed * speedFactor;

      // Accelerate / Reverse logic (Phản hồi tức thì khi AI Agent hoặc phím bấm ra lệnh)
      if (inputY > 0.05) {
        car.speed = Math.min(targetMaxSpeed, Math.max(car.speed + 0.4 * inputY, targetMaxSpeed * 0.5));
      } else if (inputY < -0.05) {
        car.speed = Math.max(-targetMaxSpeed * 0.6, Math.min(car.speed + 0.4 * inputY, -targetMaxSpeed * 0.3));
      } else {
        car.speed *= 0.85; // Phanh tự nhiên khi nhả phím/hết duration
        if (Math.abs(car.speed) < 0.05) car.speed = 0;
      }

      // Steering logic (Rotation rate proportional to speed & steer input)
      if (Math.abs(inputX) > 0.05) {
        const steerDir = inputX;
        // Turn speed scales naturally with vehicle movement or tank turn when stationary
        const turnFactor = car.speed !== 0 ? (car.speed > 0 ? 1 : -1) : 0.8;
        car.angle += steerDir * car.maxSteer * turnFactor;
        car.steerAngle = steerDir * 0.35; // Front wheels visual turn angle
      } else {
        car.steerAngle *= 0.8;
      }

      // Update position
      car.x += Math.cos(car.angle) * car.speed;
      car.y += Math.sin(car.angle) * car.speed;

      // Keep within canvas bounds with bouncing physics
      const margin = 24;
      if (car.x < margin) { car.x = margin; car.speed *= -0.4; }
      if (car.x > width - margin) { car.x = width - margin; car.speed *= -0.4; }
      if (car.y < margin) { car.y = margin; car.speed *= -0.4; }
      if (car.y > height - margin) { car.y = height - margin; car.speed *= -0.4; }

      // Check collision with obstacles
      obstaclesRef.current.forEach((obs) => {
        const dx = car.x - obs.x;
        const dy = car.y - obs.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = obs.radius + 18;

        if (dist < minDist) {
          // Push car out & bounce
          const overlap = minDist - dist;
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);
          car.x += nx * overlap;
          car.y += ny * overlap;
          car.speed *= -0.5; // Bounce back

          // Spawn collision spark particles
          for (let i = 0; i < 6; i++) {
            particlesRef.current.push({
              x: car.x - nx * 15,
              y: car.y - ny * 15,
              vx: (Math.random() - 0.5) * 4,
              vy: (Math.random() - 0.5) * 4,
              life: 1,
              maxLife: 0.3 + Math.random() * 0.2,
              size: 2 + Math.random() * 3,
              color: '#ff003c',
            });
          }
        }
      });

      // Spawn Exhaust / Tire Particles when accelerating or turning
      if (Math.abs(car.speed) > 1) {
        const rearX = car.x - Math.cos(car.angle) * 18;
        const rearY = car.y - Math.sin(car.angle) * 18;
        if (Math.random() < 0.6) {
          particlesRef.current.push({
            x: rearX + (Math.random() - 0.5) * 6,
            y: rearY + (Math.random() - 0.5) * 6,
            vx: -Math.cos(car.angle) * car.speed * 0.2 + (Math.random() - 0.5),
            vy: -Math.sin(car.angle) * car.speed * 0.2 + (Math.random() - 0.5),
            life: 1,
            maxLife: 0.4 + Math.random() * 0.3,
            size: Math.abs(car.speed) * 0.8 + 2,
            color: car.speed > 0 ? '#00f0ff' : '#ff3914',
          });
        }
      }

      // Update Raycast Sonar Sensor
      const raycast = calculateRaycastDistance(car.x, car.y, car.angle, obstaclesRef.current, width, height);
      car.distanceToObstacle = raycast.cmDistance;

      // Battery drain simulation (drains slowly when driving)
      if (Math.abs(car.speed) > 0.1) {
        car.batteryPercentage = Math.max(10, car.batteryPercentage - dt * 0.03);
        car.temperature = Math.min(65, car.temperature + dt * 0.08);
      } else {
        car.temperature = Math.max(30, car.temperature - dt * 0.05);
      }

      // Sync Telemetry back to App UI
      const currentSpeedKmh = Math.round(Math.abs(car.speed) * 12);
      const isCritical = raycast.cmDistance <= 30;

      setHudInfo({
        speedKmh: currentSpeedKmh,
        distanceCm: raycast.cmDistance,
        steerPercent: Math.round(inputX * 100),
        gear: inputY > 0.1 ? 'D' : inputY < -0.1 ? 'R' : 'N',
        collisionAlert: isCritical,
      });

      if (onTelemetryUpdate) {
        onTelemetryUpdate({
          speed: currentSpeedKmh,
          distance: raycast.cmDistance,
          batteryPercentage: Math.round(car.batteryPercentage),
          temperature: Math.round(car.temperature * 10) / 10,
          latency: 12 + Math.round(Math.random() * 4),
          cameraFps: 60,
          cameraRssi: -52,
        });
      }

      // --- RENDERING CANVAS ---
      // Clear background
      ctx.fillStyle = '#060810';
      ctx.fillRect(0, 0, width, height);

      // Draw Cyber Grid Lines
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }

      // Draw Outer Neon Boundary
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 10;
      ctx.strokeRect(15, 15, width - 30, height - 30);
      ctx.shadowBlur = 0;

      // Draw Obstacles
      obstaclesRef.current.forEach((obs) => {
        ctx.save();
        ctx.translate(obs.x, obs.y);

        // Glow effect
        ctx.shadowColor = obs.color;
        ctx.shadowBlur = 12;

        if (obs.type === 'barrier') {
          ctx.fillStyle = 'rgba(255, 0, 60, 0.2)';
          ctx.strokeStyle = obs.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Cross inner icon
          ctx.beginPath();
          ctx.moveTo(-8, -8); ctx.lineTo(8, 8);
          ctx.moveTo(8, -8); ctx.lineTo(-8, 8);
          ctx.stroke();
        } else if (obs.type === 'pillar') {
          ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
          ctx.strokeStyle = obs.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, 6, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Cone
          ctx.fillStyle = 'rgba(255, 189, 3, 0.25)';
          ctx.strokeStyle = obs.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      });

      // Draw Raycast Ultrasonic Sonar Scanner Cone
      ctx.save();
      const frontX = car.x + Math.cos(car.angle) * 22;
      const frontY = car.y + Math.sin(car.angle) * 22;
      const rayLength = raycast.minDistance;

      // Ultrasonic Sweep Arc
      const fovAngle = Math.PI / 4; // 45 degree FOV
      ctx.fillStyle = isCritical ? 'rgba(255, 0, 60, 0.25)' : 'rgba(0, 240, 255, 0.12)';
      ctx.strokeStyle = isCritical ? 'rgba(255, 0, 60, 0.8)' : 'rgba(0, 240, 255, 0.5)';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(frontX, frontY);
      ctx.arc(frontX, frontY, rayLength, car.angle - fovAngle / 2, car.angle + fovAngle / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Laser center line
      ctx.strokeStyle = isCritical ? '#ff003c' : '#39ff14';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(frontX, frontY);
      ctx.lineTo(frontX + Math.cos(car.angle) * rayLength, frontY + Math.sin(car.angle) * rayLength);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Render Particles (Smoke, Sparks)
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= dt / p.maxLife;

        if (p.life <= 0) {
          particlesRef.current.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw Cyber Car
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);

      // Headlight Beams casting onto road
      ctx.save();
      const lightGrad = ctx.createRadialGradient(20, 0, 5, 120, 0, 90);
      lightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
      lightGrad.addColorStop(0.3, 'rgba(0, 240, 255, 0.4)');
      lightGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');

      ctx.fillStyle = lightGrad;
      ctx.beginPath();
      ctx.moveTo(18, -6);
      ctx.lineTo(130, -50);
      ctx.lineTo(130, 50);
      ctx.lineTo(18, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Car Body Shadow & Glow
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 15;

      // Chassis Main Base
      ctx.fillStyle = '#0d111a';
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-22, -14, 44, 28, 6);
      ctx.fill();
      ctx.stroke();

      // Front Wheels (Steerable)
      ctx.save();
      ctx.fillStyle = '#1e2638';
      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 1.5;

      // Left Front Wheel
      ctx.save();
      ctx.translate(14, -15);
      ctx.rotate(car.steerAngle);
      ctx.fillRect(-6, -3, 12, 6);
      ctx.strokeRect(-6, -3, 12, 6);
      ctx.restore();

      // Right Front Wheel
      ctx.save();
      ctx.translate(14, 15);
      ctx.rotate(car.steerAngle);
      ctx.fillRect(-6, -3, 12, 6);
      ctx.strokeRect(-6, -3, 12, 6);
      ctx.restore();

      // Rear Wheels (Fixed)
      ctx.fillRect(-16, -15, 12, 6);
      ctx.strokeRect(-16, -15, 12, 6);
      ctx.fillRect(-16, 9, 12, 6);
      ctx.strokeRect(-16, 9, 12, 6);
      ctx.restore();

      // Cockpit Windshield (Cyber Cyan Glass)
      ctx.fillStyle = 'rgba(0, 240, 255, 0.6)';
      ctx.beginPath();
      ctx.roundRect(-4, -9, 16, 18, 3);
      ctx.fill();

      // Roof Cyber Decal / Arrow
      ctx.fillStyle = '#39ff14';
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-2, -5);
      ctx.lineTo(-2, 5);
      ctx.closePath();
      ctx.fill();

      // Tail Brake Lights (Glow Red when braking/reversing or stopping)
      const isBraking = inputY < 0 || (car.speed === 0 && Math.abs(inputY) === 0);
      ctx.fillStyle = isBraking ? '#ff003c' : '#880020';
      ctx.shadowColor = '#ff003c';
      ctx.shadowBlur = isBraking ? 15 : 4;
      ctx.fillRect(-23, -12, 3, 6);
      ctx.fillRect(-23, 6, 3, 6);

      ctx.restore(); // End Car draw

      // Request next frame
      animationFrameId.current = requestAnimationFrame(loop);
    };

    animationFrameId.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [driveCommand, onDriveCommand, onTelemetryUpdate]);

  return (
    <div className="relative w-full h-full min-h-[360px] flex flex-col items-center justify-center overflow-hidden">
      {/* Top Right Floating Reset Button (No top-0 overlap) */}
      <div className="absolute top-12 right-4 z-20 pointer-events-auto">
        <button
          tabIndex={-1}
          onClick={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).blur();
            resetCar();
          }}
          title="Đặt lại vị trí xe về trung tâm bản đồ"
          className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-cyber-neonBlue/50 text-cyber-neonBlue hover:bg-cyber-neonBlue/20 text-[10px] font-mono font-bold transition-all shadow-[0_0_12px_rgba(0,240,255,0.2)] active:scale-95"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>ĐẶT LẠI XE</span>
        </button>
      </div>

      {/* Collision Alert Banner Overlay */}
      {hudInfo.collisionAlert && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2 bg-cyber-neonRed/90 px-4 py-1 rounded-full text-white font-bold text-xs uppercase tracking-widest shadow-[0_0_20px_#ff003c] animate-bounce">
          <ShieldAlert className="w-4 h-4" />
          <span>VẬT CẢN GẦN - DỪNG GẤP ({hudInfo.distanceCm}cm)!</span>
        </div>
      )}

      {/* Main HTML5 Physics Canvas */}
      <canvas
        ref={canvasRef}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
        className="w-full h-full object-cover cursor-crosshair"
      />

      {/* Bottom Floating Telemetry HUD */}
      <div className="absolute bottom-3 left-4 right-4 z-20 flex justify-between items-end pointer-events-none">
        {/* Speedometer & Gear */}
        <div className="glass-panel px-3 py-1.5 rounded-xl border border-cyber-neonBlue/30 flex items-center space-x-3 bg-black/80 backdrop-blur-md">
          <div>
            <div className="text-[9px] uppercase font-mono text-gray-400">Tốc độ</div>
            <div className="text-xl font-bold font-mono text-cyber-neonGreen flex items-baseline">
              <span>{hudInfo.speedKmh}</span>
              <span className="text-[9px] text-gray-400 ml-1">km/h</span>
            </div>
          </div>
          <div className="h-6 w-[1px] bg-white/10"></div>
          <div>
            <div className="text-[9px] uppercase font-mono text-gray-400">Số</div>
            <div className="text-lg font-bold font-mono text-cyber-neonYellow">
              {hudInfo.gear}
            </div>
          </div>
        </div>

        {/* Ultrasonic Sensor Live Distance Radar Badge */}
        <div className={`glass-panel px-3 py-1.5 rounded-xl border flex items-center space-x-2 bg-black/80 backdrop-blur-md transition-colors ${
          hudInfo.collisionAlert ? 'border-cyber-neonRed text-cyber-neonRed shadow-[0_0_15px_#ff003c]' : 'border-cyber-neonBlue/30 text-cyber-neonBlue'
        }`}>
          <Navigation className={`w-4 h-4 ${hudInfo.collisionAlert ? 'animate-spin text-cyber-neonRed' : 'text-cyber-neonBlue'}`} />
          <div>
            <div className="text-[9px] uppercase font-mono text-gray-400">Radar Siêu âm</div>
            <div className="text-sm font-bold font-mono text-white flex items-baseline">
              <span>{hudInfo.distanceCm}</span>
              <span className="text-[9px] text-gray-400 ml-0.5">cm</span>
            </div>
          </div>
        </div>

        {/* Steering Indicator */}
        <div className="glass-panel px-3 py-1.5 rounded-xl border border-cyber-neonBlue/30 flex items-center space-x-2 bg-black/80 backdrop-blur-md">
          <Zap className="w-3.5 h-3.5 text-cyber-neonYellow" />
          <div>
            <div className="text-[9px] uppercase font-mono text-gray-400">Góc bẻ lái</div>
            <div className="text-xs font-bold font-mono text-white">
              {hudInfo.steerPercent > 0 ? `TRÁI ${hudInfo.steerPercent}%` : hudInfo.steerPercent < 0 ? `PHẢI ${Math.abs(hudInfo.steerPercent)}%` : 'THẲNG 0%'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

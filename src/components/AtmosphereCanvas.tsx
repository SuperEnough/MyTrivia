import React, { useEffect, useRef } from 'react';

export const AtmosphereCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const particles = Array.from({ length: 52 }, (_, index) => ({
      x: Math.random(),
      y: Math.random(),
      radius: 1 + Math.random() * 2.8,
      speed: 0.0001 + Math.random() * 0.00035,
      drift: (Math.random() - 0.5) * 0.0002,
      phase: index * 0.83,
    }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const gradient = ctx.createRadialGradient(
        window.innerWidth * 0.72,
        window.innerHeight * 0.2,
        0,
        window.innerWidth * 0.5,
        window.innerHeight * 0.5,
        window.innerWidth * 0.85
      );
      gradient.addColorStop(0, 'rgba(42, 36, 89, 0.72)');
      gradient.addColorStop(1, 'rgba(8, 9, 23, 0.98)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      for (const particle of particles) {
        const x = ((particle.x + Math.sin(time * particle.drift + particle.phase) * 0.04 + 1) % 1) * window.innerWidth;
        const y = ((particle.y - time * particle.speed + particle.phase * 0.00002 + 2) % 1) * window.innerHeight;

        ctx.beginPath();
        ctx.arc(x, y, particle.radius, 0, Math.PI * 2);
        ctx.fillStyle = particle.phase % 2 > 1 ? 'rgba(104, 247, 237, 0.32)' : 'rgba(255, 122, 69, 0.26)';
        ctx.fill();
      }

      animId = window.requestAnimationFrame(draw);
    };

    window.addEventListener('resize', resize);
    resize();
    animId = window.requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas id="game-canvas" ref={canvasRef} aria-hidden="true" />;
};

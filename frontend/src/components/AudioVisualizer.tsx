"use client";
import React, { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  isPlaying: boolean;
}

export default function AudioVisualizer({ isPlaying }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  
  const simulationTime = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: {x: number, y: number, vx: number, vy: number, life: number, maxLife: number, color: string, size: number}[] = [];

    const numBars = 120;
    const radius = 120; 
    
    const emitParticles = (x: number, y: number, count: number, intensity: number) => {
      for(let i=0; i<count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (Math.random() * 3 + 1) * intensity;
        particles.push({
          x: x + Math.cos(angle) * (radius - 10), 
          y: y + Math.sin(angle) * (radius - 10),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: Math.random() * 60 + 30, 
          color: Math.random() > 0.4 ? '#FF3366' : '#FFFFFF', 
          size: Math.random() * 3 + 1
        });
      }
    };

    const render = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const { width, height } = parent.getBoundingClientRect();
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
      }

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;

      let audioData = new Array(numBars).fill(0);
      let isHype = false;
      let shakeAmount = 0;

      if (isPlaying) {
        simulationTime.current += 0.05;
        const t = simulationTime.current;
        
        const beatCycle = t % 15; 
        const kickLevel = Math.max(0, 1 - beatCycle / 4); 
        
        const hypeCycle = (t % 200) / 200;
        if (hypeCycle > 0.75) {
          isHype = true;
        }

        const baseHeight = isHype ? (kickLevel * 80 + 30) : (kickLevel * 30 + 10);
        
        for (let i = 0; i < numBars; i++) {
            const noise = Math.sin(i * 0.5 + t * 5) * 10 + Math.random() * (isHype ? 30 : 10);
            audioData[i] = baseHeight + noise;
        }

        if (isHype && kickLevel > 0.9 && Math.random() > 0.2) {
            emitParticles(centerX, centerY, 8, isHype ? 4 : 1);
            shakeAmount = kickLevel * 6; 
        }
      }

      ctx.save();
      if (shakeAmount > 0) {
        ctx.translate((Math.random() - 0.5) * shakeAmount, (Math.random() - 0.5) * shakeAmount);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
        
        ctx.globalAlpha = 1 - (p.life / p.maxLife);
        ctx.fillStyle = p.color;
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = p.color;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0; 
        
        if (p.life >= p.maxLife) {
            particles.splice(i, 1);
        }
      }

      ctx.globalAlpha = 1.0;

      ctx.beginPath();
      for (let i = 0; i <= numBars; i++) {
        const index = i === numBars ? 0 : i; 
        const val = audioData[index];
        const angle = (i / numBars) * Math.PI * 2 - Math.PI / 2; 
        
        const r = radius + val;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      
      ctx.lineWidth = isHype ? 5 : 3;
      ctx.strokeStyle = isHype ? '#FF3366' : 'rgba(255, 255, 255, 0.9)';
      
      if(isHype && isPlaying) {
          ctx.shadowBlur = Math.random() * 20 + 20;
          ctx.shadowColor = '#FF3366';
      } else if (isPlaying) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = 'rgba(255,255,255,0.5)';
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#050505'; 
      ctx.fill();
      ctx.strokeStyle = isHype ? '#FF3366' : 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();

      const avgVol = isPlaying ? audioData.reduce((a, b) => a + b, 0) / numBars : 0;
      if (avgVol > 15) {
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius - 15 + (avgVol * 0.1), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 51, 102, ${Math.min(0.6, avgVol / 150)})`;
          ctx.lineWidth = 2;
          ctx.stroke();
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 28px "Space Grotesk", "JetBrains Mono", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const textScale = isPlaying ? 1 + (avgVol / 600) : 1;
      
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(textScale, textScale);
      
      if(isHype) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#FF3366';
      }
      ctx.fillText("OpenMusic", 0, 0);
      
      ctx.restore();
      ctx.restore(); 

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying]);

  return (
    <div className="w-full h-full relative overflow-hidden flex items-center justify-center">
        <div 
          className={`absolute inset-0 bg-[#FF3366] blur-[120px] transition-all duration-700 ease-out z-0 pointer-events-none ${isPlaying ? 'opacity-30 scale-110' : 'opacity-0 scale-90'}`} 
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-10 block pointer-events-none" />
    </div>
  );
}

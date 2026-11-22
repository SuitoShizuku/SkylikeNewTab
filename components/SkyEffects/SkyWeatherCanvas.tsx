/**
 * ADD: 雨および雷(稲妻ライン)の描画キャンバス。
 *
 * 天気コードが雨系(51-67, 80-82, 95-99)のときに雨粒を描画し、
 * 雷雨(95-99)のときにはまれに稲妻の線のみを描画する。
 * 点滅エフェクト(画面全体のフラッシュ等)は行わず、細い稲妻ラインの自然な描画と減衰のみを行う。
 */

import { useEffect, useRef } from 'react';
import { isRainyWeather, isThunderWeather } from '@/lib/sky-color';

interface SkyWeatherCanvasProps {
  weatherCode: number | null;
}

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
  opacity: number;
}

interface LightningBranch {
  points: Array<{ x: number; y: number }>;
}

interface LightningBolt {
  branches: LightningBranch[];
  alpha: number; // ADD: フェードアウト用の透明度 (1.0 -> 0.0)
}

/**
 * ADD: 稲妻の経路(主幹と枝分かれ)をフラクタル・ランダムウォークで生成する。
 */
function createLightningBolt(width: number, height: number): LightningBolt {
  const startX = width * (0.2 + Math.random() * 0.6); // ADD: 空の上部20%～80%のランダムな位置から開始
  const startY = 0;
  const targetY = height * (0.4 + Math.random() * 0.4); // ADD: 画面の40%～80%の高さまで届く

  const branches: LightningBranch[] = [];

  // ADD: 主幹の生成
  const mainPoints: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  let currentX = startX;
  let currentY = startY;

  while (currentY < targetY) {
    const stepY = 10 + Math.random() * 20;
    const stepX = (Math.random() - 0.5) * 28;
    currentY += stepY;
    currentX += stepX;
    mainPoints.push({ x: currentX, y: currentY });

    // ADD: 20%の確率で小さな枝分かれを生成
    if (Math.random() < 0.25 && mainPoints.length > 2) {
      const branchPoints: Array<{ x: number; y: number }> = [{ x: currentX, y: currentY }];
      let bx = currentX;
      let by = currentY;
      const branchSteps = 3 + Math.floor(Math.random() * 4);
      const dir = Math.random() < 0.5 ? -1 : 1;
      for (let s = 0; s < branchSteps; s++) {
        bx += dir * (8 + Math.random() * 16);
        by += 6 + Math.random() * 14;
        branchPoints.push({ x: bx, y: by });
      }
      branches.push({ points: branchPoints });
    }
  }

  branches.unshift({ points: mainPoints });

  return {
    branches,
    alpha: 1.0,
  };
}

export function SkyWeatherCanvas({ weatherCode }: SkyWeatherCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const isRain = isRainyWeather(weatherCode);
  const isThunder = isThunderWeather(weatherCode);

  useEffect(() => {
    if (!isRain && !isThunder) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    // ADD: 雨粒の初期化 (密度は画面幅に応じて調整、60～120粒程度)
    const dropCount = Math.floor(Math.min(130, Math.max(50, width / 16)));
    const drops: RainDrop[] = Array.from({ length: dropCount }, () => ({
      x: Math.random() * (width + 100) - 50,
      y: Math.random() * height,
      len: 12 + Math.random() * 16,
      speed: 14 + Math.random() * 10,
      opacity: 0.2 + Math.random() * 0.35,
    }));

    // ADD: 雷の管理
    let currentBolt: LightningBolt | null = null;
    let nextLightningTime = Date.now() + (4000 + Math.random() * 8000); // ADD: 4～12秒後に最初の雷

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // ADD: 雨の描画と移動
      if (isRain) {
        ctx.lineWidth = 1.2;
        for (const drop of drops) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(200, 225, 255, ${drop.opacity})`;
          // ADD: やや斜めに降る (風の表現: x+2.5)
          ctx.moveTo(drop.x, drop.y);
          ctx.lineTo(drop.x + drop.len * 0.15, drop.y + drop.len);
          ctx.stroke();

          // ADD: 位置の更新
          drop.y += drop.speed;
          drop.x += drop.speed * 0.15;

          if (drop.y > height) {
            drop.y = -drop.len;
            drop.x = Math.random() * (width + 100) - 50;
          }
        }
      }

      // ADD: 雷(稲妻ライン)の描画 (点滅エフェクトは行わず、ラインのみをフェードアウト)
      if (isThunder) {
        const now = Date.now();
        if (!currentBolt && now >= nextLightningTime) {
          currentBolt = createLightningBolt(width, height);
          // ADD: 次の雷は8～20秒後のランダムなタイミング
          nextLightningTime = now + (8000 + Math.random() * 12000);
        }

        if (currentBolt) {
          ctx.save();
          for (let i = 0; i < currentBolt.branches.length; i++) {
            const branch = currentBolt.branches[i];
            if (!branch || branch.points.length < 2) continue;

            const isMain = i === 0;
            ctx.beginPath();
            ctx.moveTo(branch.points[0]!.x, branch.points[0]!.y);
            for (let p = 1; p < branch.points.length; p++) {
              ctx.lineTo(branch.points[p]!.x, branch.points[p]!.y);
            }

            // ADD: 稲妻ラインのスタイル (発光色の細い線)
            ctx.strokeStyle = `rgba(225, 240, 255, ${currentBolt.alpha * (isMain ? 0.9 : 0.6)})`;
            ctx.lineWidth = isMain ? 1.8 : 1.0;
            ctx.shadowColor = 'rgba(180, 215, 255, 0.8)';
            ctx.shadowBlur = 6;
            ctx.stroke();
          }
          ctx.restore();

          // ADD: 稲妻をすっとフェードアウトさせる (約0.25秒で消失)
          currentBolt.alpha -= 0.045;
          if (currentBolt.alpha <= 0) {
            currentBolt = null;
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
    };
  }, [isRain, isThunder]);

  if (!isRain && !isThunder) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}

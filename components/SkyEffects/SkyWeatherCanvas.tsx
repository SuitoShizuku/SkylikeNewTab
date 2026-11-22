/**
 * ADD: 雨および雷(稲妻ライン)の描画キャンバス。
 *
 * - 雨の速度は一定。
 * - 天気コード(WMO)に応じて雨の量・長さを細かく調整。
 * - 雨量の変化時は、雨粒の追加・減少がグラデーション(滑らかなフェード)で推移。
 * - 稲妻は画面全体を走る迫力のある大サイズで描画(点滅・ストロボエフェクトは行わず、ラインのみを減衰描画)。
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
  opacity: number;
  threshold: number; // ADD: この雨粒が出現・活性化する雨量強度の閾値 (0.0 ～ 1.0)
}

interface LightningBranch {
  points: Array<{ x: number; y: number }>;
  isMain: boolean;
}

interface LightningBolt {
  branches: LightningBranch[];
  alpha: number; // ADD: フェードアウト用透明度 (1.0 -> 0.0)
}

/**
 * ADD: WMO天気コードに応じた雨の強度 (0.0 ～ 1.2) を取得する。
 */
function getRainIntensity(code: number | null): number {
  if (code === null) return 0;

  switch (code) {
    // ADD: 弱い霧雨
    case 51:
    case 56:
      return 0.15;
    // ADD: 霧雨
    case 53:
    case 57:
      return 0.3;
    // ADD: 強い霧雨
    case 55:
      return 0.45;
    // ADD: 弱い雨 / にわか雨
    case 61:
    case 80:
      return 0.55;
    // ADD: 通常の雨 / 強めのにわか雨
    case 63:
    case 81:
      return 0.75;
    // ADD: 強い雨 / 激しいにわか雨
    case 65:
    case 82:
      return 1.0;
    // ADD: 着氷性の雨
    case 66:
      return 0.7;
    case 67:
      return 1.0;
    // ADD: 雷雨
    case 95:
      return 0.9;
    // ADD: 激しい雷雨 (ひょう・豪雨を伴う)
    case 96:
    case 99:
      return 1.2;
    default:
      return isRainyWeather(code) ? 0.6 : 0.0;
  }
}

/**
 * ADD: 稲妻の経路(主幹と大きな枝分かれ)を生成する。
 * 画面の上部からほぼ画面最下部近くまで大きくダイナミックに伸びる。
 */
function createLargeLightningBolt(width: number, height: number): LightningBolt {
  const startX = width * (0.15 + Math.random() * 0.7); // ADD: 空の15%～85%のランダムな位置から開始
  const startY = 0;
  const targetY = height * (0.75 + Math.random() * 0.22); // ADD: 画面の75%～97%の高さまで大きく伸びる

  const branches: LightningBranch[] = [];

  // ADD: 主幹の生成
  const mainPoints: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  let currentX = startX;
  let currentY = startY;

  while (currentY < targetY) {
    const stepY = 16 + Math.random() * 28;
    const stepX = (Math.random() - 0.5) * 50; // ADD: ジグザグの振れ幅を大きく
    currentY += stepY;
    currentX += stepX;
    mainPoints.push({ x: currentX, y: currentY });

    // ADD: 35%の確率で大きく広がる枝分かれを生成
    if (Math.random() < 0.35 && mainPoints.length > 2) {
      const branchPoints: Array<{ x: number; y: number }> = [{ x: currentX, y: currentY }];
      let bx = currentX;
      let by = currentY;
      const branchSteps = 4 + Math.floor(Math.random() * 6);
      const dir = Math.random() < 0.5 ? -1 : 1;
      for (let s = 0; s < branchSteps; s++) {
        bx += dir * (14 + Math.random() * 26);
        by += 10 + Math.random() * 20;
        branchPoints.push({ x: bx, y: by });

        // ADD: たまに二次分岐(小枝)を生成
        if (Math.random() < 0.25 && s >= 2) {
          const subBranch: Array<{ x: number; y: number }> = [{ x: bx, y: by }];
          let sx = bx;
          let sy = by;
          for (let sub = 0; sub < 3; sub++) {
            sx += dir * (8 + Math.random() * 16);
            sy += 8 + Math.random() * 14;
            subBranch.push({ x: sx, y: sy });
          }
          branches.push({ points: subBranch, isMain: false });
        }
      }
      branches.push({ points: branchPoints, isMain: false });
    }
  }

  branches.unshift({ points: mainPoints, isMain: true });

  return {
    branches,
    alpha: 1.0,
  };
}

export function SkyWeatherCanvas({ weatherCode }: SkyWeatherCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ADD: 目標雨量強度 (0.0 ～ 1.2)
  const targetIntensity = getRainIntensity(weatherCode);
  const isThunder = isThunderWeather(weatherCode);

  const targetIntensityRef = useRef(targetIntensity);
  targetIntensityRef.current = targetIntensity;

  const isThunderRef = useRef(isThunder);
  isThunderRef.current = isThunder;

  useEffect(() => {
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

    // ADD: 最大雨粒数 (画面解像度に合わせて確保)
    const MAX_DROPS = Math.floor(Math.min(180, Math.max(80, width / 11)));

    // ADD: 雨粒の初期化 (雨の速度は全粒で一定、閾値を分散配置)
    const RAIN_SPEED = 18; // ADD: 雨の落下速度は一定
    const drops: RainDrop[] = Array.from({ length: MAX_DROPS }, (_, i) => ({
      x: Math.random() * (width + 120) - 60,
      y: Math.random() * height,
      len: 14 + Math.random() * 12,
      opacity: 0.25 + Math.random() * 0.35,
      threshold: i / MAX_DROPS, // ADD: 0.0 から 1.0 に向かって順番に活性化
    }));

    // ADD: 現在の実効雨量強度 (グラデーション切り替え用、徐々に目標値へ近づく)
    let currentIntensity = targetIntensityRef.current;

    // ADD: 雷の管理
    let currentBolt: LightningBolt | null = null;
    let nextLightningTime = Date.now() + (3000 + Math.random() * 6000); // ADD: 初回3～9秒後

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // ADD: 雨量強度のグラデーション線形補間 (約1～2秒かけて滑らかに移り変わる)
      const target = targetIntensityRef.current;
      const diff = target - currentIntensity;
      if (Math.abs(diff) > 0.002) {
        currentIntensity += diff * 0.035; // ADD: スムーズなイージング
      } else {
        currentIntensity = target;
      }

      // ADD: 雨の描画 (雨量が0より大きい間、またはフェードアウト完了まで描画)
      if (currentIntensity > 0.005) {
        ctx.lineWidth = 1.3;

        for (const drop of drops) {
          // ADD: 雨量強度と各雨粒の閾値からフェード率(0.0 ～ 1.0)を滑らかに計算
          // 雨の量の切り替えがグラデーションで自然に行われる
          const range = 0.25; // ADD: フェードの幅
          const delta = currentIntensity - drop.threshold;
          const dropFade = Math.max(0, Math.min(1, delta / range));

          if (dropFade > 0) {
            const finalAlpha = drop.opacity * dropFade;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(205, 228, 255, ${finalAlpha})`;
            // ADD: 速度が一定なので傾きも一定 (風による自然な斜め角度: 速度*0.14)
            ctx.moveTo(drop.x, drop.y);
            ctx.lineTo(drop.x + drop.len * 0.14, drop.y + drop.len);
            ctx.stroke();
          }

          // ADD: 位置の更新 (一定の速度で落下)
          drop.y += RAIN_SPEED;
          drop.x += RAIN_SPEED * 0.14;

          if (drop.y > height) {
            drop.y = -drop.len;
            drop.x = Math.random() * (width + 120) - 60;
          }
        }
      }

      // ADD: 雷(稲妻ライン)の描画 (点滅エフェクトは行わず、大きな稲妻ラインのフェードアウトのみ)
      if (isThunderRef.current) {
        const now = Date.now();
        if (!currentBolt && now >= nextLightningTime) {
          currentBolt = createLargeLightningBolt(width, height);
          // ADD: 次の雷は7～18秒後のランダムな間隔
          nextLightningTime = now + (7000 + Math.random() * 11000);
        }

        if (currentBolt) {
          ctx.save();

          for (const branch of currentBolt.branches) {
            if (branch.points.length < 2) continue;

            ctx.beginPath();
            ctx.moveTo(branch.points[0]!.x, branch.points[0]!.y);
            for (let p = 1; p < branch.points.length; p++) {
              ctx.lineTo(branch.points[p]!.x, branch.points[p]!.y);
            }

            // ADD: 大きく迫力のある稲妻ライン (主幹は太さ3.2px、グロー付き)
            const branchAlpha = currentBolt.alpha * (branch.isMain ? 0.95 : 0.65);
            ctx.strokeStyle = `rgba(235, 245, 255, ${branchAlpha})`;
            ctx.lineWidth = branch.isMain ? 3.2 : 1.6;
            ctx.shadowColor = 'rgba(160, 210, 255, 0.85)';
            ctx.shadowBlur = branch.isMain ? 14 : 7;
            ctx.stroke();
          }

          ctx.restore();

          // ADD: 稲妻ラインを滑らかにフェードアウト (約0.3秒)
          currentBolt.alpha -= 0.038;
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
  }, []);

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

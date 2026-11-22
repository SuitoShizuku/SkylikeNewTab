/**
 * ADD: 雨・雷・幻想的な星空・高精度月相の描画キャンバス。
 *
 * - 画面下部まで途切れず全面に描画(見切れの解消)。
 * - 多彩な星色(シアン・アンバー・バイオレット)、瞬き、光芒付きジュエルスター、
 *   淡い星雲(Cosmic Nebula)、時折流れる流れ星(Shooting Star)による幻想的な夜空。
 * - Jean Meeus天文学計算に基づく完全連続値の高精度月相(新月～三日月～上弦～満月～下弦)。
 * - 雨は一定速度、コードに応じた雨量、滑らかなグラデーション遷移。
 * - 雷は画面全体を走る大迫力の稲妻ライン(点滅なし)。
 */

import { useEffect, useRef } from 'react';
import {
  getMoonPhase,
  getStarVisibility,
  isThunderWeather,
} from '@/lib/sky-color';

interface SkyWeatherCanvasProps {
  weatherCode: number | null;
  elevation: number;
  debugMoonPhase?: number;
}

interface RainDrop {
  x: number;
  y: number;
  len: number;
  opacity: number;
  threshold: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  color: string; // ADD: 幻想的な星の色
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  isJewel: boolean; // ADD: ダイヤモンド光芒とグローを持つ大星
  spikeLen: number;
}

interface ShootingStar {
  x: number;
  y: number;
  len: number;
  speed: number;
  angle: number;
  alpha: number;
  active: boolean;
}

interface LightningBranch {
  points: Array<{ x: number; y: number }>;
  isMain: boolean;
}

interface LightningBolt {
  branches: LightningBranch[];
  alpha: number;
}

// ADD: 幻想的な星の色パレット
const STAR_COLORS = [
  '#ffffff', // ダイヤモンドホワイト
  '#dbeafe', // サファイアホワイト
  '#cffafe', // アクアブルー
  '#bae6fd', // アイシーシアン
  '#fef08a', // トパーズゴールド
  '#fde68a', // アンバー
  '#f5d0fe', // アメジストバイオレット
  '#fed7aa', // ピーチゴールド
];

/**
 * ADD: WMO天気コードに応じた雨の強度 (0.0 ～ 1.2) を取得する。
 */
function getRainIntensity(code: number | null): number {
  if (code === null) return 0;

  switch (code) {
    case 51:
    case 56:
      return 0.15; // 弱い霧雨
    case 53:
    case 57:
      return 0.3; // 霧雨
    case 55:
      return 0.45; // 強い霧雨
    case 61:
    case 80:
      return 0.55; // 弱い雨
    case 63:
    case 81:
      return 0.75; // 雨
    case 65:
    case 82:
      return 1.0; // 強い雨
    case 66:
      return 0.7;
    case 67:
      return 1.0;
    case 95:
      return 0.9; // 雷雨
    case 96:
    case 99:
      return 1.2; // 激しい雷雨
    default:
      return code >= 51 && code <= 99 ? 0.6 : 0.0;
  }
}

/**
 * ADD: 大迫力の稲妻ラインを生成する。
 */
function createLargeLightningBolt(width: number, height: number): LightningBolt {
  const startX = width * (0.15 + Math.random() * 0.7);
  const startY = 0;
  const targetY = height * (0.75 + Math.random() * 0.24);

  const branches: LightningBranch[] = [];
  const mainPoints: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  let currentX = startX;
  let currentY = startY;

  while (currentY < targetY) {
    const stepY = 16 + Math.random() * 28;
    const stepX = (Math.random() - 0.5) * 52;
    currentY += stepY;
    currentX += stepX;
    mainPoints.push({ x: currentX, y: currentY });

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

  return { branches, alpha: 1.0 };
}

/**
 * ADD: 月相(Moon Phase)を高精度・リアルタイムに美しく描画する。
 */
function drawMoon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  phase: number,
  fraction: number,
  alpha: number,
) {
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  // ADD: 月の幻想的な多層光彩(Lunar Halo)
  const glowGrad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 3.5);
  glowGrad.addColorStop(0, 'rgba(255, 252, 235, 0.28)');
  glowGrad.addColorStop(0.35, 'rgba(215, 235, 255, 0.12)');
  glowGrad.addColorStop(0.7, 'rgba(180, 210, 255, 0.04)');
  glowGrad.addColorStop(1, 'rgba(160, 190, 255, 0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 3.5, 0, Math.PI * 2);
  ctx.fill();

  // ADD: 地球照(薄明部・欠けている側の輪郭)
  ctx.fillStyle = 'rgba(240, 245, 255, 0.08)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // ADD: 高精度な月の照光面を描画
  const normPhase = ((phase % 1) + 1) % 1;

  if (fraction > 0.005) {
    ctx.save();
    ctx.beginPath();

    // ADD: 照光面を数学的楕円弧で正確に切り取る
    const k = Math.cos(normPhase * 2 * Math.PI); // -1 ～ 1

    if (normPhase < 0.5) {
      // ADD: 満ちていく月 (右側が照光)
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);
      ctx.ellipse(cx, cy, Math.max(0.01, Math.abs(k) * r), r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
    } else {
      // ADD: 欠けていく月 (左側が照光)
      ctx.arc(cx, cy, r, Math.PI / 2, -Math.PI / 2, false);
      ctx.ellipse(cx, cy, Math.max(0.01, Math.abs(k) * r), r, 0, -Math.PI / 2, Math.PI / 2, k < 0);
    }

    ctx.closePath();
    ctx.clip();

    // ADD: 月の表面グラデーション(月光色と微かな立体感)
    const moonBodyGrad = ctx.createRadialGradient(
      normPhase < 0.5 ? cx + r * 0.3 : cx - r * 0.3,
      cy - r * 0.2,
      r * 0.1,
      cx,
      cy,
      r,
    );
    moonBodyGrad.addColorStop(0, '#fffdf2');
    moonBodyGrad.addColorStop(0.65, '#fef9dc');
    moonBodyGrad.addColorStop(1, '#f6ecd0');
    ctx.fillStyle = moonBodyGrad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // ADD: 月の海(Lunar Maria)の微細な陰影模様
    ctx.fillStyle = 'rgba(165, 155, 140, 0.15)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.15, cy - r * 0.2, r * 0.35, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.25, cy + r * 0.1, r * 0.28, 0, Math.PI * 2);
    ctx.arc(cx - r * 0.05, cy + r * 0.3, r * 0.24, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}

export function SkyWeatherCanvas({
  weatherCode,
  elevation,
  debugMoonPhase,
}: SkyWeatherCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const targetRainIntensity = getRainIntensity(weatherCode);
  const isThunder = isThunderWeather(weatherCode);
  const starVis = getStarVisibility(elevation, weatherCode);

  const targetRainRef = useRef(targetRainIntensity);
  targetRainRef.current = targetRainIntensity;

  const isThunderRef = useRef(isThunder);
  isThunderRef.current = isThunder;

  const starVisRef = useRef(starVis);
  starVisRef.current = starVis;

  const moonPhaseRef = useRef(debugMoonPhase);
  moonPhaseRef.current = debugMoonPhase;

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

    // ADD: 星の初期化 (画面全高 height 全面に隙間なく配置し見切れを防止)
    const MAX_STARS = 260;
    const stars: Star[] = Array.from({ length: MAX_STARS }, (_, i) => {
      const isJewel = i < 10; // ADD: 先頭10個は大きく輝くジュエルスター
      const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)]!;
      return {
        x: Math.random() * width,
        y: Math.random() * height, // EDIT: 画面の最下部まで全面に配置
        r: isJewel ? 1.8 + Math.random() * 0.9 : 0.4 + Math.random() * 1.3,
        color,
        baseAlpha: isJewel ? 0.75 + Math.random() * 0.25 : 0.25 + Math.random() * 0.7,
        twinkleSpeed: 0.0012 + Math.random() * 0.0028,
        twinklePhase: Math.random() * Math.PI * 2,
        isJewel,
        spikeLen: 6 + Math.random() * 6,
      };
    });

    // ADD: 流れ星(Shooting Star)の管理
    let shootingStar: ShootingStar | null = null;
    let nextShootingTime = Date.now() + (5000 + Math.random() * 8000);

    // ADD: 雨粒の初期化 (雨の速度は全粒で一定、閾値を分散配置)
    const MAX_DROPS = Math.floor(Math.min(180, Math.max(80, width / 11)));
    const RAIN_SPEED = 18;
    const drops: RainDrop[] = Array.from({ length: MAX_DROPS }, (_, i) => ({
      x: Math.random() * (width + 120) - 60,
      y: Math.random() * height,
      len: 14 + Math.random() * 12,
      opacity: 0.25 + Math.random() * 0.35,
      threshold: i / MAX_DROPS,
    }));

    // ADD: 状態の補間用変数
    let currentRainIntensity = targetRainRef.current;
    let currentStarAlpha = starVisRef.current.nightAlpha * starVisRef.current.weatherAlpha;

    // ADD: 雷の管理
    let currentBolt: LightningBolt | null = null;
    let nextLightningTime = Date.now() + (3000 + Math.random() * 6000);

    const render = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      // ADD: 星・月の透明度を滑らかにグラデーション線形補間
      const targetStarAlpha = starVisRef.current.nightAlpha * starVisRef.current.weatherAlpha;
      currentStarAlpha += (targetStarAlpha - currentStarAlpha) * 0.035;

      // ADD: ---- 1. 幻想的な星空の描画 (夜かつ晴れ/快晴) ----
      if (currentStarAlpha > 0.008) {
        const quality = starVisRef.current.quality;

        // ADD: 快晴時の幻想的な宇宙星雲(Cosmic Nebula) - 画面全面に滑らかに展開(見切れなし)
        if (quality === 'brilliant' && currentStarAlpha > 0.15) {
          ctx.save();
          // ADD: 画面全体を覆う多重星雲グラデーション
          const nebGrad1 = ctx.createRadialGradient(
            width * 0.3,
            height * 0.35,
            width * 0.05,
            width * 0.45,
            height * 0.5,
            width * 0.75,
          );
          nebGrad1.addColorStop(0, `rgba(147, 197, 253, ${0.08 * currentStarAlpha})`);
          nebGrad1.addColorStop(0.4, `rgba(168, 85, 247, ${0.06 * currentStarAlpha})`);
          nebGrad1.addColorStop(0.8, `rgba(56, 189, 248, ${0.03 * currentStarAlpha})`);
          nebGrad1.addColorStop(1, 'rgba(0, 0, 0, 0)');

          ctx.fillStyle = nebGrad1;
          ctx.fillRect(0, 0, width, height); // EDIT: 全面に描画

          const nebGrad2 = ctx.createLinearGradient(0, 0, width, height);
          nebGrad2.addColorStop(0, 'rgba(0, 0, 0, 0)');
          nebGrad2.addColorStop(0.45, `rgba(192, 132, 252, ${0.04 * currentStarAlpha})`);
          nebGrad2.addColorStop(0.75, `rgba(96, 165, 250, ${0.03 * currentStarAlpha})`);
          nebGrad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = nebGrad2;
          ctx.fillRect(0, 0, width, height); // EDIT: 全面に描画

          ctx.restore();
        }

        // ADD: 星の描画 (快晴時は全星、晴れ時は約80個)
        const visibleStarsCount = quality === 'brilliant' ? MAX_STARS : 85;

        for (let i = 0; i < visibleStarsCount; i++) {
          const star = stars[i]!;
          // ADD: 快晴時は有機的な呼吸の瞬き(Twinkle Pulse)
          const twinkle =
            quality === 'brilliant'
              ? 0.65 + 0.35 * Math.sin(time * star.twinkleSpeed + star.twinklePhase)
              : 0.85;
          const alpha = star.baseAlpha * twinkle * currentStarAlpha;

          // ADD: 星の本体描画
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = star.color;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
          ctx.fill();

          // ADD: 幻想的なジュエルスターのダイヤモンド光条とハロー
          if (star.isJewel && quality === 'brilliant' && alpha > 0.35) {
            // 光彩ハロー
            const halo = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.spikeLen * 1.5);
            halo.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.4})`);
            halo.addColorStop(0.5, `rgba(190, 220, 255, ${alpha * 0.15})`);
            halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.spikeLen * 1.5, 0, Math.PI * 2);
            ctx.fill();

            // 4点ダイヤモンド十字光芒
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(star.x - star.spikeLen, star.y);
            ctx.lineTo(star.x + star.spikeLen, star.y);
            ctx.moveTo(star.x, star.y - star.spikeLen);
            ctx.lineTo(star.x, star.y + star.spikeLen);
            ctx.stroke();

            // 斜め光芒(微小)
            const subSpike = star.spikeLen * 0.45;
            ctx.strokeStyle = `rgba(200, 230, 255, ${alpha * 0.45})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(star.x - subSpike, star.y - subSpike);
            ctx.lineTo(star.x + subSpike, star.y + subSpike);
            ctx.moveTo(star.x - subSpike, star.y + subSpike);
            ctx.lineTo(star.x + subSpike, star.y - subSpike);
            ctx.stroke();
          }

          ctx.restore();
        }

        // ADD: 幻想的な流れ星(Shooting Star)の生成と描画
        if (quality === 'brilliant') {
          const now = Date.now();
          if (!shootingStar && now >= nextShootingTime) {
            shootingStar = {
              x: Math.random() * width * 0.8,
              y: Math.random() * height * 0.4,
              len: 60 + Math.random() * 70,
              speed: 12 + Math.random() * 8,
              angle: Math.PI / 4 + (Math.random() - 0.5) * 0.2, // 約45度斜め
              alpha: 1.0,
              active: true,
            };
            nextShootingTime = now + (9000 + Math.random() * 14000);
          }

          if (shootingStar && shootingStar.active) {
            const tailX = shootingStar.x - Math.cos(shootingStar.angle) * shootingStar.len;
            const tailY = shootingStar.y - Math.sin(shootingStar.angle) * shootingStar.len;

            ctx.save();
            const grad = ctx.createLinearGradient(tailX, tailY, shootingStar.x, shootingStar.y);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
            grad.addColorStop(0.7, `rgba(180, 230, 255, ${shootingStar.alpha * 0.6 * currentStarAlpha})`);
            grad.addColorStop(1, `rgba(255, 255, 255, ${shootingStar.alpha * currentStarAlpha})`);

            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(shootingStar.x, shootingStar.y);
            ctx.stroke();
            ctx.restore();

            shootingStar.x += Math.cos(shootingStar.angle) * shootingStar.speed;
            shootingStar.y += Math.sin(shootingStar.angle) * shootingStar.speed;
            shootingStar.alpha -= 0.024;

            if (shootingStar.alpha <= 0 || shootingStar.x > width || shootingStar.y > height) {
              shootingStar = null;
            }
          }
        }
      }

      // ADD: ---- 2. 高精度な月の描画 (夜かつ晴れ/快晴、月相反映) ----
      if (currentStarAlpha > 0.008) {
        const moonInfo = getMoonPhase(new Date(), moonPhaseRef.current);
        const moonX = width * 0.82;
        const moonY = Math.max(60, height * 0.16);
        const moonRadius = 26;
        drawMoon(ctx, moonX, moonY, moonRadius, moonInfo.phase, moonInfo.fraction, currentStarAlpha);
      }

      // ADD: ---- 3. 雨の描画 (グラデーション切り替え) ----
      const targetRain = targetRainRef.current;
      const rainDiff = targetRain - currentRainIntensity;
      if (Math.abs(rainDiff) > 0.002) {
        currentRainIntensity += rainDiff * 0.035;
      } else {
        currentRainIntensity = targetRain;
      }

      if (currentRainIntensity > 0.005) {
        ctx.lineWidth = 1.3;

        for (const drop of drops) {
          const range = 0.25;
          const delta = currentRainIntensity - drop.threshold;
          const dropFade = Math.max(0, Math.min(1, delta / range));

          if (dropFade > 0) {
            const finalAlpha = drop.opacity * dropFade;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(205, 228, 255, ${finalAlpha})`;
            ctx.moveTo(drop.x, drop.y);
            ctx.lineTo(drop.x + drop.len * 0.14, drop.y + drop.len);
            ctx.stroke();
          }

          drop.y += RAIN_SPEED;
          drop.x += RAIN_SPEED * 0.14;

          if (drop.y > height) {
            drop.y = -drop.len;
            drop.x = Math.random() * (width + 120) - 60;
          }
        }
      }

      // ADD: ---- 4. 雷(稲妻ライン)の描画 (大迫力ライン、点滅なし) ----
      if (isThunderRef.current) {
        const now = Date.now();
        if (!currentBolt && now >= nextLightningTime) {
          currentBolt = createLargeLightningBolt(width, height);
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

            const branchAlpha = currentBolt.alpha * (branch.isMain ? 0.95 : 0.65);
            ctx.strokeStyle = `rgba(235, 245, 255, ${branchAlpha})`;
            ctx.lineWidth = branch.isMain ? 3.2 : 1.6;
            ctx.shadowColor = 'rgba(160, 210, 255, 0.85)';
            ctx.shadowBlur = branch.isMain ? 14 : 7;
            ctx.stroke();
          }

          ctx.restore();

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

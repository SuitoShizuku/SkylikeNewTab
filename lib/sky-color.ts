/**
 * ADD: 実際の空に連動した背景グラデーションを生成するモジュール。
 *
 * 太陽の仰角を天文計算で求め、天気コード(WMO)と組み合わせて
 * リアルな空のCSSグラデーションを返す。APIキー不要(Open-Meteo)。
 */

// ADD: ---- 太陽位置の天文計算 ----

/** ADD: 度→ラジアン */
function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

/** ADD: ラジアン→度 */
function rad2deg(r: number): number {
  return (r * 180) / Math.PI;
}

export interface SolarPosition {
  /** ADD: 太陽仰角 (-90° ～ +90°) */
  elevation: number;
  /** ADD: 太陽が昇っている途中(朝・午前=true)か、沈んでいる途中(夕・午後=false)か */
  isDawn: boolean;
}

/**
 * ADD: 太陽の位置(仰角および昇降フェーズ)を天文計算で求める。
 * 太陽の時角(Hour Angle)を判定し、午前(東から昇る・朝焼け)か
 * 午後(西へ沈む・夕焼け)かを正確に特定する。
 */
export function getSolarPosition(lat: number, lon: number, date: Date = new Date()): SolarPosition {
  // ADD: ユリウス日
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;

  // ADD: 平均黄経
  const L = ((280.46 + 0.9856474 * n) % 360 + 360) % 360;
  // ADD: 平均近点角
  const g = deg2rad(((357.528 + 0.9856003 * n) % 360 + 360) % 360);
  // ADD: 黄道座標での太陽黄経
  const lambda = deg2rad(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));

  // ADD: 赤緯
  const epsilon = deg2rad(23.439 - 0.0000004 * n);
  const sinDec = Math.sin(epsilon) * Math.sin(lambda);
  const dec = Math.asin(sinDec);

  // ADD: 赤経
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));

  // ADD: グリニッジ恒星時
  const gmst = ((280.46061837 + 360.98564736629 * n) % 360 + 360) % 360;
  // ADD: 地方恒星時
  const lst = deg2rad(gmst + lon);
  // ADD: 時角 (-PI ～ +PI に正規化)
  let ha = lst - ra;
  ha = Math.atan2(Math.sin(ha), Math.cos(ha));

  // ADD: 仰角
  const sinAlt =
    Math.sin(deg2rad(lat)) * Math.sin(dec) +
    Math.cos(deg2rad(lat)) * Math.cos(dec) * Math.cos(ha);

  const elevation = rad2deg(Math.asin(sinAlt));

  // ADD: 時角 ha < 0 は太陽が子午線より東側(昇る側・午前)、ha >= 0 は西側(沈む側・午後)
  const isDawn = ha < 0;

  return { elevation, isDawn };
}

/**
 * ADD: 太陽の仰角(elevation angle)を計算する。
 */
export function solarElevation(lat: number, lon: number, date: Date = new Date()): number {
  return getSolarPosition(lat, lon, date).elevation;
}

/**
 * ADD: 24時間時刻(0.0 ～ 24.0)から太陽仰角と朝/夕フェーズを計算する。
 * 端(0:00と24:00)が同一の深夜(-60°)として綺麗に循環・接続する。
 * - 0:00: 深夜 (-60°)
 * - 6:00: 日の出 (0°)
 * - 12:00: 正午・真昼 (+60°)
 * - 18:00: 日没 (0°)
 * - 24:00: 深夜 (-60°)
 */
export function timeToSolarPosition(timeOfDay: number): SolarPosition {
  const t = ((timeOfDay % 24) + 24) % 24;
  const isDawn = t < 12;
  // ADD: 12時で+60°、0時/24時で-60°のコサイン曲線
  const angleRad = ((t - 12) / 12) * Math.PI;
  const elevation = 60 * Math.cos(angleRad);
  return { elevation, isDawn };
}

// ADD: ---- 高精度・月相 (Moon Phase) の天文計算 ----

export interface MoonPhaseInfo {
  /** ADD: 月相 (0.0=新月, 0.25=上弦, 0.5=満月, 0.75=下弦, 1.0=新月, 連続値) */
  phase: number;
  /** ADD: 月齢 (0.00 ～ 29.53日, 連続値) */
  age: number;
  /** ADD: 詳細な月相名 */
  name: string;
  /** ADD: 月の輝面比 / 照度割合 (0.000 ～ 1.000) */
  fraction: number;
  /** ADD: 満ちていく月(true)か欠けていく月(false)か */
  isWaxing: boolean;
}

/**
 * ADD: 指定日時の高精度月相を計算する。
 * Jean Meeus Astronomical Algorithms に基づく主要な摂動項(出差・二均差・年差等)を
 * 組み込んだ高精度天文学アルゴリズムにより、連続的な月相・月齢を算出する。
 */
export function getMoonPhase(date: Date = new Date(), overridePhase?: number): MoonPhaseInfo {
  if (typeof overridePhase === 'number') {
    const phase = ((overridePhase % 1) + 1) % 1;
    const age = phase * 29.53058867;
    const fraction = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
    const isWaxing = phase < 0.5;
    return {
      phase,
      age,
      name: getMoonPhaseName(phase, fraction),
      fraction,
      isWaxing,
    };
  }

  // ADD: ユリウス日とユリウス世紀数 (J2000.0基準)
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;

  // ADD: 太陽の平均近点角 M (度)
  const M = ((357.5291 + 35999.0503 * T) % 360 + 360) % 360;
  // ADD: 月の平均近点角 M' (度)
  const Mp = ((134.9634 + 477198.8676 * T) % 360 + 360) % 360;
  // ADD: 月の平均離角 D (度)
  const D = ((297.8502 + 445267.1114 * T) % 360 + 360) % 360;

  // ADD: ラジアン変換
  const Mrad = deg2rad(M);
  const Mprad = deg2rad(Mp);
  const Drad = deg2rad(D);

  // ADD: 摂動項を考慮した月相角 i (度)
  let i =
    180 -
    D -
    6.289 * Math.sin(Mprad) +
    2.100 * Math.sin(Mrad) -
    1.274 * Math.sin(2 * Drad - Mprad) -
    0.658 * Math.sin(2 * Drad) -
    0.214 * Math.sin(2 * Mprad) -
    0.110 * Math.sin(Drad);

  i = ((i % 360) + 360) % 360;

  // ADD: 輝面比 k (0.0 ～ 1.0)
  const fraction = (1 + Math.cos(deg2rad(i))) / 2;

  // ADD: 満ち欠け方向 (Drad の正負で新月->満月か満月->新月かを判別)
  const sinD = Math.sin(Drad);
  const isWaxing = sinD >= 0;

  // ADD: 連続した月相値 phase (0.0=新月, 0.25=上弦, 0.5=満月, 0.75=下弦, 1.0=新月)
  let phase: number;
  if (isWaxing) {
    // 0.0 -> 0.5: fraction 0.0 -> 1.0
    phase = Math.acos(1 - 2 * fraction) / (2 * Math.PI);
  } else {
    // 0.5 -> 1.0: fraction 1.0 -> 0.0
    phase = 1 - Math.acos(1 - 2 * fraction) / (2 * Math.PI);
  }
  phase = ((phase % 1) + 1) % 1;

  const age = phase * 29.53058867;
  const name = getMoonPhaseName(phase, fraction);

  return { phase, age, name, fraction, isWaxing };
}

/** ADD: 月相名判定 */
function getMoonPhaseName(phase: number, fraction: number): string {
  if (fraction < 0.015) return '新月 (朔)';
  if (fraction > 0.985) return '満月 (望)';
  if (phase < 0.22) return '三日月 (若月)';
  if (phase >= 0.22 && phase <= 0.28) return '上弦の月 (半月)';
  if (phase > 0.28 && phase < 0.48) return '十三夜 (十日夜)';
  if (phase > 0.52 && phase < 0.72) return '十六夜・居待月';
  if (phase >= 0.72 && phase <= 0.78) return '下弦の月 (半月)';
  return '有明月 (逆三日月)';
}

// ADD: ---- 星空の可視性判定 ----

export type StarQuality = 'none' | 'normal' | 'brilliant';

export interface StarVisibility {
  quality: StarQuality;
  /** ADD: 昼夜・薄明によるフェード係数 (0.0=完全な昼, 1.0=完全な夜) */
  nightAlpha: number;
  /** ADD: 雲量によるフェード係数 (0.0=曇り・雨, 1.0=快晴・晴れ) */
  weatherAlpha: number;
}

/**
 * ADD: 太陽仰角と天気コードから星空の表示状態を判定する。
 * - 昼間(仰角 > -6°)は非表示。
 * - 曇り(3, 45, 48)や雨(51-67, 80-82, 95-99)は星が見えない。
 * - 晴れ(1, 2)は通常の星。
 * - 快晴(0, または天気なし)は最も美しい星空(満天の星・瞬き)。
 */
export function getStarVisibility(elevation: number, weatherCode: number | null): StarVisibility {
  // ADD: 太陽仰角による暗さ (夜空度)
  let nightAlpha = 0;
  if (elevation <= -18) {
    nightAlpha = 1.0; // ADD: 天文薄明終了後の完全な夜
  } else if (elevation < -6) {
    nightAlpha = (-6 - elevation) / 12; // ADD: -6°から-18°にかけて滑らかに星が現れる
  }

  // ADD: 天気コードによる可視性と星の美しさ判定
  if (weatherCode === null || weatherCode === 0) {
    return { quality: 'brilliant', nightAlpha, weatherAlpha: 1.0 };
  }

  if (weatherCode === 1 || weatherCode === 2) {
    return { quality: 'normal', nightAlpha, weatherAlpha: 0.75 };
  }

  // ADD: 曇り(3, 45, 48)や雨(51以上)は星が見えない
  return { quality: 'none', nightAlpha, weatherAlpha: 0.0 };
}

// ADD: ---- 空のグラデーション色テーブル ----

/**
 * ADD: 太陽の仰角に応じた空の色パレット。
 * 各エントリは [仰角の閾値, 天頂の色, 地平線の色] のタプル。
 * 仰角が大きい方から順に判定し、最初に合致したパレットを使う。
 */
interface SkyPalette {
  /** ADD: この仰角以上で適用 */
  minElevation: number;
  /** ADD: 天頂側(上)の色 */
  zenith: string;
  /** ADD: 地平線側(下)の色 */
  horizon: string;
}

/** ADD: 晴天・朝焼けの空パレット (太陽が東から昇るフェーズ: 透明感、ペールローズ、黄金光、ラベンダー) */
const CLEAR_DAWN_PALETTES: SkyPalette[] = [
  // ADD: 真昼の青空
  { minElevation: 30, zenith: '#0a4a8a', horizon: '#87ceeb' },
  // ADD: 午前 (爽やかで澄み切った青空)
  { minElevation: 15, zenith: '#185a9d', horizon: '#82cde6' },
  // ADD: 朝の光 (澄んだ空に広がる柔らかな朝の黄金光)
  { minElevation: 5, zenith: '#224472', horizon: '#fde08b' },
  // ADD: 日の出直前直後 (淡い朝桜・ローズピンクと青紫)
  { minElevation: -1, zenith: '#1c2856', horizon: '#fca5a5' },
  // ADD: 夜明けの薄明 (美しいペールパープル・朝のラベンダー)
  { minElevation: -6, zenith: '#151b40', horizon: '#c084fc' },
  // ADD: 市民薄明 (インディゴ・夜明けの群青)
  { minElevation: -12, zenith: '#0e122b', horizon: '#6366f1' },
  // ADD: 航海薄明
  { minElevation: -18, zenith: '#08081a', horizon: '#25254a' },
  // ADD: 夜
  { minElevation: -90, zenith: '#05030f', horizon: '#0a0820' },
];

/** ADD: 晴天・夕焼けの空パレット (太陽が西へ沈むフェーズ: 濃密な茜色、ディープオレンジ、クリムゾン、マゼンタ) */
const CLEAR_DUSK_PALETTES: SkyPalette[] = [
  // ADD: 真昼の青空
  { minElevation: 30, zenith: '#0a4a8a', horizon: '#87ceeb' },
  // ADD: 午後
  { minElevation: 15, zenith: '#1c528f', horizon: '#78bee8' },
  // ADD: 夕暮れの低い太陽 (燃えるような夕暮れのオレンジ)
  { minElevation: 5, zenith: '#2a3268', horizon: '#f97316' },
  // ADD: 日没直前直後 (真紅・茜色のグラデーション)
  { minElevation: -1, zenith: '#1f1847', horizon: '#ef4444' },
  // ADD: マジックアワー (夕闇のクリムゾンマゼンタ)
  { minElevation: -6, zenith: '#181036', horizon: '#be185d' },
  // ADD: 市民薄明 (黄昏・逢魔が時のディープパープル)
  { minElevation: -12, zenith: '#0f0a26', horizon: '#6b21a8' },
  // ADD: 航海薄明
  { minElevation: -18, zenith: '#080618', horizon: '#2e1045' },
  // ADD: 夜
  { minElevation: -90, zenith: '#05030f', horizon: '#0a0820' },
];

/** ADD: 曇天・朝のパレット */
const CLOUDY_DAWN_PALETTES: SkyPalette[] = [
  { minElevation: 15, zenith: '#546577', horizon: '#8e9eaf' },
  { minElevation: 5, zenith: '#445367', horizon: '#8493a7' },
  { minElevation: -1, zenith: '#32364c', horizon: '#787389' },
  { minElevation: -6, zenith: '#181a33', horizon: '#524b66' },
  { minElevation: -12, zenith: '#0c0f20', horizon: '#2d2542' },
  { minElevation: -90, zenith: '#05030f', horizon: '#0a0820' },
];

/** ADD: 曇天・夕方のパレット */
const CLOUDY_DUSK_PALETTES: SkyPalette[] = [
  { minElevation: 15, zenith: '#5a6674', horizon: '#8f9a9e' },
  { minElevation: 5, zenith: '#4e5464', horizon: '#8a7d83' },
  { minElevation: -1, zenith: '#3e3447', horizon: '#7a5a64' },
  { minElevation: -6, zenith: '#22182e', horizon: '#543248' },
  { minElevation: -12, zenith: '#0f0a1e', horizon: '#2e182f' },
  { minElevation: -90, zenith: '#05030f', horizon: '#0a0820' },
];

/** ADD: 雨天・朝のパレット */
const RAINY_DAWN_PALETTES: SkyPalette[] = [
  { minElevation: 15, zenith: '#344759', horizon: '#687e91' },
  { minElevation: 5, zenith: '#26374a', horizon: '#576f82' },
  { minElevation: -1, zenith: '#182438', horizon: '#4d596e' },
  { minElevation: -6, zenith: '#0f1725', horizon: '#31374a' },
  { minElevation: -90, zenith: '#05030f', horizon: '#0a0820' },
];

/** ADD: 雨天・夕方のパレット */
const RAINY_DUSK_PALETTES: SkyPalette[] = [
  { minElevation: 15, zenith: '#3b4554', horizon: '#6d7583' },
  { minElevation: 5, zenith: '#2d3345', horizon: '#5e5a6c' },
  { minElevation: -1, zenith: '#1f2038', horizon: '#4e3e52' },
  { minElevation: -6, zenith: '#121226', horizon: '#322538' },
  { minElevation: -90, zenith: '#05030f', horizon: '#0a0820' },
];

/** ADD: 雪・朝のパレット */
const SNOWY_DAWN_PALETTES: SkyPalette[] = [
  { minElevation: 15, zenith: '#556885', horizon: '#a3b4c9' },
  { minElevation: 5, zenith: '#455775', horizon: '#91a4bc' },
  { minElevation: -1, zenith: '#333b59', horizon: '#8386a3' },
  { minElevation: -6, zenith: '#191c36', horizon: '#575173' },
  { minElevation: -90, zenith: '#05030f', horizon: '#0a0820' },
];

/** ADD: 雪・夕方のパレット */
const SNOWY_DUSK_PALETTES: SkyPalette[] = [
  { minElevation: 15, zenith: '#5d687b', horizon: '#a5a6b7' },
  { minElevation: 5, zenith: '#4d546b', horizon: '#95889e' },
  { minElevation: -1, zenith: '#3b344f', horizon: '#87697e' },
  { minElevation: -6, zenith: '#1c1731', horizon: '#55364e' },
  { minElevation: -90, zenith: '#05030f', horizon: '#0a0820' },
];

/**
 * EDIT: WMO天気コードと朝/夕フェーズから使うパレットテーブルを選ぶ。
 * 朝焼け(isDawn=true)と夕焼け(isDawn=false)で異なるパレットを返す。
 */
function selectPalettes(weatherCode: number | null, isDawn: boolean = false): SkyPalette[] {
  if (weatherCode === null || weatherCode <= 2) {
    return isDawn ? CLEAR_DAWN_PALETTES : CLEAR_DUSK_PALETTES;
  }
  if (weatherCode === 3 || weatherCode === 45 || weatherCode === 48) {
    return isDawn ? CLOUDY_DAWN_PALETTES : CLOUDY_DUSK_PALETTES;
  }
  if (weatherCode >= 71 && weatherCode <= 86) {
    return isDawn ? SNOWY_DAWN_PALETTES : SNOWY_DUSK_PALETTES;
  }
  if (weatherCode >= 51) {
    return isDawn ? RAINY_DAWN_PALETTES : RAINY_DUSK_PALETTES;
  }
  return isDawn ? CLOUDY_DAWN_PALETTES : CLOUDY_DUSK_PALETTES;
}

/** ADD: 仰角に合致するパレットを取得 */
function findPalette(palettes: SkyPalette[], elevation: number): SkyPalette {
  for (const p of palettes) {
    if (elevation >= p.minElevation) return p;
  }
  return palettes[palettes.length - 1] ?? palettes[0]!;
}

/**
 * ADD: 2つのhex色を0-1の割合で線形補間する。
 * パレット間の滑らかな遷移に使う。
 */
function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string): [number, number, number] => {
    const v = parseInt(hex.replace('#', ''), 16);
    return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  };
  const ca = parse(a);
  const cb = parse(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

/**
 * ADD: 隣接パレット間を滑らかに補間したグラデーションを生成する。
 */
function interpolatedPalette(
  palettes: SkyPalette[],
  elevation: number,
): { zenith: string; horizon: string } {
  const first = palettes[0];
  const last = palettes[palettes.length - 1];
  if (!first || !last) {
    return { zenith: '#0a4a8a', horizon: '#87ceeb' };
  }

  // ADD: 仰角がテーブルの最大以上/最小以下ならそのまま
  if (elevation >= first.minElevation) {
    return { zenith: first.zenith, horizon: first.horizon };
  }
  if (elevation <= last.minElevation) {
    return { zenith: last.zenith, horizon: last.horizon };
  }

  // ADD: 隣接する2パレット間を補間
  for (let i = 0; i < palettes.length - 1; i++) {
    const upper = palettes[i];
    const lower = palettes[i + 1];
    if (upper && lower && elevation >= lower.minElevation && elevation < upper.minElevation) {
      const range = upper.minElevation - lower.minElevation;
      const t = range > 0 ? (elevation - lower.minElevation) / range : 0;
      return {
        zenith: lerpColor(lower.zenith, upper.zenith, t),
        horizon: lerpColor(lower.horizon, upper.horizon, t),
      };
    }
  }

  return { zenith: first.zenith, horizon: first.horizon };
}

// ADD: ---- 公開API ----

export interface SkyGradient {
  /** ADD: 天頂(上)の色 */
  zenith: string;
  /** ADD: 地平線(下)の色 */
  horizon: string;
  /** ADD: CSSグラデーション文字列 */
  css: string;
  /** ADD: 計算に使った太陽仰角(deg) */
  elevation: number;
  /** ADD: 太陽が昇る途中(朝・午前=true)か、沈む途中(夕・午後=false)か */
  isDawn: boolean;
  /** ADD: 適用された天気コード (nullは晴天) */
  weatherCode: number | null;
}

/**
 * ADD: 雨が降る天気かどうかを判定する。
 * 霧雨(51-57), 雨(61-67), にわか雨(80-82), 雷雨(95-99)
 */
export function isRainyWeather(code: number | null): boolean {
  if (code === null) return false;
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99);
}

/**
 * ADD: 雪が降る天気かどうかを判定する。
 * 弱い雪(71), 雪(73), 強い雪(75), 雪あられ(77), にわか雪(85), 強いにわか雪(86)
 */
export function isSnowyWeather(code: number | null): boolean {
  if (code === null) return false;
  return code >= 71 && code <= 86;
}

/**
 * ADD: 雷が発生する天気かどうかを判定する。
 * 雷雨(95-99)
 */
export function isThunderWeather(code: number | null): boolean {
  if (code === null) return false;
  return code >= 95 && code <= 99;
}

/**
 * EDIT: 太陽の仰角・天気コード・朝夕フェーズから直接空のグラデーションを計算する。
 * デバッグプレビューやシミュレーションで使用する。
 *
 * @param elevation 太陽仰角 (deg: -90 ～ +90)
 * @param weatherCode WMO天気コード (nullなら晴天)
 * @param isDawn 朝焼け(true)か夕焼け(false)か (省略時はfalse)
 */
export function computeSkyGradientFromElevation(
  elevation: number,
  weatherCode: number | null = null,
  isDawn: boolean = false,
): SkyGradient {
  const palettes = selectPalettes(weatherCode, isDawn);
  const { zenith, horizon } = interpolatedPalette(palettes, elevation);

  return {
    zenith,
    horizon,
    css: `linear-gradient(180deg, ${zenith} 0%, ${horizon} 100%)`,
    elevation,
    isDawn,
    weatherCode,
  };
}

/**
 * EDIT: 現在の空のグラデーションを計算する。
 * 太陽の時角から朝焼け・夕焼けを自動判別してそれぞれに適した色彩を生成する。
 *
 * @param lat 緯度
 * @param lon 経度
 * @param weatherCode WMO天気コード(nullなら晴天として計算)
 * @param date 計算日時(省略時は現在)
 */
export function computeSkyGradient(
  lat: number,
  lon: number,
  weatherCode: number | null = null,
  date: Date = new Date(),
): SkyGradient {
  const { elevation, isDawn } = getSolarPosition(lat, lon, date);
  return computeSkyGradientFromElevation(elevation, weatherCode, isDawn);
}

// ADD: ---- 天気データの取得(Open-Meteo) ----

/**
 * ADD: Open-Meteo APIから現在の天気コードだけを軽量に取得する。
 * 天気ウィジェット(widgets/weather)と同じAPIだが、空の色計算に必要な
 * weather_codeだけを取得するので通信量は最小限。
 */
export async function fetchCurrentWeatherCode(
  lat: number,
  lon: number,
): Promise<number> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'weather_code');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`天気の取得に失敗しました(${res.status})`);
  const body = (await res.json()) as {
    current: { weather_code: number };
  };
  return body.current.weather_code;
}

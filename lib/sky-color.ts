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

/**
 * ADD: 太陽の仰角(elevation angle)を計算する。
 * 簡略化したソーラーポジション計算(精度は約1度、この用途には十分)。
 */
export function solarElevation(lat: number, lon: number, date: Date): number {
  // ADD: ユリウス日
  const jd =
    date.getTime() / 86400000 + 2440587.5;
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
  // ADD: 時角
  const ha = lst - ra;

  // ADD: 仰角
  const sinAlt =
    Math.sin(deg2rad(lat)) * Math.sin(dec) +
    Math.cos(deg2rad(lat)) * Math.cos(dec) * Math.cos(ha);

  return rad2deg(Math.asin(sinAlt));
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

/** ADD: 晴天時の空パレット(太陽仰角順) */
const CLEAR_PALETTES: SkyPalette[] = [
  // ADD: 真昼の青空
  { minElevation: 30, zenith: '#0a4a8a', horizon: '#87ceeb' },
  // ADD: 午前/午後の空
  { minElevation: 15, zenith: '#1a5a9a', horizon: '#7ec8e3' },
  // ADD: 朝/夕方の低い太陽
  { minElevation: 5, zenith: '#2d3a6e', horizon: '#e8a87c' },
  // ADD: 日の出/日没前後(ゴールデンアワー)
  { minElevation: -1, zenith: '#1a1a4e', horizon: '#f0946c' },
  // ADD: マジックアワー(太陽が地平線付近)
  { minElevation: -6, zenith: '#141033', horizon: '#d4637a' },
  // ADD: 薄明(市民薄明)
  { minElevation: -12, zenith: '#0d0a24', horizon: '#6a3b6e' },
  // ADD: 航海薄明
  { minElevation: -18, zenith: '#080618', horizon: '#2a1a3a' },
  // ADD: 夜
  { minElevation: -90, zenith: '#05030f', horizon: '#0a0820' },
];

/** ADD: 曇天時のパレット */
const CLOUDY_PALETTES: SkyPalette[] = [
  { minElevation: 15, zenith: '#5a6a7a', horizon: '#8a9aaa' },
  { minElevation: 5, zenith: '#4a5a6a', horizon: '#7a8a9a' },
  { minElevation: -1, zenith: '#3a3a4e', horizon: '#6a5a60' },
  { minElevation: -6, zenith: '#1a1a30', horizon: '#4a3a4a' },
  { minElevation: -12, zenith: '#0d0a1e', horizon: '#2a1a30' },
  { minElevation: -90, zenith: '#05030f', horizon: '#0a0820' },
];

/** ADD: 雨天時のパレット */
const RAINY_PALETTES: SkyPalette[] = [
  { minElevation: 15, zenith: '#3a4a5a', horizon: '#6a7a8a' },
  { minElevation: 5, zenith: '#2a3a4a', horizon: '#5a6a7a' },
  { minElevation: -1, zenith: '#1a2a3a', horizon: '#4a4a5a' },
  { minElevation: -6, zenith: '#0f1520', horizon: '#2a2a3a' },
  { minElevation: -90, zenith: '#05030f', horizon: '#0a0820' },
];

/** ADD: 雪の日のパレット */
const SNOWY_PALETTES: SkyPalette[] = [
  { minElevation: 15, zenith: '#5a6a80', horizon: '#a0aab8' },
  { minElevation: 5, zenith: '#4a5a70', horizon: '#8a9aa8' },
  { minElevation: -1, zenith: '#3a3a50', horizon: '#7a6a78' },
  { minElevation: -6, zenith: '#1a1a30', horizon: '#4a3a4a' },
  { minElevation: -90, zenith: '#05030f', horizon: '#0a0820' },
];

/**
 * ADD: WMO天気コードから使うパレットテーブルを選ぶ。
 * コードの分類: 0-2=晴/薄曇, 3=曇, 45-48=霧, 51-67=雨系, 71-86=雪系, 95-99=雷雨
 */
function selectPalettes(weatherCode: number | null): SkyPalette[] {
  if (weatherCode === null) return CLEAR_PALETTES;
  if (weatherCode <= 2) return CLEAR_PALETTES;
  if (weatherCode === 3 || weatherCode === 45 || weatherCode === 48) return CLOUDY_PALETTES;
  if (weatherCode >= 71 && weatherCode <= 86) return SNOWY_PALETTES;
  if (weatherCode >= 51) return RAINY_PALETTES;
  return CLOUDY_PALETTES;
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
 * ADD: 雷が発生する天気かどうかを判定する。
 * 雷雨(95-99)
 */
export function isThunderWeather(code: number | null): boolean {
  if (code === null) return false;
  return code >= 95 && code <= 99;
}

/**
 * ADD: 太陽の仰角と天気コードから直接空のグラデーションを計算する。
 * デバッグプレビューやシミュレーションで使用する。
 *
 * @param elevation 太陽仰角 (deg: -90 ～ +90)
 * @param weatherCode WMO天気コード (nullなら晴天)
 */
export function computeSkyGradientFromElevation(
  elevation: number,
  weatherCode: number | null = null,
): SkyGradient {
  const palettes = selectPalettes(weatherCode);
  const { zenith, horizon } = interpolatedPalette(palettes, elevation);

  return {
    zenith,
    horizon,
    css: `linear-gradient(180deg, ${zenith} 0%, ${horizon} 100%)`,
    elevation,
    weatherCode,
  };
}

/**
 * ADD: 現在の空のグラデーションを計算する。
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
  const elevation = solarElevation(lat, lon, date);
  return computeSkyGradientFromElevation(elevation, weatherCode);
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

/**
 * ADD: 空背景の設定管理と更新ロジック。
 *
 * 空背景モード('sky')が有効な場合、一定間隔で太陽の仰角と天気を再計算し、
 * CSSグラデーションを更新する。地域設定はBackgroundConfig.skyに永続化される。
 */

import { cached } from '@/lib/cache';
import { computeSkyGradient, fetchCurrentWeatherCode, type SkyGradient } from '@/lib/sky-color';
import type { SkyConfig } from '@/lib/types';

/** ADD: 天気コードのキャッシュTTL(30分) */
const WEATHER_CODE_TTL_MS = 30 * 60 * 1000;

/**
 * ADD: 現在の空グラデーションを計算する。
 * 天気データは30分キャッシュするが、太陽の仰角は毎回再計算する。
 */
export async function getCurrentSkyGradient(sky: SkyConfig): Promise<SkyGradient> {
  if (!sky.latitude || !sky.longitude) {
    // ADD: 緯度経度が未設定の場合はデフォルト(東京)で計算
    return computeSkyGradient(35.6762, 139.6503, null);
  }

  let weatherCode: number | null = null;

  if (sky.useWeather) {
    try {
      const key = `sky-weather:${sky.latitude}:${sky.longitude}`;
      const result = await cached(key, WEATHER_CODE_TTL_MS, () =>
        fetchCurrentWeatherCode(sky.latitude, sky.longitude),
      );
      weatherCode = result.data;
    } catch {
      // ADD: 天気取得失敗時は晴天として計算
    }
  }

  return computeSkyGradient(sky.latitude, sky.longitude, weatherCode);
}

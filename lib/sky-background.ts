/**
 * ADD: 空背景の設定管理と更新ロジック。
 *
 * 空背景モード('sky')が有効な場合、一定間隔で太陽の仰角と天気を再計算し、
 * CSSグラデーションを更新する。地域設定はBackgroundConfig.skyに永続化される。
 */

import { cached } from '@/lib/cache';
import {
  computeSkyGradient,
  computeSkyGradientFromElevation,
  fetchCurrentWeatherCode,
  type SkyGradient,
} from '@/lib/sky-color'; // EDIT: computeSkyGradientFromElevationを追加
import type { SkyConfig } from '@/lib/types';

/** ADD: 天気コードのキャッシュTTL(30分) */
const WEATHER_CODE_TTL_MS = 30 * 60 * 1000;

/**
 * ADD: 現在の空グラデーションを計算する。
 * デバッグモードが有効な場合は、指定された仰角と天気コードで直接計算する。
 * 天気データは30分キャッシュするが、太陽の仰角は毎回再計算する。
 */
export async function getCurrentSkyGradient(sky: SkyConfig): Promise<SkyGradient> {
  // ADD: デバッグオーバーライドが有効な場合は指定値で即座に計算
  if (sky.debug?.enabled) {
    return computeSkyGradientFromElevation(
      sky.debug.elevation,
      sky.useWeather ? sky.debug.weatherCode : null,
    );
  }

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

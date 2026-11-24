import { useRef, useState, useCallback, useMemo } from 'react'; // EDIT: useMemoを追加
import { ArrowRight, Upload, MapPin, Loader2, Check, Bug, Sun, CloudRain, Moon, Sparkles, Clock, Sunrise, Sunset } from 'lucide-react'; // EDIT: Clock, Sunrise, Sunset追加

import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { NumberStepper } from '@/components/NumberStepper/NumberStepper';
import { cx } from '@/lib/cx';
import type { BackgroundConfig, SkyConfig, SkyDebugConfig } from '@/lib/types';
import { geocodeCity } from '@/widgets/weather/open-meteo';
import {
  computeSkyGradientFromElevation,
  timeToSolarPosition, // ADD: timeToSolarPosition
  isRainyWeather,
  isThunderWeather,
  isSnowyWeather, // ADD: isSnowyWeather
  getMoonPhase,
  getStarVisibility,
} from '@/lib/sky-color'; // EDIT: 朝焼け・夕焼け・時刻対応の関数を追加

import styles from './background-editor.module.css';
import fieldStyles from '../Field/field.module.css';

interface BackgroundEditorProps {
  value: BackgroundConfig;
  onChange: (value: BackgroundConfig) => void;
}

/**
 * 背景設定の専用エディタ。
 *
 * 単色・グラデーション・画像の3方式を「同時に」保持し、`active` でどれを
 * 使うかだけを切り替える（lib/types.ts の BackgroundConfig 参照）。
 * 以前は type によるユニオン型で1方式分の値しか持てず、タブを切り替えるたびに
 * 前の設定（色や画像）が失われるバグがあった。この形にしたことで、
 * 単色→画像→単色と行き来しても、それぞれ直前に入力した内容のまま残る。
 */
export function BackgroundEditor({ value, onChange }: BackgroundEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ADD: デバッグ設定の取得と更新ヘルパー
  const debugConfig: SkyDebugConfig = useMemo(
    () => value.sky.debug ?? { enabled: false, elevation: 45, weatherCode: 0, timeOfDay: 12.0, isDawn: false },
    [value.sky.debug],
  );

  const updateDebug = useCallback(
    (patch: Partial<SkyDebugConfig>) => {
      const nextDebug: SkyDebugConfig = { ...debugConfig, ...patch };
      onChange({
        ...value,
        sky: {
          ...value.sky,
          debug: nextDebug,
        },
      });
    },
    [debugConfig, onChange, value],
  );

  // ADD: 現在の朝焼け・夕焼け状態
  const isDawnState = debugConfig.isDawn ?? (debugConfig.timeOfDay !== undefined ? debugConfig.timeOfDay < 12 : false);

  // ADD: デバッグプレビュー用のグラデーションCSS
  const debugGradient = useMemo(() => {
    return computeSkyGradientFromElevation(
      debugConfig.elevation,
      value.sky.useWeather ? debugConfig.weatherCode : null,
      isDawnState,
    );
  }, [debugConfig.elevation, debugConfig.weatherCode, isDawnState, value.sky.useWeather]);

  // ADD: 24時間時刻の表示フォーマッター
  const formatTimeLabel = useCallback((t: number): string => {
    const hours = Math.floor(t);
    const minutes = Math.round((t - hours) * 60);
    const mStr = minutes.toString().padStart(2, '0');
    if (t >= 24) return '24:00 (深夜)';
    if (t === 0) return '0:00 (深夜)';
    if (t < 5) return `${hours}:${mStr} (未明)`;
    if (t < 7) return `${hours}:${mStr} (日の出・朝焼け)`;
    if (t < 11) return `${hours}:${mStr} (午前)`;
    if (t < 14) return `${hours}:${mStr} (正午・真昼)`;
    if (t < 17) return `${hours}:${mStr} (午後)`;
    if (t < 19) return `${hours}:${mStr} (日没・夕焼け)`;
    if (t < 21) return `${hours}:${mStr} (薄暮・黄昏)`;
    return `${hours}:${mStr} (夜)`;
  }, []);

  // ADD: 時刻変更ハンドラー (太陽仰角と朝/夕フェーズを自動連動)
  const handleTimeChange = useCallback(
    (time: number) => {
      const { elevation, isDawn } = timeToSolarPosition(time);
      updateDebug({
        timeOfDay: time,
        elevation: Math.round(elevation),
        isDawn,
      });
    },
    [updateDebug],
  );

  // ADD: 代表的な24時間ループ時刻プリセット (端0:00と端24:00で深夜として繋がる)
  const TIME_PRESETS = [
    { label: '深夜 (0:00)', time: 0 },
    { label: '未明 (4:30)', time: 4.5 },
    { label: '朝焼け (6:00)', time: 6.0 },
    { label: '午前 (9:00)', time: 9.0 },
    { label: '真昼 (12:00)', time: 12.0 },
    { label: '午後 (15:00)', time: 15.0 },
    { label: '夕焼け (18:00)', time: 18.0 },
    { label: '薄暮 (19:30)', time: 19.5 },
    { label: '夜 (22:00)', time: 22.0 },
    { label: '深夜 (24:00)', time: 24.0 },
  ];

  // ADD: 代表的な時間帯プリセット
  const ELEVATION_PRESETS = [
    { label: '真昼', elevation: 45 },
    { label: '午後', elevation: 20 },
    { label: '夕方', elevation: 5 },
    { label: '日没', elevation: -1 },
    { label: '薄暮', elevation: -6 },
    { label: '薄明', elevation: -12 },
    { label: '夜', elevation: -45 },
  ];

  // ADD: 代表的な月相プリセット
  const MOON_PRESETS = [
    { label: 'リアルタイム', phase: undefined },
    { label: '新月', phase: 0.0 },
    { label: '三日月', phase: 0.15 },
    { label: '上弦', phase: 0.25 },
    { label: '十三夜', phase: 0.38 },
    { label: '満月', phase: 0.5 },
    { label: '下弦', phase: 0.75 },
    { label: '有明月', phase: 0.88 },
  ];

  // ADD: 現在の星空と月の状態
  const starVis = useMemo(() => {
    return getStarVisibility(
      debugConfig.elevation,
      value.sky.useWeather ? debugConfig.weatherCode : 0,
    );
  }, [debugConfig.elevation, debugConfig.weatherCode, value.sky.useWeather]);

  const currentMoon = useMemo(() => {
    return getMoonPhase(new Date(), debugConfig.moonPhase);
  }, [debugConfig.moonPhase]);
  const WEATHER_PRESETS = [
    { label: '快晴 (0)', code: 0 },
    { label: '一部曇り (2)', code: 2 },
    { label: '曇天 (3)', code: 3 },
    { label: '霧 (45)', code: 45 },
    { label: '弱い霧雨 (51) [雨量:少]', code: 51 },
    { label: '雨 (63) [雨量:中]', code: 63 },
    { label: '激しい雨 (65) [雨量:多]', code: 65 },
    { label: '弱い雪 (71) [粉雪]', code: 71 },
    { label: '雪 (73) [通常]', code: 73 },
    { label: '強い雪 (75) [大粒]', code: 75 },
    { label: '雷雨 (95) [稲妻+雨]', code: 95 },
    { label: '激しい雷雨 (99) [稲妻+豪雨]', code: 99 },
  ];
  // ADD: 空背景の地名検索状態
  const [skySearching, setSkySearching] = useState(false);
  const [skyError, setSkyError] = useState<string | null>(null);
  const [skyResolved, setSkyResolved] = useState<string | null>(
    value.sky.cityName ? `${value.sky.cityName} (${value.sky.latitude.toFixed(2)}, ${value.sky.longitude.toFixed(2)})` : null,
  );

  // ADD: 地名から緯度経度を検索してsky設定を更新する
  const handleSkySearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        setSkyError('地名を入力してください');
        return;
      }

      setSkySearching(true);
      setSkyError(null);

      try {
        const result = await geocodeCity(trimmed, 'ja');
        if (!result) {
          setSkyError(`「${trimmed}」が見つかりませんでした`);
          setSkySearching(false);
          return;
        }

        const skyConfig: SkyConfig = {
          cityName: trimmed,
          latitude: result.latitude,
          longitude: result.longitude,
          useWeather: value.sky.useWeather,
        };

        const displayName = [result.name, result.admin1, result.country].filter(Boolean).join(', ');
        setSkyResolved(`${displayName} (${result.latitude.toFixed(2)}, ${result.longitude.toFixed(2)})`);

        onChange({
          ...value,
          active: 'sky',
          sky: skyConfig,
        });
      } catch (err) {
        setSkyError(err instanceof Error ? err.message : '検索に失敗しました');
      } finally {
        setSkySearching(false);
      }
    },
    [value, onChange],
  );

  const handleFile = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      onChange({
        ...value,
        active: 'image',
        image: { ...value.image, src: reader.result },
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div className={styles.tabs}>
        <button
          type="button"
          className={cx(styles.tab, value.active === 'solid' && styles.tabActive)}
          onClick={() => onChange({ ...value, active: 'solid' })}
        >
          単色
        </button>
        <button
          type="button"
          className={cx(styles.tab, value.active === 'gradient' && styles.tabActive)}
          onClick={() => onChange({ ...value, active: 'gradient' })}
        >
          グラデーション
        </button>
        <button
          type="button"
          className={cx(styles.tab, value.active === 'image' && styles.tabActive)}
          onClick={() => onChange({ ...value, active: 'image' })}
        >
          画像
        </button>
        {/* ADD: 空タブ */}
        <button
          type="button"
          className={cx(styles.tab, value.active === 'sky' && styles.tabActive)}
          onClick={() => onChange({ ...value, active: 'sky' })}
        >
          空
        </button>
      </div>

      {value.active === 'solid' && (
        <ColorPicker
          value={value.solid.color}
          onChange={(color) => onChange({ ...value, solid: { color } })}
        />
      )}

      {value.active === 'gradient' && (
        <>
          <div
            className={styles.gradientPreview}
            style={{
              background: `linear-gradient(${value.gradient.angle}deg, ${value.gradient.from}, ${value.gradient.to})`,
            }}
          />
          <div className={styles.row}>
            <ColorPicker
              value={value.gradient.from}
              onChange={(from) => onChange({ ...value, gradient: { ...value.gradient, from } })}
            />
            <ArrowRight size={16} className={styles.arrow} aria-hidden />
            <ColorPicker
              value={value.gradient.to}
              onChange={(to) => onChange({ ...value, gradient: { ...value.gradient, to } })}
            />
          </div>
          <div className={fieldStyles.field}>
            <label className={fieldStyles.label}>角度</label>
            <NumberStepper
              value={value.gradient.angle}
              min={0}
              max={360}
              onChange={(angle) => onChange({ ...value, gradient: { ...value.gradient, angle } })}
            />
          </div>
        </>
      )}

      {value.active === 'image' && (
        <>
          {value.image.src && (
            <div className={styles.thumb} style={{ backgroundImage: `url("${value.image.src}")` }} />
          )}
          <button
            type="button"
            className={styles.fileButton}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={15} /> 画像をアップロード
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
          <div className={fieldStyles.field}>
            <label className={fieldStyles.label}>外部URLを直接指定</label>
            <input
              type="text"
              className={fieldStyles.control}
              placeholder="https://..."
              defaultValue={value.image.src.startsWith('data:') ? '' : value.image.src}
              onBlur={(e) => {
                const src = e.target.value.trim();
                if (src) onChange({ ...value, image: { ...value.image, src } });
              }}
            />
            <span className={fieldStyles.help}>
              外部サイトの画像を使う場合、そのサイトへの通信が発生します。
            </span>
          </div>
          <div className={fieldStyles.field}>
            <label className={fieldStyles.label}>下地の色（画像読み込み前・失敗時）</label>
            <ColorPicker
              value={value.image.fallbackColor}
              onChange={(fallbackColor) =>
                onChange({ ...value, image: { ...value.image, fallbackColor } })
              }
            />
          </div>
          <div className={fieldStyles.field}>
            <label className={fieldStyles.label}>ぼかし（px）</label>
            <NumberStepper
              value={value.image.blur}
              min={0}
              max={40}
              onChange={(blur) => onChange({ ...value, image: { ...value.image, blur } })}
            />
          </div>
          <div className={fieldStyles.field}>
            <label className={fieldStyles.label}>暗さ（0〜1）</label>
            <NumberStepper
              value={value.image.dim}
              min={0}
              max={1}
              step={0.05}
              onChange={(dim) => onChange({ ...value, image: { ...value.image, dim } })}
            />
          </div>
        </>
      )}

      {/* ADD: 空背景モードの設定UI */}
      {value.active === 'sky' && (
        <>
          <div className={fieldStyles.field}>
            <label className={fieldStyles.label}>
              <MapPin size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
              地域を設定
            </label>
            <div className={styles.row}>
              <input
                type="text"
                className={fieldStyles.control}
                placeholder="例: Tokyo, Osaka, New York"
                defaultValue={value.sky.cityName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void handleSkySearch((e.target as HTMLInputElement).value);
                  }
                }}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== value.sky.cityName) {
                    void handleSkySearch(v);
                  }
                }}
              />
            </div>
            <span className={fieldStyles.help}>
              地名を入力してEnterで検索。漢字よりローマ字表記の方が見つかりやすいです。
            </span>
          </div>

          {skySearching && (
            <div className={styles.skyStatus}>
              <Loader2 size={14} className={styles.spinner} />
              <span>検索中…</span>
            </div>
          )}

          {skyError && (
            <div className={styles.skyError}>{skyError}</div>
          )}

          {skyResolved && !skySearching && !skyError && (
            <div className={styles.skyStatus}>
              <Check size={14} />
              <span>{skyResolved}</span>
            </div>
          )}

          <div className={fieldStyles.field}>
            <label className={fieldStyles.label}>天気に連動</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className={cx(
                  styles.tab,
                  value.sky.useWeather && styles.tabActive,
                )}
                style={{ flex: '0 0 auto', padding: '6px 16px' }}
                onClick={() =>
                  onChange({
                    ...value,
                    sky: { ...value.sky, useWeather: true },
                  })
                }
              >
                ON
              </button>
              <button
                type="button"
                className={cx(
                  styles.tab,
                  !value.sky.useWeather && styles.tabActive,
                )}
                style={{ flex: '0 0 auto', padding: '6px 16px' }}
                onClick={() =>
                  onChange({
                    ...value,
                    sky: { ...value.sky, useWeather: false },
                  })
                }
              >
                OFF
              </button>
            </div>
            <span className={fieldStyles.help}>
              ONにすると曇り・雨・雪で空の色が変わります。OFFだと常に晴天として計算します。
            </span>
          </div>

          {/* ADD: デバッグ・シミュレーションUI */}
          <div className={styles.debugSection}>
            <div className={styles.debugHeader}>
              <label className={fieldStyles.label} style={{ marginBottom: 0 }}>
                <Bug size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                デバッグプレビュー (手動シミュレーション)
              </label>
              <button
                type="button"
                className={cx(
                  styles.tab,
                  debugConfig.enabled && styles.tabActive,
                )}
                style={{ flex: '0 0 auto', padding: '4px 12px', fontSize: 11 }}
                onClick={() => updateDebug({ enabled: !debugConfig.enabled })}
              >
                {debugConfig.enabled ? 'ON (画面に適用中)' : 'OFF'}
              </button>
            </div>
            <span className={fieldStyles.help}>
              太陽の仰角や天気を自由に変更して、空の色の変化をシミュレーション・確認できます。
            </span>

            {/* ADD: ミニプレビュー枠 */}
            <div
              className={styles.debugPreview}
              style={{ background: debugGradient.css }}
            >
              <div className={styles.debugBadge}>
                <span>時刻: {formatTimeLabel(debugConfig.timeOfDay ?? 12)}</span>
                <span style={{ color: isDawnState ? '#fde047' : '#fb923c' }}>
                  {isDawnState ? '🌅 朝焼け (昇り)' : '🌇 夕焼け (沈み)'}
                </span>
                <span>仰角: {debugConfig.elevation}°</span>
                <span>天頂: {debugGradient.zenith}</span>
                <span>地平線: {debugGradient.horizon}</span>
                {/* ADD: 星・月の状態表示 */}
                {starVis.nightAlpha > 0.1 && (
                  <>
                    {starVis.weatherAlpha > 0.1 ? (
                      <span style={{ color: '#fef08a' }}>
                        {starVis.quality === 'brilliant' ? '✨ 最もきれいな星 (快晴)' : '⭐ 星空 (晴れ)'}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>☁ 星・月は曇天で見えず</span>
                    )}
                    {starVis.weatherAlpha > 0.1 && (
                      <span style={{ color: '#fef08a' }}>🌙 {currentMoon.name} (月相: {Math.round(currentMoon.fraction * 100)}%)</span>
                    )}
                  </>
                )}
                {value.sky.useWeather && isThunderWeather(debugConfig.weatherCode) && (
                  <span style={{ color: '#93c5fd' }}>⚡ 稲妻描画 (点滅なし)</span>
                )}
                {value.sky.useWeather && isRainyWeather(debugConfig.weatherCode) && (
                  <span style={{ color: '#93c5fd' }}>🌧 雨描画</span>
                )}
                {/* ADD: 雪描画バッジ */}
                {value.sky.useWeather && isSnowyWeather(debugConfig.weatherCode) && (
                  <span style={{ color: '#e0f2fe' }}>❄ 雪描画 (舞い落ちる雪)</span>
                )}
              </div>
            </div>

            {/* ADD: 24時間時刻シミュレーション (端と端が深夜で繋がるループスライダー) */}
            <div className={fieldStyles.field}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className={fieldStyles.label}>
                  <Clock size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                  24時間ループ時刻 ({formatTimeLabel(debugConfig.timeOfDay ?? 12)})
                </label>
              </div>
              <input
                type="range"
                className={styles.slider}
                min={0}
                max={24}
                step={0.25}
                value={debugConfig.timeOfDay ?? 12}
                onChange={(e) => handleTimeChange(Number(e.target.value))}
              />
              <span className={fieldStyles.help}>
                左端 (0:00) と右端 (24:00) が同じ深夜として綺麗に繋がります。朝焼けと夕焼けの色の違いも自然に再現されます。
              </span>
              <div className={styles.presetGrid}>
                {TIME_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={cx(
                      styles.presetButton,
                      Math.abs((debugConfig.timeOfDay ?? 12) - preset.time) < 0.2 && styles.presetButtonActive,
                    )}
                    onClick={() => handleTimeChange(preset.time)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ADD: 朝焼け・夕焼けフェーズの切り替え & 太陽仰角の微調整 */}
            <div className={fieldStyles.field}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className={fieldStyles.label}>
                  <Sun size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                  太陽の仰角 ({debugConfig.elevation}°) & 朝・夕フェーズ
                </label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className={cx(
                      styles.tab,
                      isDawnState && styles.tabActive,
                    )}
                    style={{ flex: '0 0 auto', padding: '3px 8px', fontSize: 11 }}
                    onClick={() => updateDebug({ isDawn: true })}
                  >
                    <Sunrise size={11} style={{ marginRight: 3, verticalAlign: -1 }} />
                    朝焼け (昇り)
                  </button>
                  <button
                    type="button"
                    className={cx(
                      styles.tab,
                      !isDawnState && styles.tabActive,
                    )}
                    style={{ flex: '0 0 auto', padding: '3px 8px', fontSize: 11 }}
                    onClick={() => updateDebug({ isDawn: false })}
                  >
                    <Sunset size={11} style={{ marginRight: 3, verticalAlign: -1 }} />
                    夕焼け (沈み)
                  </button>
                </div>
              </div>
              <input
                type="range"
                className={styles.slider}
                min={-90}
                max={90}
                step={1}
                value={debugConfig.elevation}
                onChange={(e) => updateDebug({ elevation: Number(e.target.value) })}
              />
              <div className={styles.presetGrid}>
                {ELEVATION_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={cx(
                      styles.presetButton,
                      debugConfig.elevation === preset.elevation && styles.presetButtonActive,
                    )}
                    onClick={() => updateDebug({ elevation: preset.elevation })}
                  >
                    {preset.label} ({preset.elevation}°)
                  </button>
                ))}
              </div>
            </div>

            {/* ADD: 天気コードの調整 */}
            <div className={fieldStyles.field}>
              <label className={fieldStyles.label}>
                <CloudRain size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                天気のコード
              </label>
              <div className={styles.row}>
                <select
                  className={fieldStyles.control}
                  value={debugConfig.weatherCode}
                  onChange={(e) => updateDebug({ weatherCode: Number(e.target.value) })}
                >
                  {WEATHER_PRESETS.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <div style={{ flex: '0 0 90px' }}>
                  <input
                    type="number"
                    className={fieldStyles.control}
                    placeholder="WMOコード"
                    value={debugConfig.weatherCode}
                    onChange={(e) => updateDebug({ weatherCode: Number(e.target.value) })}
                  />
                </div>
              </div>
              <span className={fieldStyles.help}>
                WMOコード: 0=快晴, 1-2=一部晴れ, 3=曇り, 45=霧, 51-67=雨, 71-86=雪, 95=雷雨
              </span>
            </div>

            {/* ADD: 高精度月相のシミュレーション */}
            <div className={fieldStyles.field}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className={fieldStyles.label}>
                  <Moon size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                  月相のシミュレーション ({currentMoon.name}・月齢 {currentMoon.age.toFixed(2)}日・輝面比 {(currentMoon.fraction * 100).toFixed(1)}%)
                </label>
              </div>

              {/* ADD: 連続月相スライダー (0% ～ 100%) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="range"
                  className={styles.slider}
                  min={0}
                  max={100}
                  step={0.5}
                  value={
                    typeof debugConfig.moonPhase === 'number'
                      ? Math.round(debugConfig.moonPhase * 100)
                      : Math.round(currentMoon.phase * 100)
                  }
                  onChange={(e) => updateDebug({ moonPhase: Number(e.target.value) / 100 })}
                />
                <span style={{ fontSize: 11, fontFamily: 'var(--ant-mono)', minWidth: 44, textAlign: 'right' }}>
                  {typeof debugConfig.moonPhase === 'number'
                    ? `${(debugConfig.moonPhase * 100).toFixed(1)}%`
                    : '自動'}
                </span>
              </div>

              <div className={styles.presetGrid}>
                {MOON_PRESETS.map((m) => (
                  <button
                    key={m.label}
                    type="button"
                    className={cx(
                      styles.presetButton,
                      debugConfig.moonPhase === m.phase && styles.presetButtonActive,
                    )}
                    onClick={() => updateDebug({ moonPhase: m.phase })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <span className={fieldStyles.help}>
                スライダーで月相(0%新月～50%満月～100%新月)を連続的に精密調整できます。「リアルタイム」で現在日時の天文学的計算に戻ります。
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

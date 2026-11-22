import { useRef, useState, useCallback, useMemo } from 'react'; // EDIT: useMemoを追加
import { ArrowRight, Upload, MapPin, Loader2, Check, Bug, Sun, CloudRain } from 'lucide-react'; // EDIT: アイコン追加

import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { NumberStepper } from '@/components/NumberStepper/NumberStepper';
import { cx } from '@/lib/cx';
import type { BackgroundConfig, SkyConfig, SkyDebugConfig } from '@/lib/types'; // EDIT: SkyDebugConfigを追加
import { geocodeCity } from '@/widgets/weather/open-meteo';
import { computeSkyGradientFromElevation, isRainyWeather, isThunderWeather } from '@/lib/sky-color'; // ADD: デバッグ用計算と天気判定

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
    () => value.sky.debug ?? { enabled: false, elevation: 45, weatherCode: 0 },
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

  // ADD: デバッグプレビュー用のグラデーションCSS
  const debugGradient = useMemo(() => {
    return computeSkyGradientFromElevation(
      debugConfig.elevation,
      value.sky.useWeather ? debugConfig.weatherCode : null,
    );
  }, [debugConfig.elevation, debugConfig.weatherCode, value.sky.useWeather]);

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

  // ADD: 代表的な天気コードプリセット
  const WEATHER_PRESETS = [
    { label: '快晴 (0)', code: 0 },
    { label: '一部曇り (2)', code: 2 },
    { label: '曇天 (3)', code: 3 },
    { label: '霧 (45)', code: 45 },
    { label: '雨 (63)', code: 63 },
    { label: '雪 (73)', code: 73 },
    { label: '雷雨 (95)', code: 95 },
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
                <span>仰角: {debugConfig.elevation}°</span>
                <span>天頂: {debugGradient.zenith}</span>
                <span>地平線: {debugGradient.horizon}</span>
                {value.sky.useWeather && isThunderWeather(debugConfig.weatherCode) && (
                  <span style={{ color: '#93c5fd' }}>⚡ 稲妻描画 (点滅なし)</span>
                )}
                {value.sky.useWeather && isRainyWeather(debugConfig.weatherCode) && (
                  <span style={{ color: '#93c5fd' }}>🌧 雨描画</span>
                )}
              </div>
            </div>

            {/* ADD: 太陽仰角の調整 */}
            <div className={fieldStyles.field}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className={fieldStyles.label}>
                  <Sun size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                  太陽の仰角 ({debugConfig.elevation}°)
                </label>
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
          </div>
        </>
      )}
    </div>
  );
}

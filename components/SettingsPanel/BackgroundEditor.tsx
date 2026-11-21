import { useRef, useState, useCallback } from 'react'; // EDIT: useState, useCallbackを追加
import { ArrowRight, Upload, MapPin, Loader2, Check } from 'lucide-react'; // EDIT: MapPin, Loader2, Checkを追加

import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { NumberStepper } from '@/components/NumberStepper/NumberStepper';
import { cx } from '@/lib/cx';
import type { BackgroundConfig, SkyConfig } from '@/lib/types'; // EDIT: SkyConfigを追加
import { geocodeCity } from '@/widgets/weather/open-meteo'; // ADD: ジオコーディング

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
        </>
      )}
    </div>
  );
}

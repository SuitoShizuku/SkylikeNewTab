import { useEffect, useState, useCallback, useRef } from 'react'; // EDIT: useState, useCallback, useRefを追加

import { AddWidgetList } from '@/components/AddWidgetList/AddWidgetList';
import { Grid } from '@/components/Grid/Grid';
import { SidePanel } from '@/components/SidePanel/SidePanel';
import { ThemeSettingsPanel } from '@/components/SettingsPanel/ThemeSettingsPanel';
import { WidgetSettingsPanel } from '@/components/SettingsPanel/WidgetSettingsPanel';
import { Toolbar } from '@/components/Toolbar/Toolbar';
import { useAppStore } from '@/lib/store';
import { imageOverlayStyle } from '@/lib/theme';
import { getCurrentSkyGradient } from '@/lib/sky-background'; // ADD: 空背景
import { SkyWeatherCanvas } from '@/components/SkyEffects/SkyWeatherCanvas'; // ADD: 雨・雷描画キャンバス

/** 開いているパネルに対応する見出しと中身。 */
function PanelContent() {
  const panel = useAppStore((s) => s.panel);
  const closePanel = useAppStore((s) => s.closePanel);

  if (!panel) return null;

  switch (panel.kind) {
    case 'add':
      return (
        <SidePanel title="ウィジェットを追加" onClose={closePanel}>
          <AddWidgetList />
        </SidePanel>
      );
    case 'widget':
      return (
        <SidePanel title="ウィジェットの設定" onClose={closePanel}>
          <WidgetSettingsPanel instanceId={panel.instanceId} />
        </SidePanel>
      );
    case 'theme':
      return (
        <SidePanel title="見た目の設定" onClose={closePanel}>
          <ThemeSettingsPanel />
        </SidePanel>
      );
  }
}

export function App() {
  const ready = useAppStore((s) => s.ready);
  const init = useAppStore((s) => s.init);
  const background = useAppStore((s) => s.state.theme.background);
  const editMode = useAppStore((s) => s.editMode);
  const setEditMode = useAppStore((s) => s.setEditMode);

  // ADD: 空背景のCSS文字列と現在の天気コードを保持するstate
  const [skyGradientCss, setSkyGradientCss] = useState<string | null>(null);
  const [skyWeatherCode, setSkyWeatherCode] = useState<number | null>(null);
  const skyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ADD: 空背景の更新関数
  const updateSkyGradient = useCallback(async () => {
    if (background.active !== 'sky') return;
    try {
      const gradient = await getCurrentSkyGradient(background.sky);
      setSkyGradientCss(gradient.css);
      setSkyWeatherCode(gradient.weatherCode);
    } catch {
      // ADD: エラー時は前回の値を維持
    }
  }, [background.active, background.sky]);

  // ADD: 空背景モードの定期更新(1分間隔)
  useEffect(() => {
    if (background.active !== 'sky') {
      setSkyGradientCss(null);
      setSkyWeatherCode(null);
      if (skyTimerRef.current) {
        clearInterval(skyTimerRef.current);
        skyTimerRef.current = null;
      }
      return;
    }

    void updateSkyGradient();
    skyTimerRef.current = setInterval(() => {
      void updateSkyGradient();
    }, 60_000); // ADD: 1分ごとに更新

    return () => {
      if (skyTimerRef.current) {
        clearInterval(skyTimerRef.current);
        skyTimerRef.current = null;
      }
    };
  }, [background.active, background.sky, updateSkyGradient]);

  useEffect(() => {
    void init();
  }, [init]);

  // Escape で編集モードを抜けられるようにする（パネルが開いている場合はパネル側が先に処理する）
  useEffect(() => {
    if (!editMode) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setEditMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editMode, setEditMode]);

  // storage の読み込みが終わるまでは何も描かない。
  // 背景は boot.js が既に塗っているため、ここが空でも白い画面にはならない。
  if (!ready) return null;

  const overlay = imageOverlayStyle(background);

  return (
    <>
      {background.active === 'image' && background.image.src && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            backgroundImage: `url("${background.image.src}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}
      {/* ADD: 空背景のグラデーション描画 */}
      {background.active === 'sky' && skyGradientCss && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            background: skyGradientCss,
            // EDIT: デバッグ中は即座に反映、通常時は60秒かけて滑らかに遷移
            transition: background.sky.debug?.enabled ? 'none' : 'background 60s linear',
          }}
        />
      )}
      {/* ADD: 空背景時の雨・雷エフェクト (点滅なしの稲妻ライン描画) */}
      {background.active === 'sky' && (
        <SkyWeatherCanvas weatherCode={skyWeatherCode} />
      )}
      {overlay && (
        <div
          aria-hidden
          style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', ...overlay }}
        />
      )}

      <Grid />
      <Toolbar />
      <PanelContent />
    </>
  );
}

// ADD: 翻訳ウィジェットの実装

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Copy,
  ExternalLink,
  Languages,
  Loader2,
  Volume2,
  X,
} from 'lucide-react';

import { PermissionGate } from '@/components/PermissionGate/PermissionGate';
import { cx } from '@/lib/cx';
import { defineWidget, type WidgetProps } from '@/widgets/types';

import {
  fetchTranslation,
  getDeepLUrl,
  getGoogleTranslateUrl,
  speakText,
} from './api';
import {
  getLanguageName,
  SOURCE_LANGUAGES,
  TARGET_LANGUAGES,
} from './languages';
import styles from './translate.module.css';

// ADD: 翻訳ウィジェットの設定インターフェース
interface TranslateSettings extends Record<string, unknown> {
  defaultSourceLang: string;
  defaultTargetLang: string;
  autoTranslate: boolean;
}

// ADD: 翻訳ウィジェットのメインコンテンツ
function TranslateContent({ settings }: WidgetProps<TranslateSettings>) {
  const [sourceLang, setSourceLang] = useState<string>(settings.defaultSourceLang || 'auto');
  const [targetLang, setTargetLang] = useState<string>(settings.defaultTargetLang || 'ja');
  const [inputText, setInputText] = useState<string>('');
  const [outputText, setOutputText] = useState<string>('');
  const [detectedLang, setDetectedLang] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // ADD: 設定の既定言語が変更された場合の同期
  useEffect(() => {
    if (settings.defaultSourceLang) setSourceLang(settings.defaultSourceLang);
  }, [settings.defaultSourceLang]);

  useEffect(() => {
    if (settings.defaultTargetLang) setTargetLang(settings.defaultTargetLang);
  }, [settings.defaultTargetLang]);

  // ADD: 翻訳実行関数
  const runTranslation = async (text: string, sl: string, tl: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setOutputText('');
      setDetectedLang(undefined);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetchTranslation(trimmed, sl, tl);
      setOutputText(res.translatedText);
      setDetectedLang(res.detectedSourceLang);
    } catch (err) {
      setError(err instanceof Error ? err.message : '翻訳に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // ADD: 入力テキスト・言語変更時の自動翻訳デバウンス
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!settings.autoTranslate) return;

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    if (!inputText.trim()) {
      setOutputText('');
      setDetectedLang(undefined);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    timerRef.current = window.setTimeout(() => {
      runTranslation(inputText, sourceLang, targetLang);
    }, 500);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [inputText, sourceLang, targetLang, settings.autoTranslate]);

  // ADD: 言語反転ボタンのハンドラ
  const handleSwapLanguages = () => {
    let nextSource = targetLang;
    let nextTarget = sourceLang;

    if (sourceLang === 'auto') {
      nextTarget = detectedLang || (targetLang === 'ja' ? 'en' : 'ja');
    }

    setSourceLang(nextSource);
    setTargetLang(nextTarget);

    // ADD: テキストが存在する場合は入力と出力を入れ替えて再翻訳
    if (outputText) {
      setInputText(outputText);
      setOutputText(inputText);
      runTranslation(outputText, nextSource, nextTarget);
    }
  };

  // ADD: クリップボードへのコピーハンドラ
  const handleCopy = async () => {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[TranslateWidget] コピーに失敗しました', err);
    }
  };

  // ADD: 入力クリアハンドラ
  const handleClear = () => {
    setInputText('');
    setOutputText('');
    setDetectedLang(undefined);
    setError(null);
  };

  return (
    <div className={styles.root}>
      {/* ADD: ヘッダー（言語選択と外部サービスリンク） */}
      <div className={styles.header}>
        <div className={styles.langGroup}>
          <select
            className={cx(styles.select, 'ant-no-drag')}
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
            aria-label="翻訳元言語"
          >
            {SOURCE_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={cx(styles.iconBtn, 'ant-no-drag')}
            onClick={handleSwapLanguages}
            title="言語を入れ替える"
            aria-label="言語を入れ替える"
          >
            <ArrowLeftRight size={14} />
          </button>

          <select
            className={cx(styles.select, 'ant-no-drag')}
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            aria-label="翻訳先言語"
          >
            {TARGET_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.externalGroup}>
          <a
            href={getGoogleTranslateUrl(inputText, sourceLang, targetLang)}
            target="_blank"
            rel="noopener noreferrer"
            className={cx(styles.externalLink, 'ant-no-drag')}
            title="Google翻訳で開く"
          >
            <span>Google</span>
            <ExternalLink size={10} />
          </a>
          <a
            href={getDeepLUrl(inputText, sourceLang, targetLang)}
            target="_blank"
            rel="noopener noreferrer"
            className={cx(styles.externalLink, 'ant-no-drag')}
            title="DeepLで開く"
          >
            <span>DeepL</span>
            <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {/* ADD: 入力ボックスおよび結果ボックス */}
      <div className={styles.content}>
        {/* ADD: 翻訳元テキスト入力欄 */}
        <div className={styles.box}>
          <textarea
            className={cx(styles.textarea, 'ant-no-drag')}
            placeholder="翻訳するテキストを入力…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                runTranslation(inputText, sourceLang, targetLang);
              }
            }}
          />
          <div className={styles.boxFooter}>
            <span>{inputText.length > 0 ? `${inputText.length}文字` : ''}</span>
            <div className={styles.boxActions}>
              {inputText && (
                <>
                  <button
                    type="button"
                    className={cx(styles.iconBtn, 'ant-no-drag')}
                    onClick={() => speakText(inputText, sourceLang === 'auto' ? detectedLang || 'ja' : sourceLang)}
                    title="音声を再生"
                    aria-label="音声を再生"
                  >
                    <Volume2 size={13} />
                  </button>
                  <button
                    type="button"
                    className={cx(styles.iconBtn, 'ant-no-drag')}
                    onClick={handleClear}
                    title="テキストを消去"
                    aria-label="テキストを消去"
                  >
                    <X size={13} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ADD: 翻訳結果表示欄 */}
        <div className={styles.box}>
          <div className={cx(styles.resultArea, 'ant-no-drag')}>
            {isLoading ? (
              <span className={styles.placeholder}>翻訳中…</span>
            ) : outputText ? (
              outputText
            ) : error ? (
              <span className={styles.errorText}>{error}</span>
            ) : (
              <span className={styles.placeholder}>翻訳結果がここに表示されます</span>
            )}
          </div>

          <div className={styles.boxFooter}>
            <div>
              {sourceLang === 'auto' && detectedLang && (
                <span className={styles.detectedBadge}>
                  {getLanguageName(detectedLang)}から検出
                </span>
              )}
            </div>
            <div className={styles.boxActions}>
              {isLoading && <Loader2 size={13} className={styles.spinner} />}
              {outputText && (
                <>
                  <button
                    type="button"
                    className={cx(styles.iconBtn, 'ant-no-drag')}
                    onClick={() => speakText(outputText, targetLang)}
                    title="音声を再生"
                    aria-label="音声を再生"
                  >
                    <Volume2 size={13} />
                  </button>
                  <button
                    type="button"
                    className={cx(styles.iconBtn, 'ant-no-drag')}
                    onClick={handleCopy}
                    title={copied ? 'コピーしました' : 'クリップボードにコピー'}
                    aria-label={copied ? 'コピーしました' : 'クリップボードにコピー'}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ADD: パーミッションゲートでラップしたウィジェットコンポーネント
function TranslateWidget(props: WidgetProps<TranslateSettings>) {
  return (
    <PermissionGate
      permissions={{
        hosts: [
          'https://translate.googleapis.com/*',
          'https://api.mymemory.translated.net/*',
        ],
      }}
      reason="テキストを翻訳するには、翻訳サービス（Google翻訳等）への通信を許可してください。"
    >
      <TranslateContent {...props} />
    </PermissionGate>
  );
}

// ADD: 翻訳ウィジェットの定義と登録設定
export const translateWidget = defineWidget<TranslateSettings>({
  type: 'translate',
  name: '翻訳',
  description: 'テキストを複数の言語へ翻訳します。',
  icon: Languages,
  defaultLayout: { w: 4, h: 4, minW: 3, minH: 3 },
  permissions: {
    hosts: [
      'https://translate.googleapis.com/*',
      'https://api.mymemory.translated.net/*',
    ],
  },
  defaultSettings: {
    defaultSourceLang: 'auto',
    defaultTargetLang: 'ja',
    autoTranslate: true,
  },
  settingsSchema: [
    {
      kind: 'select',
      key: 'defaultSourceLang',
      label: '既定の翻訳元言語',
      options: SOURCE_LANGUAGES.map((l) => ({ value: l.code, label: l.name })),
    },
    {
      kind: 'select',
      key: 'defaultTargetLang',
      label: '既定の翻訳先言語',
      options: TARGET_LANGUAGES.map((l) => ({ value: l.code, label: l.name })),
    },
    {
      kind: 'toggle',
      key: 'autoTranslate',
      label: '入力中に自動翻訳する',
      help: 'ONの場合、入力が停止してから約0.5秒後に自動で翻訳を実行します。',
    },
  ],
  Component: TranslateWidget,
});

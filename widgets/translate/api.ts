// ADD: 翻訳API通信処理とキャッシュ管理

import { cached } from '@/lib/cache';

export interface TranslationResult {
  translatedText: string;
  detectedSourceLang?: string;
}

// ADD: 翻訳結果のキャッシュ有効期間（1時間）
const TRANSLATION_CACHE_TTL_MS = 60 * 60 * 1000;

// ADD: テキストを指定された言語に翻訳する関数
export async function fetchTranslation(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<TranslationResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { translatedText: '', detectedSourceLang: undefined };
  }

  // ADD: キャッシュキーの生成
  const cacheKey = `translate:${sourceLang}:${targetLang}:${trimmed}`;

  const cachedResult = await cached(cacheKey, TRANSLATION_CACHE_TTL_MS, async () => {
    // ADD: 優先的にGoogle翻訳の公開エンドポイントを試行
    try {
      return await fetchFromGoogle(trimmed, sourceLang, targetLang);
    } catch (googleError) {
      console.warn('[TranslateWidget] Google翻訳APIでエラーが発生したためフォールバックを試みます', googleError);
      // ADD: 失敗した場合はMyMemory APIでフォールバック
      return await fetchFromMyMemory(trimmed, sourceLang, targetLang);
    }
  });

  return cachedResult.data;
}

// ADD: Google翻訳 gtx APIへのリクエスト
async function fetchFromGoogle(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<TranslationResult> {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', sourceLang);
  url.searchParams.set('tl', targetLang);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Google翻訳の取得に失敗しました (ステータス: ${res.status})`);
  }

  const json = await res.json();
  if (!Array.isArray(json) || !Array.isArray(json[0])) {
    throw new Error('翻訳データの形式が不正です');
  }

  // ADD: 分割された翻訳セグメントを結合
  const translatedText = json[0]
    .map((item: unknown) => (Array.isArray(item) && typeof item[0] === 'string' ? item[0] : ''))
    .join('');

  // ADD: 検出された言語コードの取得
  const detectedSourceLang = typeof json[2] === 'string' ? json[2] : undefined;

  return { translatedText, detectedSourceLang };
}

// ADD: MyMemory APIへのフォールバックリクエスト
async function fetchFromMyMemory(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<TranslationResult> {
  const sl = sourceLang === 'auto' ? 'autodetect' : sourceLang;
  const langpair = `${sl}|${targetLang}`;
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', langpair);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`MyMemory APIの取得に失敗しました (ステータス: ${res.status})`);
  }

  const json = await res.json();
  if (json.responseStatus !== 200 && json.responseStatus !== '200') {
    throw new Error(json.responseDetails || 'MyMemory APIでの翻訳に失敗しました');
  }

  return {
    translatedText: json.responseData?.translatedText || '',
    detectedSourceLang: undefined,
  };
}

// ADD: Google翻訳のWebサイトURLを生成
export function getGoogleTranslateUrl(text: string, sl: string, tl: string): string {
  const s = sl === 'auto' ? 'auto' : sl;
  return `https://translate.google.com/?sl=${encodeURIComponent(s)}&tl=${encodeURIComponent(tl)}&text=${encodeURIComponent(text)}&op=translate`;
}

// ADD: DeepLのWebサイトURLを生成
export function getDeepLUrl(text: string, sl: string, tl: string): string {
  const s = sl === 'auto' ? 'auto' : sl;
  return `https://www.deepl.com/translator#${encodeURIComponent(s)}/${encodeURIComponent(tl)}/${encodeURIComponent(text)}`;
}

// ADD: 音声読み上げを行うヘルパー関数
export function speakText(text: string, lang: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(trimmed);
  if (lang && lang !== 'auto') {
    utterance.lang = lang;
  }
  window.speechSynthesis.speak(utterance);
}

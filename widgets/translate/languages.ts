// ADD: 翻訳ウィジェットで対応する言語の定義とヘルパー関数

export interface LanguageOption {
  code: string;
  name: string;
}

// ADD: 入力元言語の選択肢リスト（自動検出含む）
export const SOURCE_LANGUAGES: ReadonlyArray<LanguageOption> = [
  { code: 'auto', name: '自動検出' },
  { code: 'ja', name: '日本語' },
  { code: 'en', name: '英語' },
  { code: 'zh-CN', name: '中国語（簡体字）' },
  { code: 'zh-TW', name: '中国語（繁体字）' },
  { code: 'ko', name: '韓国語' },
  { code: 'es', name: 'スペイン語' },
  { code: 'fr', name: 'フランス語' },
  { code: 'de', name: 'ドイツ語' },
  { code: 'it', name: 'イタリア語' },
  { code: 'pt', name: 'ポルトガル語' },
  { code: 'ru', name: 'ロシア語' },
  { code: 'vi', name: 'ベトナム語' },
  { code: 'th', name: 'タイ語' },
  { code: 'id', name: 'インドネシア語' },
  { code: 'ar', name: 'アラビア語' },
  { code: 'hi', name: 'ヒンディー語' },
];

// ADD: 翻訳先言語の選択肢リスト
export const TARGET_LANGUAGES: ReadonlyArray<LanguageOption> = [
  { code: 'ja', name: '日本語' },
  { code: 'en', name: '英語' },
  { code: 'zh-CN', name: '中国語（簡体字）' },
  { code: 'zh-TW', name: '中国語（繁体字）' },
  { code: 'ko', name: '韓国語' },
  { code: 'es', name: 'スペイン語' },
  { code: 'fr', name: 'フランス語' },
  { code: 'de', name: 'ドイツ語' },
  { code: 'it', name: 'イタリア語' },
  { code: 'pt', name: 'ポルトガル語' },
  { code: 'ru', name: 'ロシア語' },
  { code: 'vi', name: 'ベトナム語' },
  { code: 'th', name: 'タイ語' },
  { code: 'id', name: 'インドネシア語' },
  { code: 'ar', name: 'アラビア語' },
  { code: 'hi', name: 'ヒンディー語' },
];

// ADD: 言語コードから表示名を取得
export function getLanguageName(code: string): string {
  const found = SOURCE_LANGUAGES.find((lang) => lang.code.toLowerCase() === code.toLowerCase());
  if (found) return found.name;
  // ADD: 国コード付きのプレフィックス一致を試行（例: "en-US" -> "英語"）
  const prefix = code.split('-')[0]?.toLowerCase();
  const fallback = SOURCE_LANGUAGES.find((lang) => lang.code.toLowerCase() === prefix);
  return fallback ? fallback.name : code;
}

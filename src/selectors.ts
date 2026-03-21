import * as path from 'path';
import type { Page } from 'playwright';
import { loadJson, log } from './utils';

// =============================================================
// Types
// =============================================================

export interface SelectorMap {
  _meta: { lastUpdated: string; baseUrl: string; note: string };
  _common: Record<string, string | null>;
  scenarios: Record<string, string>;
  tags: Record<string, string>;
  friendFields: Record<string, string>;
  dependencies: Record<string, string>;
}

export type SectionName = 'scenarios' | 'tags' | 'friendFields';

// =============================================================
// loadSelectors
// =============================================================

let cached: SelectorMap | null = null;

export async function loadSelectors(): Promise<SelectorMap> {
  if (cached) return cached;

  const filePath = path.resolve(__dirname, '..', 'selectors', 'selectors.json');
  const data = await loadJson<SelectorMap>(filePath);
  if (!data) {
    throw new Error(`selectors.json not found at ${filePath}`);
  }
  cached = data;
  log('info', 'selectors.json loaded');
  return data;
}

/** テスト用: キャッシュクリア */
export function clearSelectorCache(): void {
  cached = null;
}

// =============================================================
// getSelector — セクション + キー でセレクタ文字列を取得
// =============================================================

export function getSelector(
  selectors: SelectorMap,
  section: SectionName | '_common',
  key: string
): string {
  const map = selectors[section] as Record<string, string | null>;
  const value = map?.[key];
  if (!value) {
    throw new Error(`Selector not found: ${section}.${key}`);
  }
  return value;
}

// =============================================================
// findElement — ページ上で要素を1つ取得（タイムアウト付き）
// =============================================================

export async function findElement(
  page: Page,
  selector: string,
  opts: { timeout?: number } = {}
): Promise<ReturnType<Page['waitForSelector']>> {
  const { timeout = 10_000 } = opts;
  const el = await page.waitForSelector(selector, { timeout });
  if (!el) {
    throw new Error(`Element not found: ${selector}`);
  }
  return el;
}

// =============================================================
// findElements — ページ上で複数要素を取得
// =============================================================

export async function findElements(
  page: Page,
  selector: string
): Promise<Awaited<ReturnType<Page['$']>>[]> {
  return page.$$(selector);
}

// =============================================================
// validateAllSelectors — 指定セクションの全セレクタの存在を確認
// =============================================================

export interface ValidationResult {
  section: SectionName;
  key: string;
  selector: string;
  found: boolean;
  count: number;
}

export async function validateAllSelectors(
  page: Page,
  section: SectionName,
  selectors: SelectorMap
): Promise<ValidationResult[]> {
  const map = selectors[section] as Record<string, string>;
  const results: ValidationResult[] = [];

  for (const [key, selector] of Object.entries(map)) {
    // メタ系キーやURL/日付はスキップ
    if (key === 'lastVerified' || key.endsWith('PageUrl') || key === 'note') {
      continue;
    }
    // TODO マーカーはスキップ
    if (selector.startsWith('TODO')) {
      log('warn', `Skipping TODO selector: ${section}.${key}`);
      results.push({ section, key, selector, found: false, count: 0 });
      continue;
    }
    // data-item-id などの属性名はセレクタではない
    if (!selector.includes(' ') && !selector.includes('[') && !selector.includes('.') && !selector.includes(':') && !selector.includes('#')) {
      continue;
    }

    try {
      const elements = await page.$$(selector);
      results.push({
        section,
        key,
        selector,
        found: elements.length > 0,
        count: elements.length,
      });
    } catch (err) {
      log('warn', `Invalid selector: ${section}.${key} = "${selector}"`, err);
      results.push({ section, key, selector, found: false, count: 0 });
    }
  }

  const passed = results.filter((r) => r.found).length;
  const total = results.length;
  log('info', `validateAllSelectors(${section}): ${passed}/${total} found`);

  return results;
}

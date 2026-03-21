import { chromium, type Browser, type Page } from 'playwright';
import { log } from './utils';
import { loadSelectors, type SelectorMap } from './selectors';

// =============================================================
// Types
// =============================================================

export interface LstepConnection {
  browser: Browser;
  page: Page;
  selectors: SelectorMap;
  baseUrl: string;
}

// =============================================================
// connectToLstep — Chrome DevTools Protocol で既存ブラウザに接続
// =============================================================

export async function connectToLstep(
  opts: { cdpUrl?: string } = {}
): Promise<LstepConnection> {
  const cdpUrl = opts.cdpUrl ?? process.env.CDP_URL ?? 'http://127.0.0.1:9222';

  log('info', `Connecting to Chrome via CDP: ${cdpUrl}`);
  const browser = await chromium.connectOverCDP(cdpUrl);

  const selectors = await loadSelectors();
  const baseUrl = selectors._meta.baseUrl;

  // 既存のコンテキストからLステップのページを探す
  const contexts = browser.contexts();
  let page: Page | undefined;

  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      if (p.url().includes(baseUrl)) {
        page = p;
        break;
      }
    }
    if (page) break;
  }

  if (!page) {
    throw new Error(
      `Lステップのページが見つかりません。${baseUrl} にログインした状態でChromeを起動してください。`
    );
  }

  log('info', `Connected to Lステップ page: ${page.url()}`);

  return { browser, page, selectors, baseUrl };
}

// =============================================================
// getLstepPage — 指定URLのページに遷移（baseUrl + path）
// =============================================================

export async function getLstepPage(
  conn: LstepConnection,
  pagePath: string
): Promise<Page> {
  const url = `${conn.baseUrl}${pagePath}`;
  const currentUrl = conn.page.url();

  if (currentUrl !== url) {
    log('info', `Navigating to: ${url}`);
    await conn.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  }

  // SPAのテーブル描画を待つ（共通テーブルコンポーネント）
  await waitForTable(conn.page);

  return conn.page;
}

// =============================================================
// waitForTable — テーブル行の出現を待つ（SPA描画待ち）
// =============================================================

async function waitForTable(page: Page, timeout = 10_000): Promise<void> {
  try {
    await page.waitForSelector('table tbody tr[data-item-id]', { timeout });
  } catch {
    // テーブルが空（0件）の場合もあるので、table 自体の存在で妥協
    try {
      await page.waitForSelector('table', { timeout: 3_000 });
    } catch {
      log('warn', 'Table not found on page');
    }
  }
}

// =============================================================
// disconnect — 接続を閉じる（ブラウザは閉じない）
// =============================================================

export async function disconnect(conn: LstepConnection): Promise<void> {
  log('info', 'Disconnecting from Chrome (browser stays open)');
  // connectOverCDP の場合、browser.close() はブラウザ自体を閉じない
  // ただしリソース解放のため明示的に切断
  await conn.browser.close();
}

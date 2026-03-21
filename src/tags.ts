import type { Page } from 'playwright';
import type { Tag } from './types';
import { log, randomWait, saveJson, generateTimestamp } from './utils';
import { getLstepPage, type LstepConnection } from './connection';
import { getSelector, findElements, type SelectorMap } from './selectors';

// =============================================================
// getTagList — タグ一覧を取得（F2）
// =============================================================

export async function getTagList(conn: LstepConnection): Promise<Tag[]> {
  const { selectors } = conn;
  const listPath = getSelector(selectors, 'tags', 'listPageUrl');
  const page = await getLstepPage(conn, listPath);

  log('info', 'Scanning tag list...');

  const folders = await scanFolders(page, selectors);
  log('info', `Found ${folders.length} folders`);

  const tags: Tag[] = [];

  // ルートのタグを取得
  const rootTags = await scrapeTagRows(page, selectors);
  tags.push(...rootTags);
  log('info', `Root: ${rootTags.length} tags`);

  // 各フォルダを巡回
  for (const folder of folders) {
    await randomWait(300, 800);
    await clickFolder(page, folder);
    const folderTags = await scrapeTagRows(page, selectors, folder);
    log('info', `Folder "${folder}": ${folderTags.length} tags`);
    tags.push(...folderTags);
  }

  const unique = deduplicateById(tags);
  log('info', `Total unique tags: ${unique.length}`);

  const ts = generateTimestamp();
  await saveJson(`data/tags_${ts}.json`, unique);

  return unique;
}

// =============================================================
// scrapeTagRows
// =============================================================

async function scrapeTagRows(
  page: Page,
  selectors: SelectorMap,
  folder?: string
): Promise<Tag[]> {
  const rowSelector = getSelector(selectors, 'tags', 'tableRow');
  const rows = await findElements(page, rowSelector);

  const tags: Tag[] = [];

  for (const row of rows) {
    if (!row) continue;
    try {
      const id = await row.getAttribute('data-item-id');
      if (!id) continue;

      const nameEl = await row.$(getSelector(selectors, 'tags', 'rowName'));
      const name = nameEl ? (await nameEl.textContent())?.trim() ?? '' : '';

      const countEl = await row.$(getSelector(selectors, 'tags', 'rowFriendCount'));
      const countText = countEl ? (await countEl.textContent())?.trim() ?? '0' : '0';

      tags.push({
        id,
        name,
        folder,
        friendCount: parseInt(countText.replace(/,/g, ''), 10) || 0,
      });
    } catch (err) {
      log('warn', 'Failed to parse tag row', err);
    }
  }

  return tags;
}

// =============================================================
// scanFolders
// =============================================================

async function scanFolders(page: Page, selectors: SelectorMap): Promise<string[]> {
  const folderSelector = getSelector(selectors, 'tags', 'folderList');
  const folderEls = await findElements(page, folderSelector);

  const folders: string[] = [];
  for (const el of folderEls) {
    if (!el) continue;
    const text = (await el.textContent())?.trim();
    if (text) folders.push(text);
  }
  return folders;
}

// =============================================================
// clickFolder
// =============================================================

async function clickFolder(page: Page, folderName: string): Promise<void> {
  const folderEl = page.locator('ul > li button span.tw-break-all').filter({
    hasText: new RegExp(`^${escapeRegex(folderName)}$`),
  });
  await folderEl.click();
  await page.waitForTimeout(1500);
}

// =============================================================
// Helpers
// =============================================================

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deduplicateById(tags: Tag[]): Tag[] {
  const seen = new Set<string>();
  return tags.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

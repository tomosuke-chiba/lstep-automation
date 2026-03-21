import type { Page } from 'playwright';
import type { FriendField, FieldType } from './types';
import { log, randomWait, saveJson, generateTimestamp } from './utils';
import { getLstepPage, type LstepConnection } from './connection';
import { getSelector, findElements, type SelectorMap } from './selectors';

// =============================================================
// getFriendFieldList — 友だち情報欄一覧を取得（F3）
// =============================================================

export async function getFriendFieldList(
  conn: LstepConnection
): Promise<FriendField[]> {
  const { selectors } = conn;
  const listPath = getSelector(selectors, 'friendFields', 'listPageUrl');
  const page = await getLstepPage(conn, listPath);

  log('info', 'Scanning friend field list...');

  const folders = await scanFolders(page, selectors);
  log('info', `Found ${folders.length} folders`);

  const fields: FriendField[] = [];

  // ルートのフィールドを取得
  const rootFields = await scrapeFieldRows(page, selectors);
  fields.push(...rootFields);
  log('info', `Root: ${rootFields.length} fields`);

  // 各フォルダを巡回
  for (const folder of folders) {
    await randomWait(300, 800);
    await clickFolder(page, folder);
    const folderFields = await scrapeFieldRows(page, selectors, folder);
    log('info', `Folder "${folder}": ${folderFields.length} fields`);
    fields.push(...folderFields);
  }

  const unique = deduplicateById(fields);
  log('info', `Total unique fields: ${unique.length}`);

  const ts = generateTimestamp();
  await saveJson(`data/friend_fields_${ts}.json`, unique);

  return unique;
}

// =============================================================
// scrapeFieldRows
// =============================================================

async function scrapeFieldRows(
  page: Page,
  selectors: SelectorMap,
  folder?: string
): Promise<FriendField[]> {
  const rowSelector = getSelector(selectors, 'friendFields', 'tableRow');
  const rows = await findElements(page, rowSelector);

  const fields: FriendField[] = [];

  for (const row of rows) {
    if (!row) continue;
    try {
      const id = await row.getAttribute('data-item-id');
      if (!id) continue;

      const nameEl = await row.$(getSelector(selectors, 'friendFields', 'rowName'));
      const name = nameEl ? (await nameEl.textContent())?.trim() ?? '' : '';

      const typeEl = await row.$(getSelector(selectors, 'friendFields', 'rowType'));
      const typeText = typeEl ? (await typeEl.textContent())?.trim() ?? '' : '';
      const fieldType = parseFieldType(typeText);

      const defaultEl = await row.$(getSelector(selectors, 'friendFields', 'rowDefaultValue'));
      const defaultValue = defaultEl ? (await defaultEl.textContent())?.trim() : undefined;

      fields.push({
        id,
        name,
        fieldType,
        folder,
        // choices は詳細ページでのみ取得可能（select型の場合）
      });
    } catch (err) {
      log('warn', 'Failed to parse friend field row', err);
    }
  }

  return fields;
}

// =============================================================
// scanFolders
// =============================================================

async function scanFolders(page: Page, selectors: SelectorMap): Promise<string[]> {
  const folderSelector = getSelector(selectors, 'friendFields', 'folderList');
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

function parseFieldType(text: string): FieldType {
  if (text.includes('テキスト') || text.includes('text')) return 'text';
  if (text.includes('選択') || text.includes('select')) return 'select';
  if (text.includes('日付') || text.includes('date')) return 'date';
  if (text.includes('数値') || text.includes('number')) return 'number';
  return 'text'; // デフォルト
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deduplicateById(fields: FriendField[]): FriendField[] {
  const seen = new Set<string>();
  return fields.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
}

import type { Page } from 'playwright';
import type { Scenario, ScenarioDetail, ScenarioStep, ScenarioStatus } from './types';
import { log, randomWait, saveJson, generateTimestamp } from './utils';
import { getLstepPage, type LstepConnection } from './connection';
import { getSelector, findElements, type SelectorMap } from './selectors';

// =============================================================
// getScenarioList — シナリオ一覧を取得（F1-1）
// =============================================================

export async function getScenarioList(
  conn: LstepConnection
): Promise<Scenario[]> {
  const { selectors } = conn;
  const listPath = getSelector(selectors, 'scenarios', 'listPageUrl');
  const page = await getLstepPage(conn, listPath);

  log('info', 'Scanning scenario list...');

  // フォルダ一覧を取得
  const folders = await scanFolders(page, selectors);
  log('info', `Found ${folders.length} folders`);

  // まずルート（フォルダ未選択）のシナリオを取得
  const scenarios: Scenario[] = [];
  const rootScenarios = await scrapeScenarioRows(page, selectors);
  scenarios.push(...rootScenarios);
  log('info', `Root: ${rootScenarios.length} scenarios`);

  // 各フォルダを巡回
  for (const folder of folders) {
    await randomWait(300, 800);
    await clickFolder(page, folder);
    const folderScenarios = await scrapeScenarioRows(page, selectors);
    // フォルダ情報を付与（Scenario型にはfolderがないが、metadataとしてログに残す）
    log('info', `Folder "${folder}": ${folderScenarios.length} scenarios`);
    scenarios.push(...folderScenarios);
  }

  // 重複除去（同じIDのシナリオ）
  const unique = deduplicateById(scenarios);
  log('info', `Total unique scenarios: ${unique.length}`);

  // 結果保存
  const ts = generateTimestamp();
  await saveJson(`data/scenarios_${ts}.json`, unique);

  return unique;
}

// =============================================================
// getScenarioDetail — シナリオ詳細ページからステップ情報を取得
// =============================================================

export async function getScenarioDetail(
  conn: LstepConnection,
  scenario: Scenario
): Promise<ScenarioDetail> {
  const detailPath = `/line/content/${scenario.id}`;
  const page = await getLstepPage(conn, detailPath);

  // テーブルの描画を待つ
  await page.waitForTimeout(2000);

  log('info', `Scraping detail for: ${scenario.name} (id=${scenario.id})`);

  // フィルタ条件を取得
  const filterText = await page
    .locator('div.funnel-first-content p')
    .first()
    .textContent()
    .catch(() => '条件なし');

  // ステップ行を取得（詳細ページのテーブルは data-v-5b9225c6 属性付き）
  const rows = await page.$$('table tbody tr[data-v-5b9225c6]');
  const steps: ScenarioStep[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    try {
      // コンテンツID
      const checkbox = await row.$('input[type="checkbox"]');
      const contentId = checkbox
        ? await checkbox.getAttribute('value') ?? ''
        : '';

      // タイプ（メッセージ etc.）
      const typeEl = await row.$('span.message-type');
      const messageType = typeEl
        ? (await typeEl.textContent())?.trim() ?? ''
        : '';

      // タイミング（開始当日, 1日後, etc.）
      const timingEl = await row.$('td:nth-child(3)');
      const timing = timingEl
        ? (await timingEl.textContent())?.trim() ?? ''
        : '';

      // 時刻
      const timeEl = await row.$('td:nth-child(4)');
      const time = timeEl
        ? (await timeEl.textContent())?.trim() ?? ''
        : '';

      // テンプレート名（あれば）
      const templateLabel = await row.$('span.label.label-default');
      const templateName = templateLabel
        ? (await templateLabel.evaluate(
            (el: any) => el.nextSibling?.textContent?.trim() ?? ''
          ))
        : '';

      // 本文プレビュー
      const previewEl = await row.$('div.simple p');
      const messagePreview = previewEl
        ? (await previewEl.textContent())?.trim() ?? ''
        : '';

      steps.push({
        stepIndex: i,
        timing: `${timing} ${time}`.trim(),
        messageType,
        messagePreview: templateName
          ? `[テンプレート] ${templateName}: ${messagePreview}`
          : messagePreview,
        branchConditions: [],
        actions: [],
      });
    } catch (err) {
      log('warn', `Failed to parse step ${i}`, err);
    }
  }

  const detail: ScenarioDetail = {
    ...scenario,
    stepCount: steps.length,
    steps,
  };

  // フィルタ条件をメタデータとして記録
  if (filterText && filterText !== '条件なし') {
    log('info', `Filter condition: ${filterText}`);
  }

  log('info', `  ${steps.length} steps found`);
  return detail;
}

// =============================================================
// getScenarioDetails — 全シナリオの詳細を取得
// =============================================================

export async function getScenarioDetails(
  conn: LstepConnection,
  scenarios: Scenario[]
): Promise<ScenarioDetail[]> {
  const details: ScenarioDetail[] = [];

  for (const scenario of scenarios) {
    await randomWait(500, 1000);
    const detail = await getScenarioDetail(conn, scenario);
    details.push(detail);
  }

  const ts = generateTimestamp();
  await saveJson(`data/scenario_details_${ts}.json`, details);
  log('info', `Saved ${details.length} scenario details`);

  return details;
}

// =============================================================
// scrapeScenarioRows — 現在表示中のテーブルからシナリオ行を読み取る
// =============================================================

async function scrapeScenarioRows(
  page: Page,
  selectors: SelectorMap
): Promise<Scenario[]> {
  const rowSelector = getSelector(selectors, 'scenarios', 'tableRow');
  const rows = await findElements(page, rowSelector);

  const scenarios: Scenario[] = [];

  for (const row of rows) {
    if (!row) continue;
    try {
      const id = await row.getAttribute('data-item-id');
      if (!id) continue;

      const nameEl = await row.$(getSelector(selectors, 'scenarios', 'rowName'));
      const name = nameEl ? (await nameEl.textContent())?.trim() ?? '' : '';

      const statusEl = await row.$(
        getSelector(selectors, 'scenarios', 'rowStatusText')
      );
      const statusText = statusEl
        ? (await statusEl.textContent())?.trim() ?? ''
        : '';
      const status = parseStatus(statusText);

      const subscribingEl = await row.$(
        getSelector(selectors, 'scenarios', 'rowSubscribing')
      );
      const subscribingText = subscribingEl
        ? (await subscribingEl.textContent())?.trim() ?? '0'
        : '0';

      const createdEl = await row.$(
        getSelector(selectors, 'scenarios', 'rowCreatedDate')
      );
      const createdAt = createdEl
        ? (await createdEl.textContent())?.trim() ?? ''
        : '';

      scenarios.push({
        id,
        name,
        status,
        sendCount: parseInt(subscribingText.replace(/,/g, ''), 10) || 0,
        stepCount: 0, // 一覧からはステップ数取得不可、詳細取得時に埋める
        createdAt,
        updatedAt: '', // 一覧には更新日なし
      });
    } catch (err) {
      log('warn', 'Failed to parse scenario row', err);
    }
  }

  return scenarios;
}

// =============================================================
// scanFolders — フォルダ一覧を取得
// =============================================================

async function scanFolders(
  page: Page,
  selectors: SelectorMap
): Promise<string[]> {
  const folderSelector = getSelector(selectors, 'scenarios', 'folderList');
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
// clickFolder — フォルダをクリックして遷移を待つ
// =============================================================

async function clickFolder(page: Page, folderName: string): Promise<void> {
  const folderEl = page.locator('ul > li button span.tw-break-all').filter({
    hasText: new RegExp(`^${escapeRegex(folderName)}$`),
  });
  await folderEl.click();
  // SPA遷移を待つ（テーブル再描画）
  await page.waitForTimeout(1500);
}

// =============================================================
// Helpers
// =============================================================

function parseStatus(text: string): ScenarioStatus {
  if (text.includes('配信中')) return '配信中';
  if (text.includes('停止')) return '停止中';
  return '下書き';
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deduplicateById(scenarios: Scenario[]): Scenario[] {
  const seen = new Set<string>();
  return scenarios.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

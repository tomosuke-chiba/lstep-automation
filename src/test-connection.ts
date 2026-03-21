/**
 * 動作確認スクリプト
 * 1. CDP接続テスト
 * 2. シナリオページ遷移 + セレクタ検証
 * 3. シナリオ一覧取得
 */
import { connectToLstep, getLstepPage, disconnect } from './connection';
import { validateAllSelectors, getSelector } from './selectors';
import { getScenarioList } from './scenarios';
import { getTagList } from './tags';
import { getFriendFieldList } from './friend-fields';
import { log } from './utils';

async function main() {
  log('info', '=== Step 1: CDP接続テスト ===');
  const cdpUrl = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
  const conn = await connectToLstep({ cdpUrl });
  log('info', `接続成功: ${conn.page.url()}`);

  log('info', '=== Step 2: シナリオページ遷移 + セレクタ検証 ===');
  const listPath = getSelector(conn.selectors, 'scenarios', 'listPageUrl');
  await getLstepPage(conn, listPath);
  log('info', `現在のURL: ${conn.page.url()}`);

  // データがあるフォルダをクリックしてからセレクタ検証（ルートは0件の場合がある）
  const testFolder = conn.page.locator(
    'ul > li button span.tw-break-all:has-text("アンケート回答後")'
  );
  const hasFolders = await testFolder.count();
  if (hasFolders > 0) {
    log('info', 'セレクタ検証用にフォルダ移動...');
    await testFolder.click();
    await conn.page.waitForTimeout(2000);
  }

  const results = await validateAllSelectors(conn.page, 'scenarios', conn.selectors);
  console.log('\n--- セレクタ検証結果 ---');
  for (const r of results) {
    const icon = r.found ? '✅' : '❌';
    console.log(`${icon} ${r.key}: ${r.count}件 (${r.selector})`);
  }

  const failCount = results.filter((r) => !r.found).length;
  if (failCount > 0) {
    log('warn', `${failCount}件のセレクタが見つかりませんでした`);
  }

  log('info', '=== Step 3: シナリオ一覧取得 ===');
  const scenarios = await getScenarioList(conn);
  console.log(`\n--- シナリオ一覧 (${scenarios.length}件) ---`);
  for (const s of scenarios) {
    console.log(`  [${s.status}] ${s.name} (id=${s.id}, 配信数=${s.sendCount})`);
  }

  log('info', '=== Step 4: タグ一覧取得 ===');
  const tags = await getTagList(conn);
  console.log(`\n--- タグ一覧 (${tags.length}件) ---`);
  for (const t of tags) {
    console.log(`  ${t.name} (id=${t.id}, folder=${t.folder ?? 'root'}, 友だち=${t.friendCount})`);
  }

  log('info', '=== Step 5: 友だち情報欄一覧取得 ===');
  const fields = await getFriendFieldList(conn);
  console.log(`\n--- 友だち情報欄一覧 (${fields.length}件) ---`);
  for (const f of fields) {
    console.log(`  ${f.name} (id=${f.id}, type=${f.fieldType}, folder=${f.folder ?? 'root'})`);
  }

  await disconnect(conn);
  log('info', '=== 完了 ===');
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});

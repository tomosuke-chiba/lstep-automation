import { analyze, searchNodes, checkDataFreshness } from './planner';

async function main(): Promise<void> {
  // 1. データ鮮度チェック
  console.log('=== データ鮮度チェック ===');
  const freshness = await checkDataFreshness();
  console.log(JSON.stringify(freshness, null, 2));
  console.log();

  // 2. ノード検索テスト
  console.log('=== ノード検索: "予約" ===');
  const results = await searchNodes('予約');
  for (const n of results) {
    console.log('  ', n.id, '(' + n.kind + ')');
  }
  console.log();

  // 3. 分析テスト: 既存 + 新規コンポーネントを含むケース
  console.log('=== analyze() テスト ===');
  console.log('入力: 既存テンプレート(9シナリオ共有) + 既存シナリオ + 新規2件');
  console.log();

  const analysis = await analyze([
    'scenario:1165687',                           // 既存: 予約後-オートウェビナー誘導
    'template:ステップ配信後-予約誘導-カウン...',  // 既存: 9シナリオから共有
    'scenario:新規テストシナリオ',                  // 新規
    'tag:新規テストタグ',                           // 新規
  ]);

  console.log('--- コンポーネント ---');
  for (const c of analysis.components) {
    console.log(`  ${c.nodeId} | ${c.status}${c.notes ? ' | ' + c.notes : ''}`);
  }

  console.log();
  console.log('--- 前提条件 ---');
  if (analysis.prerequisites.length === 0) {
    console.log('  (なし)');
  }
  for (const p of analysis.prerequisites) {
    console.log(`  ${p.componentId} | satisfied: ${p.satisfied} | ${p.reason}`);
  }

  console.log();
  console.log('--- 影響警告 ---');
  if (analysis.impacts.length === 0) {
    console.log('  (なし)');
  }
  for (const w of analysis.impacts) {
    console.log(`  [${w.level}] ${w.message}`);
  }

  console.log();
  console.log('--- 共有リソース TOP5 ---');
  for (const s of analysis.sharedResources.slice(0, 5)) {
    console.log(`  ${s.nodeId} <- 参照: ${s.usedByCount}件`);
  }

  console.log();
  console.log('--- 実行順序 ---');
  for (let i = 0; i < analysis.executionOrder.length; i++) {
    console.log(`  ${i + 1}. ${analysis.executionOrder[i]}`);
  }

  console.log();
  console.log('--- グラフサマリー ---');
  console.log(JSON.stringify(analysis.graphSummary, null, 2));

  console.log();
  console.log('--- 循環依存（関連） ---');
  if (analysis.cycles.length === 0) {
    console.log('  (なし)');
  }
  for (const cycle of analysis.cycles) {
    console.log('  ', cycle.join(' → '));
  }

  console.log();
  console.log('✅ analyze() 完了');
}

main().catch((err) => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});

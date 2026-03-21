// @ts-nocheck
/**
 * スパイク: シナリオ詳細ページのDOM構造調査
 * - 1つのシナリオ詳細ページに遷移
 * - ページのHTML構造をキャプチャ
 * - ステップ・アクション・分岐条件のセレクタ候補を特定
 */
import { connectToLstep, getLstepPage, disconnect } from './connection';
import { log } from './utils';
import * as fs from 'fs/promises';

async function main() {
  const cdpUrl = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
  const conn = await connectToLstep({ cdpUrl });

  // シナリオ一覧から最初のシナリオ詳細に遷移
  // 前回の結果から: id=1075706 (症例動画-ステップ配信-叢生) が配信数3でデータが多い
  const detailPath = '/line/content/1075706';
  log('info', `Navigating to scenario detail: ${detailPath}`);
  const page = await getLstepPage(conn, detailPath);

  // ページが完全に描画されるのを待つ
  await page.waitForTimeout(3000);

  log('info', `Current URL: ${page.url()}`);

  // ページ全体のHTMLを取得（body内のみ）
  const html = await page.evaluate(() => document.body.innerHTML);
  await fs.writeFile('data/spike_detail_page.html', html, 'utf-8');
  log('info', 'Saved full HTML to data/spike_detail_page.html');

  // テーブルやリスト構造を探索
  const structure = await page.evaluate(() => {
    const result: Record<string, string[]> = {};

    // ステップっぽい要素を探す
    const stepCandidates = [
      // カード・リスト系
      '[class*="step"]',
      '[class*="Step"]',
      '[class*="message"]',
      '[class*="Message"]',
      '[class*="timeline"]',
      '[class*="Timeline"]',
      '[class*="card"]',
      '[class*="Card"]',
      '[data-v-]',
      // テーブル系
      'table tbody tr',
      '.tw-card',
      '[class*="scenario"]',
      '[class*="content"]',
    ];

    for (const selector of stepCandidates) {
      try {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) {
          const samples: string[] = [];
          for (let i = 0; i < Math.min(els.length, 3); i++) {
            const el = els[i];
            const tag = el.tagName.toLowerCase();
            const cls = el.className?.toString().slice(0, 100) || '';
            const text = el.textContent?.trim().slice(0, 80) || '';
            samples.push(`<${tag} class="${cls}"> ${text}`);
          }
          result[`${selector} (${els.length})`] = samples;
        }
      } catch { /* skip invalid selectors */ }
    }

    return result;
  });

  console.log('\n=== DOM構造調査結果 ===');
  for (const [selector, samples] of Object.entries(structure)) {
    console.log(`\n${selector}:`);
    for (const s of samples) {
      console.log(`  ${s}`);
    }
  }

  // アクション関連のテキストを検索
  const actionTexts = await page.evaluate(() => {
    const body = document.body.innerText;
    const keywords = ['タグ', 'シナリオ', 'リッチメニュー', 'テンプレート', 'アクション', '条件', '分岐'];
    const found: string[] = [];
    for (const kw of keywords) {
      const idx = body.indexOf(kw);
      if (idx >= 0) {
        found.push(`"${kw}" found at index ${idx}: ...${body.slice(Math.max(0, idx - 20), idx + 50)}...`);
      }
    }
    return found;
  });

  console.log('\n=== キーワード検索結果 ===');
  for (const t of actionTexts) {
    console.log(`  ${t}`);
  }

  await disconnect(conn);
  log('info', '=== スパイク完了 ===');
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});

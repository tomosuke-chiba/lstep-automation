import * as fs from 'fs/promises';
import * as path from 'path';
import type { Page } from 'playwright';

// =============================================================
// randomWait
// =============================================================

export async function randomWait(minMs = 500, maxMs = 1500): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// =============================================================
// retry
// =============================================================

export async function retry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; delayMs?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000 } = opts;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      log('warn', `retry attempt ${attempt}/${maxAttempts} failed`, err);
      if (attempt < maxAttempts) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

// =============================================================
// log
// =============================================================

export function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: unknown
): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  if (meta !== undefined) {
    console.log(`${prefix} ${message}`, meta);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// =============================================================
// saveJson / loadJson
// =============================================================

export async function saveJson(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  log('info', `saved: ${filePath}`);
}

export async function loadJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// =============================================================
// generateTimestamp
// =============================================================

export function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

// =============================================================
// waitForPage
// =============================================================

export async function waitForPage(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

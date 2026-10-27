import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('app bootstrap', () => {
  test('the entrypoint initializes i18next before rendering', () => {
    const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
    expect(main).toMatch(/^import '@\/i18n';$/m);
    expect(main.indexOf("import '@/i18n';")).toBeLessThan(main.indexOf('createRoot('));
  });
});

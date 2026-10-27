import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const readSource = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = readSource('src/features/logs/LogsPage.tsx');
const styles = readSource('src/features/logs/LogsPage.module.scss');
const menu = readSource('src/features/logs/components/LogsMenu.tsx');

// Structural guards complement the browser viewport/interaction checks. They do not
// assert browser layout: the important contract is a single flexible scrolling viewer.
describe('log workspace layout contract', () => {
  test('viewer uses remaining space instead of resolution-specific height budgets', () => {
    const panel = styles.match(/\.logPanel \{([^}]+)\}/)?.[1] ?? '';
    expect(panel).toContain('flex: 1');
    expect(panel).toContain('min-height: 0');
    expect(panel).toContain('overflow: auto');
    expect(panel).not.toMatch(/(?:max-height|height):\s*(?:calc|\d+px)/);
    expect(styles).not.toContain('resize: vertical');
    expect(styles).not.toMatch(/calc\(100vh\s*-/);
    expect(styles).not.toMatch(/\n\s*(?:height|min-height|max-height):\s*(?:360|420|480)px/);
  });

  test('error archive uses the flexible viewport contract', () => {
    const archive = styles.match(/\.errorPanel \{([^}]+)\}/)?.[1] ?? '';
    expect(archive).toContain('flex: 1');
    expect(archive).toContain('min-height: 0');
    expect(archive).not.toMatch(/\bheight:\s*\d+px/);
    expect(page).toContain('className={styles.errorCard}');
  });

  test('rare actions live in a menu; fullscreen, raw and wrap modes are gone', () => {
    expect(page).toContain('<LogsMenu');
    expect(page).toContain("'logsPage.hideManagementLogs'");
    expect(page).not.toContain('fullscreen');
    expect(page).not.toContain('showRawLogs');
    expect(page).not.toContain('wrapLogs');
    expect(page).not.toContain('structuredFilters');
    expect(menu).toContain('aria-haspopup="menu"');
    expect(menu).toContain('role="menuitemcheckbox"');
    expect(menu).toContain("event.key === 'Escape'");
  });

  test('row actions do not wrap into an empty line or remove keyboard access', () => {
    const copy = styles.match(/^\.copyButton:global\(\.btn\) \{([^}]+)\}/m)?.[1] ?? '';
    expect(copy).toContain('position: sticky');
    expect(styles).toContain('width: max-content');
    expect(styles).toContain('flex-wrap: nowrap');
    expect(styles).toContain('.logRow:focus-within .copyButton');
    expect(page).toContain("aria-label={t('logs.copy_line')}");
    expect(page).toContain('tabIndex={0}');
    expect(page).toContain("aria-label={t('logs.log_content')}");
    expect(page).toContain('aria-pressed={autoRefresh}');
  });

  test('background refresh retains loaded content and compact status stays outside viewer', () => {
    expect(page).toContain('loading && logBuffer.buffer.length === 0');
    expect(page).toContain('<footer className={styles.statusBar}>');
    expect(page).toContain('<div className={styles.viewerArea}>');
    expect(page).toContain('onScroll={handleLogScroll}');
    expect(page).toContain('onClick={resumeFollowing}');
    expect(page).toContain('data-log-id={line.id}');
  });

  test('routine buffer eviction does not add a persistent warning banner', () => {
    expect(page).not.toContain("t('logs.buffer_evicted')");
    expect(page).not.toContain('logBuffer.evicted > 0');
    // A lost reading position and a backend cursor reset remain actionable notices.
    expect(page).toContain("t('logs.history_evicted')");
    expect(page).toContain("t('logs.cursor_reset_notice')");
  });

  test('toolbar controls share one sizing rule rather than mixing small variants', () => {
    expect(page).toContain('className={styles.levelSelect}');
    expect(styles).toMatch(
      /\.searchInput:global\(\.input\),\s*\.levelSelect > button,\s*\.actionButton:global\(\.btn\) \{[^}]*height: var\(--log-control-height\)/
    );
    expect(styles).toContain('--log-control-height: 40px');
    expect(styles).toContain('--log-control-height: 36px');
    expect(styles).toContain('width: var(--log-control-height)');
    expect(styles).not.toContain('height: 32px');
  });

  test('the locale describes the remaining log controls', () => {
    const messages = JSON.parse(readSource('src/i18n/locales/en.json'));
    expect(messages.logs.live_toggle).toBeTruthy();
    expect(messages.logs.more_actions).toBeTruthy();
    expect(messages.logs.hide_management_logs).toBeTruthy();
  });
});

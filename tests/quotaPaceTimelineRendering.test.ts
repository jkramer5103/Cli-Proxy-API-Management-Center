import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import '@/i18n';
import { QuotaPaceTimeline } from '@/features/quota/components/QuotaPaceTimeline';
import { DEFAULT_PACE_PREFS, type PaceTimelinePrefs } from '@/features/quota/paceTimelinePrefs';
import type { PaceAccountInput } from '@/features/quota/quotaPaceModel';
import { DAY_MS, HOUR_MS } from '@/utils/time/durations';

const NOW = new Date(2026, 9, 28, 12).getTime();

const claude = (key: string, weeklyUsed: number, fiveHourUsed: number): PaceAccountInput => ({
  key: `${key}.json`,
  title: `${key}@example.com`,
  provider: 'claude',
  quota: {
    status: 'success',
    windows: [
      { id: 'seven-day', usedPercent: weeklyUsed, resetAtMs: NOW + 3.5 * DAY_MS, periodHours: 168 },
      { id: 'five-hour', usedPercent: fiveHourUsed, resetAtMs: NOW + HOUR_MS, periodHours: 5 },
    ],
  },
  claudeGrants: [{ resetsLeft: 2, endsAt: new Date(NOW + 6 * HOUR_MS).toISOString() }],
  available: fiveHourUsed < 100,
});

const render = (accounts: PaceAccountInput[], prefs: Partial<PaceTimelinePrefs> = {}) =>
  renderToStaticMarkup(
    createElement(QuotaPaceTimeline, {
      accounts,
      providerOrder: ['claude', 'codex'],
      prefs: { ...DEFAULT_PACE_PREFS, ...prefs },
      onPrefsChange: () => {},
      onSelect: () => {},
      now: NOW,
    })
  );

describe('QuotaPaceTimeline rendering', () => {
  test('shows verdicts, the pool and banked expiries on the 7d view', () => {
    const markup = render([claude('alice', 70, 10), claude('bob', 20, 100)]);
    expect(markup).toContain('Quota timeline');
    expect(markup).toContain('alice@example.com');
    expect(markup).toContain('Slow down');
    expect(markup).toContain('Speed up');
    expect(markup).toContain('30% left');
    expect(markup).toContain('Claude pool');
    expect(markup).toContain('1 of 2 available now');
    expect(markup).toContain('Use soon · 2');
    expect(markup).toContain('aria-pressed="true">7 days</button>');
  });

  test('the 5h view shows 5-hour windows, limits and no banked marks', () => {
    const markup = render([claude('alice', 70, 10), claude('bob', 20, 100)], { view: '5h' });
    expect(markup).toContain('aria-pressed="true">5 hours</button>');
    expect(markup).toContain('Limited · in 1 hr.');
    expect(markup).not.toContain('Use soon');
  });

  test('a lone account gets no pool; hidden accounts drop off', () => {
    expect(render([claude('alice', 70, 10)])).not.toContain('pool');
    const markup = render([claude('alice', 70, 10), claude('bob', 20, 10)], {
      hidden: ['bob.json'],
    });
    expect(markup).not.toContain('bob@example.com');
    expect(markup).not.toContain('Claude pool');
  });

  test('collapsing keeps the header and drops the chart', () => {
    const markup = render([claude('alice', 70, 10)], { collapsed: true });
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('alice@example.com');
  });

  test('renders nothing without accounts', () => {
    expect(render([])).toBe('');
  });
});

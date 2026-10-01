import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cancelTerminalThemeUpdate,
  resetTerminalThemeSchedulerForTests,
  scheduleTerminalThemeUpdate,
  applyTerminalThemeSync,
} from './terminalThemeScheduler';
import type { TerminalTheme } from '../../domain/models';

const theme = (id: string): TerminalTheme => ({
  id,
  name: id,
  type: 'dark',
  colors: {
    background: '#111111',
    foreground: '#eeeeee',
    cursor: '#22aaff',
    selection: '#22aaff44',
    black: '#000',
    red: '#000',
    green: '#000',
    yellow: '#000',
    blue: '#000',
    magenta: '#000',
    cyan: '#000',
    white: '#fff',
    brightBlack: '#000',
    brightRed: '#000',
    brightGreen: '#000',
    brightYellow: '#000',
    brightBlue: '#000',
    brightMagenta: '#000',
    brightCyan: '#000',
    brightWhite: '#fff',
  },
});

test('cancelTerminalThemeUpdate drops a pending hidden-pane theme flush', async () => {
  resetTerminalThemeSchedulerForTests();
  let appliedThemeId: string | null = null;
  const fakeTerm = {
    options: { theme: {} as Record<string, string> },
  };

  scheduleTerminalThemeUpdate(
    'session-1',
    theme('old-theme'),
    { visible: false, focused: false },
    () => fakeTerm as never,
  );

  cancelTerminalThemeUpdate('session-1');

  await new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });

  appliedThemeId = fakeTerm.options.theme.background ?? null;
  assert.equal(appliedThemeId, null);
});

test('hidden terminal theme updates do not wait for browser idle time', async () => {
  resetTerminalThemeSchedulerForTests();
  const fakeTerm = {
    options: { theme: {} as Record<string, string> },
  };

  scheduleTerminalThemeUpdate(
    'session-2',
    theme('new-theme'),
    { visible: false, focused: false },
    () => fakeTerm as never,
  );

  await Promise.resolve();
  assert.equal(fakeTerm.options.theme.background, '#111111');
});

test('unchanged focus and tab theme updates do not rebuild renderer colors', () => {
  let changes = 0;
  let currentTheme = {};
  const fakeTerm = {
    options: {
      allowTransparency: false,
      get theme() { return currentTheme; },
      set theme(value) { currentTheme = value; changes += 1; },
    },
  };
  applyTerminalThemeSync(fakeTerm as never, theme('same'));
  applyTerminalThemeSync(fakeTerm as never, theme('same'));
  assert.equal(changes, 1);
  const changed = theme('same');
  changed.colors.red = '#ff0000';
  applyTerminalThemeSync(fakeTerm as never, changed);
  assert.equal(changes, 2, 'ANSI palette changes still apply even when the theme ID is unchanged');
  fakeTerm.options.allowTransparency = true;
  applyTerminalThemeSync(fakeTerm as never, changed);
  assert.equal(changes, 3, 'transparency changes still restore the background');
  changed.colors.foregroundIntense = '#ffffff';
  applyTerminalThemeSync(fakeTerm as never, changed);
  applyTerminalThemeSync(fakeTerm as never, theme('same'));
  assert.equal(changes, 5, 'removing optional colors must not leave stale palette overrides');
});

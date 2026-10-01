import type { ITheme, Terminal } from '@xterm/xterm';
import type { TerminalTheme } from '../../domain/models';
import { resolveTransparentTerminalBackground } from '../../domain/appBackground';
import { isAppBackgroundActiveNow } from '../../application/state/appBackgroundStore';
import { forceSyncRenderAfterResize } from './terminalHelpers';

type PendingUpdate = {
  theme: TerminalTheme;
  getTerminal: () => Terminal | null;
};

const pendingBySession = new Map<string, PendingUpdate>();
let flushScheduled = false;

function themeFingerprint(theme: TerminalTheme): string {
  return `${theme.id}:${theme.colors.background}:${theme.colors.foreground}:${theme.colors.cursor}`;
}

/**
 * xterm theme for a terminal theme. With `transparentBackground` (app
 * background image active) the default cell background is fully transparent
 * and the pane container paints the tinted surface instead.
 */
export function buildXTermTheme(theme: TerminalTheme, transparentBackground: boolean): ITheme {
  return {
    ...theme.colors,
    background: transparentBackground
      ? resolveTransparentTerminalBackground(theme.colors.background)
      : theme.colors.background,
    selectionBackground: theme.colors.selection,
    // Scrollbar theming (xterm 6.0) — derive from foreground color
    scrollbarSliderBackground: theme.colors.foreground + '33', // 20% opacity
    scrollbarSliderHoverBackground: theme.colors.foreground + '66', // 40% opacity
    scrollbarSliderActiveBackground: theme.colors.foreground + '80', // 50% opacity
  };
}

function applyThemeToTerminal(term: Terminal, theme: TerminalTheme): void {
  const transparentBackground = isAppBackgroundActiveNow();
  const nextTheme = buildXTermTheme(theme, transparentBackground);
  if (
    term.options.allowTransparency === transparentBackground
    && Object.keys({ ...term.options.theme, ...nextTheme }).every((key) =>
      term.options.theme?.[key as keyof ITheme] === nextTheme[key as keyof ITheme])
  ) return;
  // WebGL and DOM renderers both pick up allowTransparency at runtime (the
  // WebGL addon rebuilds its glyph atlas on any option change).
  if (term.options.allowTransparency !== transparentBackground) {
    term.options.allowTransparency = transparentBackground;
  }
  term.options.theme = nextTheme;
  forceSyncRenderAfterResize(term);
}

export function applyTerminalThemeSync(term: Terminal, theme: TerminalTheme): void {
  applyThemeToTerminal(term, theme);
}

function flushPendingUpdates(): void {
  flushScheduled = false;
  const entries = [...pendingBySession.entries()];
  pendingBySession.clear();

  for (const [, update] of entries) {
    const term = update.getTerminal();
    if (!term) continue;
    applyThemeToTerminal(term, update.theme);
  }
}

export function cancelTerminalThemeUpdate(sessionId: string): void {
  pendingBySession.delete(sessionId);
}

export function scheduleTerminalThemeUpdate(
  sessionId: string,
  theme: TerminalTheme,
  _options: { visible: boolean; focused: boolean },
  getTerminal: () => Terminal | null,
): void {
  const existing = pendingBySession.get(sessionId);
  if (existing && themeFingerprint(existing.theme) === themeFingerprint(theme)) {
    pendingBySession.set(sessionId, {
      theme,
      getTerminal,
    });
  } else {
    pendingBySession.set(sessionId, {
      theme,
      getTerminal,
    });
  }

  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flushPendingUpdates);
}

export function resetTerminalThemeSchedulerForTests(): void {
  pendingBySession.clear();
  flushScheduled = false;
}

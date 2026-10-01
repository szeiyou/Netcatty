import type { Terminal as XTerm } from "@xterm/xterm";
import {
  isTerminalPerformanceDebugEnabled,
  logTerminalOutputPerf,
} from "./terminalPerformanceDiagnostics";
import { hasPendingTerminalWrites } from "./terminalUnfocusedRepaint";

type DiagnosticOptions = {
  sessionId: string;
  getRenderer: () => string;
  document: Pick<Document, "hasFocus" | "visibilityState" | "addEventListener" | "removeEventListener">;
  window: Pick<Window, "addEventListener" | "removeEventListener">;
  enabled?: () => boolean;
  log?: (event: string, details: Record<string, unknown>) => void;
  now?: () => number;
};

/** Opt-in timing and buffer statistics. Never records terminal text. */
export function attachTerminalRenderDiagnostics(term: XTerm, options: DiagnosticOptions) {
  const enabled = options.enabled ?? isTerminalPerformanceDebugEnabled;
  const now = options.now ?? Date.now;
  const log = options.log ?? ((event, details) => logTerminalOutputPerf(event, null, details));
  let renders = 0;
  let parses = 0;
  let lastSampleAt = Number.NEGATIVE_INFINITY;
  let previousRenderAt: number | undefined;
  let maxRenderGapMs = 0;

  const record = (event: string) => {
    if (!enabled()) return;
    // Diagnostic collection must not interrupt rendering, including disposal.
    try {
      const buffer = term.buffer.active;
      let nonEmptyRows = 0;
      for (let row = 0; row < term.rows; row += 1) {
        if (buffer.getLine(buffer.viewportY + row)?.translateToString(true).trim()) nonEmptyRows += 1;
      }
      log(event, {
        sessionId: options.sessionId,
        renderer: options.getRenderer(),
        focused: options.document.hasFocus(),
        visibility: options.document.visibilityState,
        buffer: buffer.type,
        synchronizedOutput: term.modes.synchronizedOutputMode,
        pendingWrites: hasPendingTerminalWrites(term),
        cols: term.cols,
        rows: term.rows,
        nonEmptyRows,
        renders,
        parses,
        maxRenderGapMs,
      });
    } catch {
      // Optional diagnostics must never affect terminal behavior.
    }
  };

  const render = term.onRender(() => {
    if (!enabled()) {
      previousRenderAt = undefined;
      return;
    }
    const at = now();
    renders += 1;
    if (previousRenderAt !== undefined) maxRenderGapMs = Math.max(maxRenderGapMs, at - previousRenderAt);
    previousRenderAt = at;
    // Sample at most ten times per second, even when a TUI continuously redraws.
    if (at - lastSampleAt < 100) return;
    record("render-sample");
    renders = 0;
    parses = 0;
    maxRenderGapMs = 0;
    lastSampleAt = at;
  });
  const parsed = term.onWriteParsed(() => { if (enabled()) parses += 1; });
  const focus = () => record("window-focus");
  const blur = () => record("window-blur");
  const visibility = () => record("window-visibility");
  options.window.addEventListener("focus", focus);
  options.window.addEventListener("blur", blur);
  options.document.addEventListener("visibilitychange", visibility);

  return {
    record,
    dispose() {
      render.dispose();
      parsed.dispose();
      options.window.removeEventListener("focus", focus);
      options.window.removeEventListener("blur", blur);
      options.document.removeEventListener("visibilitychange", visibility);
    },
  };
}

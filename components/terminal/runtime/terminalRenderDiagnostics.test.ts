import assert from "node:assert/strict";
import test from "node:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import { attachTerminalRenderDiagnostics } from "./terminalRenderDiagnostics";

function harness() {
  let enabled = false;
  let at = 0;
  let focused = true;
  let bufferReads = 0;
  const renderCallbacks = new Set<() => void>();
  const parseCallbacks = new Set<() => void>();
  const entries: Array<{ event: string; details: Record<string, unknown> }> = [];
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { hasFocus: () => focused, visibilityState: "visible" as const });
  const term = {
    cols: 80,
    rows: 2,
    modes: { synchronizedOutputMode: false },
    buffer: { active: {
      type: "normal", viewportY: 0,
      getLine(row: number) {
        bufferReads += 1;
        return { translateToString: () => row === 0 ? "private terminal contents" : "  " };
      },
    } },
    onRender(callback: () => void) {
      renderCallbacks.add(callback);
      return { dispose: () => { renderCallbacks.delete(callback); } };
    },
    onWriteParsed(callback: () => void) {
      parseCallbacks.add(callback);
      return { dispose: () => { parseCallbacks.delete(callback); } };
    },
  } as unknown as XTerm;
  const diagnostic = attachTerminalRenderDiagnostics(term, {
    sessionId: "s1", getRenderer: () => "webgl", document: doc, window: win,
    enabled: () => enabled, now: () => at,
    log: (event, details) => { entries.push({ event, details }); },
  });
  return {
    diagnostic, entries, win, doc, renderCallbacks, parseCallbacks,
    render: () => { for (const callback of renderCallbacks) callback(); },
    parse: () => { for (const callback of parseCallbacks) callback(); },
    enable: () => { enabled = true; },
    unfocus: () => { focused = false; },
    advance: (ms: number) => { at += ms; },
    bufferReads: () => bufferReads,
  };
}

test("disabled rendering diagnostics do not scan or log terminal contents", () => {
  const h = harness();
  h.render(); h.parse(); h.win.dispatchEvent(new Event("blur"));
  h.diagnostic.record("atlas-clear");
  assert.equal(h.bufferReads(), 0);
  assert.deepEqual(h.entries, []);
  h.diagnostic.dispose();
});

test("render samples aggregate timing and blank rows without logging text", () => {
  const h = harness();
  h.enable(); h.render();
  h.advance(16); h.parse(); h.render();
  h.advance(84); h.parse(); h.render();
  assert.equal(h.entries.length, 2);
  assert.equal(h.entries[1].details.renders, 2);
  assert.equal(h.entries[1].details.parses, 2);
  assert.equal(h.entries[1].details.maxRenderGapMs, 84);
  assert.equal(h.entries[1].details.nonEmptyRows, 1);
  assert.equal(h.entries[1].details.renderer, "webgl");
  assert.doesNotMatch(JSON.stringify(h.entries), /private terminal contents/);
  h.diagnostic.dispose();
});

test("focus and visibility diagnostics remain available without terminal output and stop after disposal", () => {
  const h = harness();
  h.enable(); h.unfocus();
  h.win.dispatchEvent(new Event("blur"));
  h.doc.dispatchEvent(new Event("visibilitychange"));
  assert.deepEqual(h.entries.map(entry => entry.event), ["window-blur", "window-visibility"]);
  assert.equal(h.entries[0].details.focused, false);
  h.diagnostic.dispose();
  h.win.dispatchEvent(new Event("focus"));
  h.doc.dispatchEvent(new Event("visibilitychange"));
  h.render(); h.parse();
  assert.equal(h.entries.length, 2);
  assert.equal(h.renderCallbacks.size, 0);
  assert.equal(h.parseCallbacks.size, 0);
});

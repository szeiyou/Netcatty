import assert from "node:assert/strict";
import test from "node:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import { installRetainedWebglFrameClear } from "./retainedWebglFrame";

test("retained frames clear old transparent pixels only when drawing the next frame", () => {
  const calls: unknown[] = [];
  const renderer = {
    _gl: {
      COLOR_BUFFER_BIT: 16384,
      clearColor(...args: number[]) { calls.push(args); },
      clear(mask: number) { calls.push(mask); },
    },
    renderRows(start: number, end: number) { calls.push([this === renderer, start, end]); },
  };
  const original = renderer.renderRows;
  const term = { _core: { _renderService: { _renderer: { value: renderer } } } } as unknown as XTerm;
  const dispose = installRetainedWebglFrameClear(term);
  assert.deepEqual(calls, [], "installing the hook must preserve the current frame");
  renderer.renderRows(2, 5);
  assert.deepEqual(calls, [[0, 0, 0, 0], 16384, [true, 2, 5]]);
  dispose();
  assert.equal(renderer.renderRows, original);
});

test("unsupported xterm renderer fails closed so the controller can fall back to DOM", () => {
  assert.throws(() => installRetainedWebglFrameClear({} as XTerm), /unavailable/);
});

import type { Terminal as XTerm } from "@xterm/xterm";

type WebglRenderer = {
  _gl: Pick<WebGL2RenderingContext, "clear" | "clearColor" | "COLOR_BUFFER_BIT">;
  renderRows(start: number, end: number): void;
};

/** Clear only when replacing a retained frame, including transparent backgrounds. */
export function installRetainedWebglFrameClear(term: XTerm): () => void {
  // Pinned xterm exposes the active renderer through a MutableDisposable.
  // RenderService still owns synchronized-output gating before renderRows.
  const renderer = (term as XTerm & {
    _core?: { _renderService?: { _renderer?: { value?: WebglRenderer } } };
  })._core?._renderService?._renderer?.value;
  if (!renderer?._gl || typeof renderer.renderRows !== "function") {
    throw new Error("Retained WebGL frame renderer is unavailable");
  }
  const original = renderer.renderRows;
  const retainedRender = function(this: WebglRenderer, start: number, end: number) {
    this._gl.clearColor(0, 0, 0, 0);
    this._gl.clear(this._gl.COLOR_BUFFER_BIT);
    original.call(this, start, end);
  };
  renderer.renderRows = retainedRender;
  return () => {
    if (renderer.renderRows === retainedRender) renderer.renderRows = original;
  };
}

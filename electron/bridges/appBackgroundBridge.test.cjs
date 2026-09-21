const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const bridge = require("./appBackgroundBridge.cjs");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "netcatty-app-bg-test-"));
}

test("importImage copies the file under a content-hash id", async () => {
  const userDataDir = makeTempDir();
  const srcDir = makeTempDir();
  const src = path.join(srcDir, "Wallpaper.PNG");
  fs.writeFileSync(src, Buffer.from("fake png bytes"));
  bridge.init({ userDataDir });

  const result = await bridge.importImage(src);
  assert.equal(result.ok, true);
  assert.match(result.imageId, /^[a-f0-9]{32}\.png$/);
  const stored = path.join(userDataDir, "app-backgrounds", result.imageId);
  assert.equal(fs.readFileSync(stored, "utf8"), "fake png bytes");

  // Same bytes -> same id, no duplicate copy.
  const again = await bridge.importImage(src);
  assert.equal(again.imageId, result.imageId);
  assert.deepEqual(fs.readdirSync(path.join(userDataDir, "app-backgrounds")), [result.imageId]);
});

test("importImage rejects unsupported extensions and oversized files", async () => {
  const userDataDir = makeTempDir();
  const srcDir = makeTempDir();
  bridge.init({ userDataDir });

  const svg = path.join(srcDir, "x.svg");
  fs.writeFileSync(svg, "<svg/>");
  assert.deepEqual(await bridge.importImage(svg), { ok: false, error: "unsupported-type" });

  const big = path.join(srcDir, "big.jpg");
  fs.writeFileSync(big, "");
  fs.truncateSync(big, bridge.MAX_IMAGE_BYTES + 1);
  const result = await bridge.importImage(big);
  assert.equal(result.ok, false);
  assert.equal(result.error, "too-large");

  assert.deepEqual(await bridge.importImage(path.join(srcDir, "missing.png")), { ok: false, error: "not-found" });
});

test("protocol serves imported images with the right mime type", async () => {
  const userDataDir = makeTempDir();
  const srcDir = makeTempDir();
  const src = path.join(srcDir, "a.webp");
  fs.writeFileSync(src, "webp-data");
  bridge.init({ userDataDir });
  const { imageId } = await bridge.importImage(src);

  const res = await bridge.handleProtocolRequest({ url: `netcatty-bg://image/${imageId}` });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "image/webp");
  assert.equal(await res.text(), "webp-data");
});

test("protocol refuses paths outside the image directory", async () => {
  const userDataDir = makeTempDir();
  bridge.init({ userDataDir });
  fs.writeFileSync(path.join(userDataDir, "secret.png"), "secret");

  for (const url of [
    "netcatty-bg://image/..%2Fsecret.png",
    "netcatty-bg://image/../secret.png",
    "netcatty-bg://image/%2e%2e%2fsecret.png",
    "netcatty-bg://other/0123456789abcdef.png",
    "netcatty-bg://image/0123456789abcdef.svg",
  ]) {
    const res = await bridge.handleProtocolRequest({ url });
    assert.notEqual(res.status, 200, url);
  }
});

test("removeImage deletes only valid ids", async () => {
  const userDataDir = makeTempDir();
  const srcDir = makeTempDir();
  const src = path.join(srcDir, "a.png");
  fs.writeFileSync(src, "png");
  bridge.init({ userDataDir });
  const { imageId } = await bridge.importImage(src);

  assert.deepEqual(await bridge.removeImage("../a.png"), { ok: false, error: "invalid-id" });
  assert.deepEqual(await bridge.removeImage(imageId), { ok: true });
  assert.equal(fs.existsSync(path.join(userDataDir, "app-backgrounds", imageId)), false);
  // Removing again is a no-op.
  assert.deepEqual(await bridge.removeImage(imageId), { ok: true });
});

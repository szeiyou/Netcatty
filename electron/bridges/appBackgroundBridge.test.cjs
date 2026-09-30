const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const bridge = require("./appBackgroundBridge.cjs");

test("picker imports every selected file in selection order", async () => {
  const userDataDir = makeTempDir();
  const srcDir = makeTempDir();
  const first = path.join(srcDir, "first.png");
  const second = path.join(srcDir, "second.jpg");
  fs.writeFileSync(first, "first");
  fs.writeFileSync(second, "second");
  let options;
  bridge.init({
    userDataDir,
    electronModule: {
      dialog: { showOpenDialog: async (value) => {
        options = value;
        return { canceled: false, filePaths: [first, second] };
      } },
    },
  });
  const result = await bridge.pickAndImportImage();
  assert.ok(options.properties.includes("multiSelections"));
  assert.equal(result.ok, true);
  assert.equal(result.images.length, 2);
  assert.match(result.images[0].imageId, /\.png$/);
  assert.match(result.images[1].imageId, /\.jpg$/);
});

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

test("importImage rejects unsupported extensions and missing files", async () => {
  const userDataDir = makeTempDir();
  const srcDir = makeTempDir();
  bridge.init({ userDataDir });

  const svg = path.join(srcDir, "x.svg");
  fs.writeFileSync(svg, "<svg/>");
  assert.deepEqual(await bridge.importImage(svg), { ok: false, error: "unsupported-type" });

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

test("importImage accepts mp4/webm videos and never flags them animated", async () => {
  const userDataDir = makeTempDir();
  const srcDir = makeTempDir();
  bridge.init({ userDataDir });

  for (const name of ["clip.mp4", "clip.WEBM"]) {
    const src = path.join(srcDir, name);
    fs.writeFileSync(src, `video bytes ${name}`);
    const result = await bridge.importImage(src);
    assert.equal(result.ok, true);
    assert.match(result.imageId, /^[a-f0-9]{32}\.(mp4|webm)$/);
    assert.equal(result.animated, undefined);
  }
});

test("importImage flags animated images", async () => {
  const userDataDir = makeTempDir();
  const srcDir = makeTempDir();
  bridge.init({ userDataDir });

  const webpHead = (flags) => {
    const buf = Buffer.alloc(40);
    buf.write("RIFF", 0, "latin1");
    buf.write("WEBPVP8X", 8, "latin1");
    buf[20] = flags;
    return buf;
  };
  const cases = [
    ["anim.webp", webpHead(0x12), true],
    ["still.webp", webpHead(0x10), false],
    ["anim.gif", Buffer.from("GIF89a....!\xff\x0bNETSCAPE2.0", "latin1"), true],
    ["still.gif", Buffer.from("GIF89a....", "latin1"), false],
    ["anim.png", Buffer.from("\x89PNG\r\n\x1a\n....acTL....IDAT", "latin1"), true],
    ["still.png", Buffer.from("\x89PNG\r\n\x1a\n....IDAT", "latin1"), false],
    ["anim.avif", Buffer.from("....ftypavis....", "latin1"), true],
    ["still.avif", Buffer.from("....ftypavif....", "latin1"), false],
  ];
  for (const [name, bytes, animated] of cases) {
    const src = path.join(srcDir, name);
    fs.writeFileSync(src, bytes);
    const result = await bridge.importImage(src);
    assert.equal(result.ok, true, name);
    assert.equal(result.animated === true, animated, name);
  }
});

test("parseRange handles single byte ranges", () => {
  assert.equal(bridge.parseRange(undefined, 100), null);
  assert.equal(bridge.parseRange("bytes=0-1,5-6", 100), null);
  assert.deepEqual(bridge.parseRange("bytes=0-", 100), { start: 0, end: 99 });
  assert.deepEqual(bridge.parseRange("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(bridge.parseRange("bytes=90-500", 100), { start: 90, end: 99 });
  assert.deepEqual(bridge.parseRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.equal(bridge.parseRange("bytes=100-", 100), "unsatisfiable");
  assert.equal(bridge.parseRange("bytes=20-10", 100), "unsatisfiable");
});

test("protocol streams videos and honors range requests", async () => {
  const userDataDir = makeTempDir();
  const srcDir = makeTempDir();
  const src = path.join(srcDir, "loop.webm");
  fs.writeFileSync(src, "0123456789");
  bridge.init({ userDataDir });
  const { imageId } = await bridge.importImage(src);
  const url = `netcatty-bg://image/${imageId}`;
  const withRange = (range) => ({ url, headers: new Headers(range ? { range } : {}) });

  const full = await bridge.handleProtocolRequest(withRange());
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-type"), "video/webm");
  assert.equal(full.headers.get("accept-ranges"), "bytes");
  assert.equal(full.headers.get("content-length"), "10");
  assert.equal(await full.text(), "0123456789");

  const partial = await bridge.handleProtocolRequest(withRange("bytes=2-5"));
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(partial.headers.get("content-length"), "4");
  assert.equal(await partial.text(), "2345");

  const bad = await bridge.handleProtocolRequest(withRange("bytes=50-"));
  assert.equal(bad.status, 416);
  assert.equal(bad.headers.get("content-range"), "bytes */10");
});

test("protocol scheme can stream media", () => {
  assert.equal(bridge.PRIVILEGES.stream, true);
});

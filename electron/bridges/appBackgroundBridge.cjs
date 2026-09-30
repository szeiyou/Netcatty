/**
 * App Background Bridge - imports the user's app background image or video
 * and serves it to the renderer.
 *
 * Picked files are copied into {userData}/app-backgrounds/<sha256>.<ext> so
 * the background survives the original file being moved or deleted. The
 * renderer only ever sees the content-hash file name (imageId) and loads it
 * through the privileged `netcatty-bg://image/<imageId>` protocol; it can
 * neither choose the source path nor read anything outside that directory.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { pipeline } = require("node:stream/promises");
const { Readable, Transform } = require("node:stream");

const SCHEME = "netcatty-bg";
const IMAGE_DIR_NAME = "app-backgrounds";

const MIME_BY_EXTENSION = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
  mp4: "video/mp4",
  webm: "video/webm",
};

const VIDEO_EXTENSIONS = new Set(["mp4", "webm"]);

// Keep in sync with IMAGE_ID_PATTERN in domain/appBackground.ts.
const IMAGE_ID_PATTERN = /^[a-f0-9]{16,64}\.(png|jpg|jpeg|webp|gif|bmp|avif|mp4|webm)$/;

// Enough of the file head to find the animation markers below; they sit
// before the first frame's pixel data in every format we check.
const ANIMATION_SNIFF_BYTES = 256 * 1024;

let electronModule = null;
let userDataDir = null;

function init(deps = {}) {
  electronModule = deps.electronModule || electronModule;
  userDataDir = deps.userDataDir || userDataDir;
}

function getImageDir() {
  if (!userDataDir) {
    const app = electronModule?.app;
    userDataDir = app?.getPath?.("userData") ?? null;
  }
  if (!userDataDir) throw new Error("userData directory is not available");
  return path.join(userDataDir, IMAGE_DIR_NAME);
}

function isValidImageId(imageId) {
  return typeof imageId === "string" && IMAGE_ID_PATTERN.test(imageId);
}

function resolveImagePath(imageId) {
  if (!isValidImageId(imageId)) return null;
  const dir = path.resolve(getImageDir());
  const fullPath = path.resolve(dir, imageId);
  if (path.dirname(fullPath) !== dir) return null;
  return fullPath;
}

function resolveExtension(filePath) {
  const ext = path.extname(String(filePath || "")).slice(1).toLowerCase();
  return Object.prototype.hasOwnProperty.call(MIME_BY_EXTENSION, ext) ? ext : null;
}

/**
 * Whether an image file is animated. Animated images are decoded frame by
 * frame on the CPU for as long as they are shown, which is expensive at
 * wallpaper sizes, so the UI suggests a (hardware-decoded) video instead.
 */
function isAnimatedImageHead(ext, head) {
  switch (ext) {
    case "webp":
      // RIFF....WEBPVP8X, then a flags byte whose bit 1 is "animation".
      return head.length > 20
        && head.toString("latin1", 8, 16) === "WEBPVP8X"
        && (head[20] & 0x02) !== 0;
    case "gif":
      // Animated GIFs carry the NETSCAPE2.0 looping extension.
      return head.includes("NETSCAPE2.0", 0, "latin1");
    case "png":
      // APNG: an acTL chunk precedes the first IDAT.
      return head.includes("acTL", 0, "latin1");
    case "avif":
      // Image sequences use the "avis" brand in the ftyp box.
      return head.subarray(0, 64).includes("avis", 0, "latin1");
    default:
      return false;
  }
}

async function readHead(filePath, bytes) {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function importImage(sourcePath) {
  const ext = resolveExtension(sourcePath);
  if (!ext) {
    return { ok: false, error: "unsupported-type" };
  }

  let stat;
  try {
    stat = await fs.promises.stat(sourcePath);
  } catch {
    return { ok: false, error: "not-found" };
  }
  if (!stat.isFile()) return { ok: false, error: "not-found" };
  const animated = !VIDEO_EXTENSIONS.has(ext)
    && isAnimatedImageHead(ext, await readHead(sourcePath, ANIMATION_SNIFF_BYTES));

  // Stream the copy (hashing on the way) so large images are never buffered
  // whole in memory. Copy to a temp name first, then rename to the content
  // hash so a crash mid-copy never leaves a truncated image under a valid id.
  const dir = getImageDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `import-${process.pid}-${crypto.randomUUID()}.tmp`);
  const hasher = crypto.createHash("sha256");
  try {
    await pipeline(
      fs.createReadStream(sourcePath),
      new Transform({
        transform(chunk, _encoding, callback) {
          hasher.update(chunk);
          callback(null, chunk);
        },
      }),
      fs.createWriteStream(tmp),
    );
    const imageId = `${hasher.digest("hex").slice(0, 32)}.${ext}`;
    const target = resolveImagePath(imageId);
    if (fs.existsSync(target)) {
      await fs.promises.unlink(tmp);
    } else {
      await fs.promises.rename(tmp, target);
    }
    return animated ? { ok: true, imageId, animated: true } : { ok: true, imageId };
  } catch (err) {
    await fs.promises.unlink(tmp).catch(() => {});
    throw err;
  }
}

async function removeImage(imageId) {
  const target = resolveImagePath(imageId);
  if (!target) return { ok: false, error: "invalid-id" };
  try {
    await fs.promises.unlink(target);
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
  return { ok: true };
}

async function pickAndImportImage(event) {
  const { dialog, BrowserWindow } = electronModule || {};
  if (!dialog) return { ok: false, error: "unavailable" };
  const parent = BrowserWindow?.fromWebContents?.(event?.sender) ?? undefined;
  const options = {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Images & Videos", extensions: Object.keys(MIME_BY_EXTENSION) },
      { name: "Images", extensions: Object.keys(MIME_BY_EXTENSION).filter((ext) => !VIDEO_EXTENSIONS.has(ext)) },
      { name: "Videos", extensions: [...VIDEO_EXTENSIONS] },
    ],
  };
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths?.length) {
    return { ok: false, error: "canceled" };
  }
  const images = [];
  for (const filePath of result.filePaths) {
    const imported = await importImage(filePath);
    if (!imported.ok) return imported;
    images.push({ imageId: imported.imageId, animated: imported.animated === true });
  }
  return { ok: true, images };
}

/**
 * Parse a single `bytes=` range against a file size. Returns null when the
 * header is absent or not a single satisfiable range we understand (the
 * caller then serves the whole file), or "unsatisfiable".
 */
function parseRange(header, size) {
  if (typeof header !== "string") return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start;
  let end;
  if (match[1] === "") {
    // Suffix range: the last N bytes.
    const suffix = Number(match[2]);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

function fileResponse(target, request, stat) {
  const headers = {
    "Content-Type": MIME_BY_EXTENSION[resolveExtension(target)] || "application/octet-stream",
    // Content-addressed: the same imageId always maps to the same bytes.
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  };
  const range = parseRange(request.headers?.get?.("range"), stat.size);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${stat.size}` },
    });
  }
  // Stream from disk: videos can be large and are read in ranges while they
  // play, so never buffer the whole file.
  const { start, end } = range || { start: 0, end: Math.max(0, stat.size - 1) };
  const length = stat.size === 0 ? 0 : end - start + 1;
  const body = length === 0
    ? null
    : Readable.toWeb(fs.createReadStream(target, { start, end }));
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      "Content-Length": String(length),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${stat.size}` } : {}),
    },
  });
}

function notFound(status = 404) {
  return new Response(status === 404 ? "Not Found" : "Forbidden", {
    status,
    headers: { "Content-Type": "text/plain" },
  });
}

async function handleProtocolRequest(request) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return notFound();
  }
  if (url.host !== "image") return notFound();
  let imageId = url.pathname.replace(/^\/+/, "");
  try {
    imageId = decodeURIComponent(imageId);
  } catch {
    return notFound(403);
  }
  const target = resolveImagePath(imageId);
  if (!target) return notFound(403);
  let stat;
  try {
    stat = await fs.promises.stat(target);
  } catch {
    return notFound();
  }
  if (!stat.isFile()) return notFound();
  return fileResponse(target, request, stat);
}

function registerProtocol(protocol) {
  if (!protocol?.handle) return;
  try {
    protocol.handle(SCHEME, handleProtocolRequest);
  } catch (err) {
    console.error(`[AppBackground] Failed to register ${SCHEME}:// protocol handler:`, err);
  }
}

function registerHandlers(ipcMain) {
  ipcMain.handle("netcatty:appBackground:pickImage", (event) => pickAndImportImage(event));
  ipcMain.handle("netcatty:appBackground:removeImage", (_event, { imageId } = {}) => removeImage(imageId));
}

module.exports = {
  SCHEME,
  PRIVILEGES: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    // Required for <video> to stream (range requests) from this scheme.
    stream: true,
  },
  init,
  importImage,
  pickAndImportImage,
  isAnimatedImageHead,
  parseRange,
  removeImage,
  handleProtocolRequest,
  registerProtocol,
  registerHandlers,
  isValidImageId,
};

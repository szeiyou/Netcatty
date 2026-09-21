/**
 * App Background Bridge - imports the user's app background image and serves
 * it to the renderer.
 *
 * Picked images are copied into {userData}/app-backgrounds/<sha256>.<ext> so
 * the background survives the original file being moved or deleted. The
 * renderer only ever sees the content-hash file name (imageId) and loads it
 * through the privileged `netcatty-bg://image/<imageId>` protocol; it can
 * neither choose the source path nor read anything outside that directory.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const SCHEME = "netcatty-bg";
const IMAGE_DIR_NAME = "app-backgrounds";
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

const MIME_BY_EXTENSION = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
};

// Keep in sync with IMAGE_ID_PATTERN in domain/appBackground.ts.
const IMAGE_ID_PATTERN = /^[a-f0-9]{16,64}\.(png|jpg|jpeg|webp|gif|bmp|avif)$/;

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
  if (stat.size > MAX_IMAGE_BYTES) return { ok: false, error: "too-large", maxBytes: MAX_IMAGE_BYTES };

  const data = await fs.promises.readFile(sourcePath);
  const hash = crypto.createHash("sha256").update(data).digest("hex").slice(0, 32);
  const imageId = `${hash}.${ext}`;
  const dir = getImageDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const target = resolveImagePath(imageId);
  if (!fs.existsSync(target)) {
    // Write then rename so a crash mid-copy never leaves a truncated image
    // under a valid content-hash name.
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, data);
    await fs.promises.rename(tmp, target);
  }
  return { ok: true, imageId };
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
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: Object.keys(MIME_BY_EXTENSION) }],
  };
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths?.length) {
    return { ok: false, error: "canceled" };
  }
  return importImage(result.filePaths[0]);
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
  try {
    const data = await fs.promises.readFile(target);
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": MIME_BY_EXTENSION[resolveExtension(target)] || "application/octet-stream",
        // Content-addressed: the same imageId always maps to the same bytes.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return notFound();
  }
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
  },
  MAX_IMAGE_BYTES,
  init,
  importImage,
  removeImage,
  handleProtocolRequest,
  registerProtocol,
  registerHandlers,
  isValidImageId,
};

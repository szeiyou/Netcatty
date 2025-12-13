/**
 * WebAuthn Browser Bridge (macOS workaround)
 *
 * Electron's embedded WebAuthn prompt is unreliable on macOS (Touch ID / platform authenticators),
 * often leaving navigator.credentials.{create,get} pending with no UI.
 *
 * This bridge works around the issue by opening the system browser on a localhost helper page that
 * performs WebAuthn using the browser's working UI, then POSTs the result back to Electron.
 *
 * NOTE: This is intended as a pragmatic fallback; keep the UX minimal and secure (ephemeral port + token).
 */

const http = require("node:http");
const crypto = require("node:crypto");

let server = null;
let baseUrl = null;

// token -> { mode, resolve, reject, timeout }
const pending = new Map();

function resolveElectronModule() {
  try {
    return require("node:electron");
  } catch {
    return require("electron");
  }
}

function focusNetcattyApp() {
  try {
    const electronModule = resolveElectronModule();
    const { app, BrowserWindow } = electronModule || {};
    if (!BrowserWindow) return;

    const wins = BrowserWindow.getAllWindows ? BrowserWindow.getAllWindows() : [];
    const win = wins && wins.length ? wins[0] : null;
    if (win && !win.isDestroyed?.()) {
      try {
        if (win.isMinimized && win.isMinimized()) win.restore();
      } catch {}
      try {
        win.show();
      } catch {}
      try {
        win.focus();
      } catch {}
    }

    try {
      app?.focus?.({ steal: true });
    } catch {}
  } catch {}
}

async function openDeepLink(url) {
  const { shell } = resolveElectronModule();
  if (!shell?.openExternal) return;
  await shell.openExternal(url);
}

function bufToUtf8(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function writeJson(res, statusCode, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": String(body.length),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function writeHtml(res, html) {
  const body = Buffer.from(html, "utf-8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": String(body.length),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function getHelperHtml() {
  // Keep this page self-contained (no external assets) and compatible with modern browsers.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Netcatty WebAuthn Helper</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #f6f7fb;
        --bg2: #eef2ff;
        --text: #0f172a;
        --muted: rgba(15, 23, 42, 0.65);
        --card: rgba(255, 255, 255, 0.78);
        --border: rgba(2, 6, 23, 0.14);
        --shadow: 0 18px 50px rgba(2, 6, 23, 0.14);
        --primary: #2563eb;
        --primary2: #1d4ed8;
        --ring: rgba(37, 99, 235, 0.35);
        --success: #16a34a;
        --danger: #dc2626;
        --warn: #d97706;
        --code: rgba(2, 6, 23, 0.08);
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #070a12;
          --bg2: #0b1220;
          --text: rgba(255, 255, 255, 0.92);
          --muted: rgba(255, 255, 255, 0.65);
          --card: rgba(11, 18, 32, 0.78);
          --border: rgba(255, 255, 255, 0.14);
          --shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
          --ring: rgba(96, 165, 250, 0.32);
          --code: rgba(255, 255, 255, 0.08);
        }
      }

      * { box-sizing: border-box; }
      html, body { height: 100%; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        color: var(--text);
        background:
          radial-gradient(900px 500px at 20% 10%, var(--bg2), transparent 55%),
          radial-gradient(800px 420px at 90% 30%, rgba(37, 99, 235, 0.16), transparent 55%),
          linear-gradient(180deg, var(--bg), var(--bg));
      }

      .container {
        max-width: 760px;
        margin: 0 auto;
        padding: 28px 18px 40px;
        min-height: 100%;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 2px;
      }

      .mark {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        background: transparent;
        border: none;
      }

      .brand-name { font-weight: 750; letter-spacing: -0.02em; }
      .brand-sub { font-size: 12px; color: var(--muted); margin-top: 1px; }

      .card {
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 16px;
        box-shadow: var(--shadow);
        padding: 18px 18px 14px;
      }

      .title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      h1 { font-size: 18px; margin: 0; letter-spacing: -0.02em; }
      p { margin: 10px 0; line-height: 1.5; }
      .muted { color: var(--muted); }

      .pill {
        font-size: 12px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(2, 6, 23, 0.04);
        white-space: nowrap;
      }
      @media (prefers-color-scheme: dark) {
        .pill { background: rgba(255, 255, 255, 0.06); }
      }

      .kv {
        margin-top: 12px;
        display: grid;
        gap: 10px;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: rgba(2, 6, 23, 0.03);
      }
      @media (prefers-color-scheme: dark) {
        .kv { background: rgba(255, 255, 255, 0.05); }
      }
      .kv-row { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
      .kv-key { font-size: 12px; color: var(--muted); }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
        padding: 3px 6px;
        border-radius: 8px;
        background: var(--code);
        border: 1px solid var(--border);
        overflow-wrap: anywhere;
      }

      .actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
        margin-top: 14px;
      }

      .btn {
        appearance: none;
        border: 1px solid var(--border);
        background: rgba(2, 6, 23, 0.02);
        color: var(--text);
        padding: 10px 14px;
        border-radius: 12px;
        cursor: pointer;
        font-weight: 650;
        letter-spacing: -0.01em;
        transition: transform 120ms ease, background 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
      }

      .btn.primary {
        background: linear-gradient(180deg, var(--primary), var(--primary2));
        border-color: rgba(37, 99, 235, 0.55);
        color: white;
      }

      .btn:hover { transform: translateY(-1px); }
      .btn:active { transform: translateY(0px); }
      .btn:disabled { opacity: 0.62; cursor: not-allowed; transform: none; }
      .btn:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--ring); }

      .status {
        margin-top: 12px;
        white-space: pre-wrap;
        border-radius: 12px;
        padding: 10px 12px;
        border: 1px dashed var(--border);
        background: rgba(2, 6, 23, 0.02);
        min-height: 44px;
      }

      .status.info { border-style: dashed; }
      .status.success { border-style: solid; border-color: rgba(22, 163, 74, 0.55); background: rgba(22, 163, 74, 0.10); }
      .status.error { border-style: solid; border-color: rgba(220, 38, 38, 0.55); background: rgba(220, 38, 38, 0.10); }
      .status.warn { border-style: solid; border-color: rgba(217, 119, 6, 0.55); background: rgba(217, 119, 6, 0.10); }

      .foot { margin-top: 10px; font-size: 12px; }
      .sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    </style>
  </head>
  <body>
    <main class="container">
      <div class="brand" aria-label="Netcatty WebAuthn Helper">
        <div class="mark" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40" aria-hidden="true">
            <rect x="4" y="4" width="56" height="56" rx="12" fill="#2463EB"/>
            <rect x="14" y="17" width="36" height="24" rx="4" fill="white"/>
            <rect x="14" y="17" width="36" height="5" rx="4" fill="#E5ECFF"/>
            <circle cx="18" cy="19.5" r="1" fill="#2463EB"/>
            <circle cx="22" cy="19.5" r="1" fill="#2463EB" opacity="0.7"/>
            <circle cx="26" cy="19.5" r="1" fill="#2463EB" opacity="0.5"/>
            <path d="M20 32 L24 30 L20 28" stroke="#2463EB" fill="none" stroke-width="1.6"/>
            <path d="M28 34 H34" stroke="#2463EB" stroke-width="1.6"/>
            <path d="M24 17 L26 12 L28 17Z" fill="white"/>
            <path d="M36 17 L38 12 L40 17Z" fill="white"/>
            <path d="M40 37 C44 40,46 42,46 46 C46 49,44 51,41 51" stroke="white" fill="none" stroke-width="3.2"/>
            <rect x="38" y="48" width="6" height="5" rx="1" fill="white" stroke="#2463EB"/>
          </svg>
        </div>
        <div>
          <div class="brand-name">Netcatty</div>
          <div class="brand-sub">WebAuthn helper page</div>
        </div>
      </div>

      <section class="card">
        <div class="title-row">
          <h1 id="title">WebAuthn</h1>
          <span id="pill" class="pill">Local</span>
        </div>

        <p id="desc" class="muted">
          This page was opened by Netcatty to complete a WebAuthn operation using your browser UI.
        </p>

        <div class="kv" role="group" aria-label="Request details">
          <div class="kv-row">
            <div class="kv-key">RP ID</div>
            <code id="rpId"></code>
          </div>
          <div class="kv-row">
            <div class="kv-key">Tip</div>
            <div id="tip" class="muted">Keep this tab focused until the prompt completes.</div>
          </div>
        </div>

        <div class="actions">
          <button id="run" class="btn primary" type="button">Continue</button>
          <button id="back" class="btn" type="button" style="display:none">Return to Netcatty</button>
          <button id="close" class="btn" type="button">Close</button>
        </div>

        <div id="status" class="status info" role="status" aria-live="polite"></div>
        <p class="foot muted">After completing the prompt, return to Netcatty.</p>
      </section>
    </main>

    <script>
      (() => {
        const qs = new URLSearchParams(location.search);
        const mode = qs.get("mode") || "";
        const token = qs.get("token") || "";
        const rpId = qs.get("rpId") || "localhost";
        const name = qs.get("name") || "user";
        const displayName = qs.get("displayName") || name;
        const attachment = qs.get("attachment") || "platform";
        const uv = qs.get("uv") || "required";
        const timeoutMs = Math.max(1000, Number(qs.get("timeoutMs") || "180000") || 180000);
        const credentialIdB64 = qs.get("credentialId") || "";
        const challengeB64 = qs.get("challenge") || "";

        const titleEl = document.getElementById("title");
        const pillEl = document.getElementById("pill");
        const descEl = document.getElementById("desc");
        const rpEl = document.getElementById("rpId");
        const tipEl = document.getElementById("tip");
        const statusEl = document.getElementById("status");
        const runBtn = document.getElementById("run");
        const backBtn = document.getElementById("back");
        const closeBtn = document.getElementById("close");

        const isGet = mode === "get";
        const isCreate = mode === "create";

        titleEl.textContent = isGet ? "Authenticate" : "Create credential";
        pillEl.textContent = isGet ? "Sign-in" : (isCreate ? "Register" : "WebAuthn");
        rpEl.textContent = rpId;
        tipEl.textContent = isGet
          ? "Complete Touch ID / biometrics when prompted."
          : "Create a new credential with Touch ID / biometrics.";

        descEl.textContent =
          "This page runs locally on your device and is opened by Netcatty to ensure the WebAuthn prompt is shown reliably.";

        const setStatus = (msg, variant) => {
          statusEl.textContent = String(msg || "");
          statusEl.className = "status " + (variant || "info");
        };

        const openNetcatty = () => {
          // Best-effort: browsers may block automatic navigation to custom schemes without user gesture.
          const url = "netcatty://webauthn?mode=" + encodeURIComponent(mode || "");
          try {
            window.location.href = url;
          } catch {}
        };

        const bufToBase64Url = (buf) => {
          const bytes = new Uint8Array(buf);
          let binary = "";
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
          }
          return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
        };

        const base64UrlToBuf = (b64url) => {
          if (!b64url) return new Uint8Array();
          const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
          const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
          const bin = atob(padded);
          const out = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
          return out;
        };

        const postResult = async (payload) => {
          const resp = await fetch("/__netcatty_webauthn/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const text = await resp.text().catch(() => "");
          if (!resp.ok) throw new Error("Failed to deliver result: " + resp.status + " " + text);
        };

        const run = async () => {
          if (!window.PublicKeyCredential || !navigator.credentials) {
            throw new Error("WebAuthn is not supported in this browser.");
          }
          if (!window.isSecureContext) {
            throw new Error("WebAuthn requires a secure context (HTTPS/localhost).");
          }

          if (!token) throw new Error("Missing token.");

          setStatus(
            "Requesting WebAuthn...\\nIf nothing appears, make sure Touch ID / Passkeys are enabled and try again.",
            "info",
          );
          runBtn.disabled = true;

          if (mode === "create") {
            const userId = new Uint8Array(32);
            crypto.getRandomValues(userId);

            const publicKey = {
              challenge: crypto.getRandomValues(new Uint8Array(32)),
              rp: { id: rpId, name: "Netcatty SSH Manager" },
              user: { id: userId, name, displayName },
              pubKeyCredParams: [
                { type: "public-key", alg: -7 },    // ES256
                { type: "public-key", alg: -257 },  // RS256
              ],
              authenticatorSelection: {
                authenticatorAttachment: attachment,
                residentKey: "discouraged",
                userVerification: uv,
              },
              timeout: timeoutMs,
              attestation: "none",
            };

            const credential = await navigator.credentials.create({ publicKey });
            if (!credential) throw new Error("Credential creation was cancelled.");

            const resp = credential.response;
            const attestationObject = resp.attestationObject ? bufToBase64Url(resp.attestationObject) : "";
            const clientDataJSON = resp.clientDataJSON ? bufToBase64Url(resp.clientDataJSON) : "";
            const rawId = credential.rawId ? bufToBase64Url(credential.rawId) : "";
            const spki = typeof resp.getPublicKey === "function" ? resp.getPublicKey() : null;
            const publicKeySpki = spki && spki.byteLength ? bufToBase64Url(spki) : "";

            await postResult({
              token,
              ok: true,
              mode,
              result: {
                rpId,
                origin: window.location.origin,
                credentialId: rawId,
                attestationObject,
                clientDataJSON,
                publicKeySpki,
              },
            });

            setStatus("Done. You can close this tab and return to Netcatty.", "success");
            if (backBtn) backBtn.style.display = "";
            // Try to jump back automatically; if blocked, the button remains.
            openNetcatty();
            return;
          }

          if (mode === "get") {
            if (!credentialIdB64) throw new Error("Missing credentialId.");
            if (!challengeB64) throw new Error("Missing challenge.");

            const idBytes = base64UrlToBuf(credentialIdB64);
            const challengeBytes = base64UrlToBuf(challengeB64);

            const publicKey = {
              rpId,
              challenge: challengeBytes,
              allowCredentials: [{ type: "public-key", id: idBytes }],
              userVerification: uv,
              timeout: timeoutMs,
            };

            const assertion = await navigator.credentials.get({ publicKey });
            if (!assertion) throw new Error("Credential assertion was cancelled.");

            const resp = assertion.response;
            const rawId = assertion.rawId ? bufToBase64Url(assertion.rawId) : "";
            const authenticatorData = resp.authenticatorData ? bufToBase64Url(resp.authenticatorData) : "";
            const clientDataJSON = resp.clientDataJSON ? bufToBase64Url(resp.clientDataJSON) : "";
            const signature = resp.signature ? bufToBase64Url(resp.signature) : "";
            const userHandle = resp.userHandle ? bufToBase64Url(resp.userHandle) : null;

            await postResult({
              token,
              ok: true,
              mode,
              result: {
                rpId,
                origin: window.location.origin,
                credentialId: rawId,
                authenticatorData,
                clientDataJSON,
                signature,
                userHandle,
              },
            });

            setStatus("Done. You can close this tab and return to Netcatty.", "success");
            if (backBtn) backBtn.style.display = "";
            openNetcatty();
            return;
          }

          throw new Error("Unknown mode: " + mode);
        };

        const runWithUi = async () => {
          try {
            await run();
          } catch (e) {
            const name = e && typeof e === "object" && "name" in e ? String(e.name) : "";
            const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
            const full = (name ? name + ": " : "") + msg;
            const variant = name === "NotAllowedError" ? "warn" : "error";
            setStatus(full, variant);
            runBtn.disabled = false;
            // For most failures, notify Electron so it can stop waiting.
            // If the failure is due to missing user activation, let the user click again.
            if (name !== "NotAllowedError") {
              try {
                await postResult({ token, ok: false, mode, error: (name ? name + ": " : "") + msg });
              } catch {}
            }
          }
        };

        runBtn.addEventListener("click", () => void runWithUi());
        if (backBtn) backBtn.addEventListener("click", () => openNetcatty());
        closeBtn.addEventListener("click", () => window.close());

        // Best-effort auto-run: if it fails due to user activation, the button remains available.
        void runWithUi();
      })();
    </script>
  </body>
</html>`;
}

async function ensureServer() {
  if (baseUrl) {
    console.log("[WebAuthn] Server already running at:", baseUrl);
    return baseUrl;
  }

  console.log("[WebAuthn] Starting helper server...");
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const pathname = url.pathname;

      if (req.method === "GET" && pathname === "/__netcatty_webauthn") {
        return writeHtml(res, getHelperHtml());
      }

      if (req.method === "POST" && pathname === "/__netcatty_webauthn/complete") {
        const bodyText = await bufToUtf8(req);
        let payload;
        try {
          payload = JSON.parse(bodyText || "{}");
        } catch {
          return writeJson(res, 400, { ok: false, error: "Invalid JSON" });
        }

        const token = payload?.token;
        if (!token || typeof token !== "string") {
          return writeJson(res, 400, { ok: false, error: "Missing token" });
        }

        const entry = pending.get(token);
        if (!entry) {
          return writeJson(res, 404, { ok: false, error: "Unknown or expired token" });
        }

        if (payload?.mode && payload.mode !== entry.mode) {
          pending.delete(token);
          clearTimeout(entry.timeout);
          entry.reject(new Error("Mismatched WebAuthn response mode"));
          return writeJson(res, 400, { ok: false, error: "Mismatched mode" });
        }

        pending.delete(token);
        clearTimeout(entry.timeout);

        if (payload?.ok) {
          entry.resolve(payload.result || null);
          // Best-effort: bring the app back to the front after a successful WebAuthn prompt.
          focusNetcattyApp();
          try {
            await openDeepLink("netcatty://webauthn?status=ok");
          } catch {}
        } else {
          entry.reject(new Error(payload?.error || "WebAuthn request failed"));
        }

        return writeJson(res, 200, { ok: true });
      }

      return writeJson(res, 404, { ok: false, error: "Not Found" });
    } catch (err) {
      return writeJson(res, 500, { ok: false, error: err?.message || String(err) });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const port = address && typeof address === "object" ? address.port : null;
  if (!port) throw new Error("Failed to bind WebAuthn helper server");

  baseUrl = `http://localhost:${port}`;
  console.log("[WebAuthn] Helper server started at:", baseUrl);
  return baseUrl;
}

function makeToken() {
  return crypto.randomBytes(16).toString("hex");
}

async function openInBrowser(url) {
  const { shell } = resolveElectronModule();
  console.log("[WebAuthn] Opening browser with URL:", url);
  try {
    await shell.openExternal(url);
    console.log("[WebAuthn] Browser opened successfully");
  } catch (err) {
    console.error("[WebAuthn] Failed to open browser:", err);
    throw err;
  }
}

async function createCredentialInBrowser(options) {
  const {
    rpId,
    name,
    displayName,
    authenticatorAttachment = "platform",
    userVerification = "required",
    timeoutMs = 180000,
  } = options || {};

  if (typeof rpId !== "string" || !rpId) throw new Error("Missing rpId");

  const helperBase = await ensureServer();
  const token = makeToken();

  const url = new URL(`${helperBase}/__netcatty_webauthn`);
  url.searchParams.set("mode", "create");
  url.searchParams.set("token", token);
  url.searchParams.set("rpId", rpId);
  url.searchParams.set("name", typeof name === "string" && name ? name : "user");
  url.searchParams.set("displayName", typeof displayName === "string" && displayName ? displayName : (typeof name === "string" ? name : "user"));
  url.searchParams.set("attachment", authenticatorAttachment);
  url.searchParams.set("uv", userVerification);
  url.searchParams.set("timeoutMs", String(Math.max(1000, Number(timeoutMs) || 180000)));

  await openInBrowser(url.toString());

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(token);
      reject(new Error("WebAuthn browser flow timed out"));
    }, Math.max(1000, Number(timeoutMs) || 180000));

    pending.set(token, { mode: "create", resolve, reject, timeout });
  });
}

async function getAssertionInBrowser(options) {
  console.log("[WebAuthn] getAssertionInBrowser called with options:", {
    rpId: options?.rpId,
    hasCredentialId: !!options?.credentialId,
    hasChallenge: !!options?.challenge,
    userVerification: options?.userVerification,
    timeoutMs: options?.timeoutMs,
  });
  
  const {
    rpId,
    credentialId,
    challenge,
    userVerification = "preferred",
    timeoutMs = 180000,
  } = options || {};

  if (typeof rpId !== "string" || !rpId) throw new Error("Missing rpId");
  if (typeof credentialId !== "string" || !credentialId) throw new Error("Missing credentialId");
  if (typeof challenge !== "string" || !challenge) throw new Error("Missing challenge");

  const helperBase = await ensureServer();
  const token = makeToken();

  const url = new URL(`${helperBase}/__netcatty_webauthn`);
  url.searchParams.set("mode", "get");
  url.searchParams.set("token", token);
  url.searchParams.set("rpId", rpId);
  url.searchParams.set("credentialId", credentialId);
  url.searchParams.set("challenge", challenge);
  url.searchParams.set("uv", userVerification);
  url.searchParams.set("timeoutMs", String(Math.max(1000, Number(timeoutMs) || 180000)));

  console.log("[WebAuthn] About to open browser for assertion...");
  await openInBrowser(url.toString());
  console.log("[WebAuthn] Browser opened, waiting for response...");

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(token);
      reject(new Error("WebAuthn browser flow timed out"));
    }, Math.max(1000, Number(timeoutMs) || 180000));

    pending.set(token, { mode: "get", resolve, reject, timeout });
  });
}

function shutdown() {
  if (server) {
    try {
      server.close();
    } catch {}
  }
  server = null;
  baseUrl = null;

  // Reject pending requests
  for (const [token, entry] of pending.entries()) {
    clearTimeout(entry.timeout);
    entry.reject(new Error("WebAuthn helper server shut down"));
    pending.delete(token);
  }
}

function registerHandlers(ipcMain) {
  ipcMain.handle("netcatty:webauthn:browser:create", async (_event, options) => {
    return createCredentialInBrowser(options);
  });
  ipcMain.handle("netcatty:webauthn:browser:get", async (_event, options) => {
    return getAssertionInBrowser(options);
  });
}

module.exports = {
  registerHandlers,
  createCredentialInBrowser,
  getAssertionInBrowser,
  shutdown,
};

const { spawn, execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const electronPath = require("electron"); // returns binary path

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const isMac = process.platform === "darwin";

// On macOS, WebAuthn/FIDO requires the app to be launched via Finder (LaunchServices)
// to properly inherit Info.plist permissions. 
// However, `open -a` doesn't pass environment variables, so we write a temp config file.
if (isMac && env.VITE_DEV_SERVER_URL) {
  // Write dev server URL to a temp file that main.cjs can read
  const configPath = path.join(__dirname, ".dev-config.json");
  fs.writeFileSync(configPath, JSON.stringify({
    VITE_DEV_SERVER_URL: env.VITE_DEV_SERVER_URL,
  }));

  // Find the Electron.app bundle path from the electron binary
  // electronPath is like: /path/to/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron
  const electronAppPath = path.resolve(electronPath, "../../.."); // -> Electron.app
  const appDir = path.resolve(__dirname, "..");

  console.log("[Launch] Starting Electron via LaunchServices for WebAuthn support...");
  
  // Use `open` to launch via Finder/LaunchServices for proper FIDO/WebAuthn support
  const child = spawn("open", [
    "-a", electronAppPath,
    "-W", // Wait for the app to exit
    "--args",
    appDir,
  ], {
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    // Clean up temp config
    try { fs.unlinkSync(configPath); } catch {}
    process.exit(code ?? 0);
  });
} else {
  // Non-macOS or production: use direct spawn
  const child = spawn(electronPath, ["."], {
    stdio: "inherit",
    env,
  });

  child.on("exit", (code) => process.exit(code ?? 0));
}


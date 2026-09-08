const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const http = require("node:http");
const port = 47831;
let server;

const waitForServer = (attempt = 0) =>
  new Promise((resolve, reject) => {
    const request = http.get(
      `http://127.0.0.1:${port}/api/health`,
      (response) => {
        response.resume();
        resolve();
      },
    );
    request.on("error", () =>
      attempt > 80
        ? reject(new Error("Signal Petal did not start."))
        : setTimeout(() => resolve(waitForServer(attempt + 1)), 100),
    );
  });

app.whenReady().then(async () => {
  const appPath = app.getAppPath();
  server = spawn(process.execPath, [path.join(appPath, "desktop/server.mjs")], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      SIGNAL_PETAL_APP_PATH: appPath,
      PORT: String(port),
    },
    stdio: "ignore",
  });
  await waitForServer();
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 650,
    title: "Signal Petal",
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  await window.loadURL(`http://127.0.0.1:${port}`);
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => server?.kill());

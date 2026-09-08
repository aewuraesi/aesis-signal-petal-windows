import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.SIGNAL_PETAL_APP_PATH;
const port = Number(process.env.PORT || 47831);
const worker = (
  await import(pathToFileURL(path.join(root, "dist/server/index.js")))
).default;
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
const assets = {
  fetch: async (request) => {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const target = path.join(root, "dist/client", pathname.replace(/^\/+/, ""));
    try {
      if (!(await stat(target)).isFile())
        return new Response("Not found", { status: 404 });
      return new Response(await readFile(target), {
        headers: {
          "content-type":
            mime[path.extname(target)] || "application/octet-stream",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
};

http
  .createServer(async (incoming, outgoing) => {
    try {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers,
        body: ["GET", "HEAD"].includes(incoming.method)
          ? undefined
          : Buffer.concat(chunks),
      });
      const response = await worker.fetch(
        request,
        { ASSETS: assets },
        { waitUntil() {}, passThroughOnException() {} },
      );
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      outgoing.writeHead(500);
      outgoing.end(
        error instanceof Error ? error.message : "Desktop server error",
      );
    }
  })
  .listen(port, "127.0.0.1");

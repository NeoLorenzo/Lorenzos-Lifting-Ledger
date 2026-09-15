import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const args = new Map();

for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith("--")) continue;
  args.set(argument.slice(2), process.argv[index + 1]);
  index += 1;
}

const host = args.get("host") ?? "127.0.0.1";
const port = Number(args.get("port") ?? 5173);
const smokeSupabaseUrl = process.env.HERACLES_SMOKE_SUPABASE_URL?.trim() ?? "";
const smokeSupabaseKey = process.env.HERACLES_SMOKE_SUPABASE_KEY?.trim() ?? "";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Port must be an integer between 1 and 65535.");
}

if (Boolean(smokeSupabaseUrl) !== Boolean(smokeSupabaseKey)) {
  throw new Error("HERACLES_SMOKE_SUPABASE_URL and HERACLES_SMOKE_SUPABASE_KEY must be provided together.");
}

if (smokeSupabaseUrl) {
  const parsedSmokeUrl = new URL(smokeSupabaseUrl);
  if (parsedSmokeUrl.protocol !== "https:" || parsedSmokeUrl.hostname !== "heracles-smoke.local") {
    throw new Error("Browser-smoke Supabase overrides are restricted to https://heracles-smoke.local.");
  }
}

const smokeConfig = smokeSupabaseUrl
  ? `export const SUPABASE_URL = ${JSON.stringify(smokeSupabaseUrl)};\nexport const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(smokeSupabaseKey)};\n`
  : null;

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
    const pathname = decodeURIComponent(url.pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = normalize(join(root, relativePath));

    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    if (relativePath === "config.js" && smokeConfig) {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/javascript; charset=utf-8",
      });
      response.end(request.method === "HEAD" ? undefined : smokeConfig);
      return;
    }

    const file = await stat(filePath);
    if (!file.isFile()) throw new Error("Not a file");

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`Heracles: http://${displayHost}:${port}`);
});

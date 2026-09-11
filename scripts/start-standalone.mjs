/**
 * Runs the production build the way the container does.
 *
 * `next.config.ts` sets `output: "standalone"` because the Dockerfile needs it
 * — the runtime image copies `.next/standalone` and runs `node server.js`,
 * which is how it ships ~150 MB instead of the whole dependency tree.
 *
 * **`next start` does not support that mode**, and says so:
 *
 *     ⚠ "next start" does not work with "output: standalone" configuration.
 *
 * It appears to work — pages render — but it is running an unsupported
 * combination, so "it worked locally" proves nothing about the container. This
 * script closes that gap by doing locally exactly what the Dockerfile does at
 * lines 33-35: the standalone server does not bundle `public/` or
 * `.next/static`, so both have to be placed beside it first. Miss that step
 * and the site comes up with no CSS and no images, which looks like a broken
 * build rather than a missing copy.
 *
 * **The generated `server.js` always prints `Network: http://0.0.0.0:3000`,
 * which is not a usable address.** That file hardcodes
 * `const hostname = process.env.HOSTNAME || '0.0.0.0'`, and Next's own
 * `networkHostname = hostname ?? getNetworkHost(...)` only calls the real
 * LAN-IP lookup when `hostname` is nullish — `'0.0.0.0'` is truthy, so the
 * lookup never runs and the placeholder gets echoed back. `next dev`'s CLI
 * never sets an explicit hostname, which is the only reason it prints a real
 * IP there instead. Setting `HOSTNAME` here to work around it would fix the
 * banner but break `localhost`: that same value is also what `server.js`
 * binds to, and a socket bound to one specific address stops accepting
 * connections on any other, loopback included. So the bind stays at
 * `0.0.0.0` (every interface, `localhost` included) and this script prints
 * the phone-usable address itself, above Next's own banner.
 */
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { networkInterfaces } from "node:os";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

/** The first non-loopback IPv4 address, the same way Next's own
 *  `getNetworkHost` picks one for `next dev`'s banner
 *  (`node_modules/next/dist/lib/get-network-host.js`) — so this reports
 *  whatever `next dev` would have shown here. `null` on a machine with no
 *  such interface (offline, or IPv6-only), in which case there is nothing
 *  useful to print and the line is skipped. */
function getLanIPv4() {
  const interfaces = networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const { family, address } of addresses ?? []) {
      if (family === "IPv4" && address !== "127.0.0.1") return address;
    }
  }
  return null;
}

const ROOT = process.cwd();
loadEnvConfig(ROOT);
const STANDALONE = join(ROOT, ".next", "standalone");

if (!existsSync(join(STANDALONE, "server.js"))) {
  console.error(
    'No standalone build found. Run "npm run build" first.\n' +
      `Looked for: ${join(STANDALONE, "server.js")}`,
  );
  process.exit(1);
}

/* Mirrors Dockerfile lines 33-35. `recursive` + `force` so a re-run after
   another build overwrites rather than half-merging a stale copy. */
for (const [from, to] of [
  [join(ROOT, "public"), join(STANDALONE, "public")],
  [join(ROOT, ".next", "static"), join(STANDALONE, ".next", "static")],
]) {
  if (existsSync(from)) cpSync(from, to, { recursive: true, force: true });
}

/* `UPLOAD_DIR` defaults to the container's path, which does not exist here.
   Point it at the repo's own data/uploads so /media works locally too. */
const env = {
  ...process.env,
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? join(ROOT, "data", "uploads"),
};

/* Printed before `server.js`'s own banner — see the header comment on why
   that banner's own "Network:" line cannot be trusted, and why the fix lives
   here rather than in an env var passed to the child. Same `PORT` default
   (3000) `server.js` uses, so this always names the port it actually binds. */
const port = parseInt(process.env.PORT, 10) || 3000;
const lanIP = getLanIPv4();
if (lanIP) {
  console.log(`- On your phone (same Wi-Fi): http://${lanIP}:${port}`);
}

spawn("node", [join(STANDALONE, "server.js")], { stdio: "inherit", env })
  .on("exit", (code) => process.exit(code ?? 0));

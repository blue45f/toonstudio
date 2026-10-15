#!/usr/bin/env node
/**
 * PoC 빌드를 사람이 직접 열어 보기 위한 정적 서버(측정 하네스와 같은 서버 모듈).
 * 사용: node tools/godot-3d-poc/measure/serve.mjs [--build <빌드 루트>] [--fixtures <폴더>]
 * 열기: 출력되는 주소. /g/n/index.html(단일 스레드, 격리 없음), /g/ni/index.html(COOP/COEP credentialless),
 *       /host/embed.html?stage=/g/n/index.html(iframe 임베드 호스트). 브라우저 콘솔에서
 *       window.__host.send({ cmd: "load-glb", source: { kind: "url", url: "/fixtures/synthetic-character.glb" } }) 처럼 명령을 보낸다.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { startServers } from "./lib/server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const pocRoot = path.resolve(here, "..");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const servers = await startServers({
  buildDir: path.resolve(argValue("--build", path.join(pocRoot, "build"))),
  fixtureRoots: {},
  fixtureDirs: [path.resolve(argValue("--fixtures", path.join(pocRoot, ".cache", "fixtures")))],
  threeBundleDir: path.join(pocRoot, ".cache", "three-baseline", "full"),
  threeVendorDir: path.resolve(pocRoot, "../..", "node_modules", "three"),
  hostDir: path.join(here, "host"),
});
process.stdout.write(`PoC 서버: ${servers.origin}/g/n/index.html  (Ctrl+C 로 종료)\n`);
process.on("SIGINT", async () => {
  await servers.close();
  process.exit(0);
});

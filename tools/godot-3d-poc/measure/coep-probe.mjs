#!/usr/bin/env node
/**
 * 교차 출처 격리(COEP) 부모 안의 Godot iframe 이 왜 막히는지 Chrome DevTools Protocol 로 직접 확인하는 프로브.
 * run.mjs 의 `coi` 스위트는 결과(부팅 성공·실패)만 기록하므로, 차단 이유(blockedReason)는 이 스크립트로 따로 본다.
 *
 * 사용(저장소 루트): node tools/godot-3d-poc/measure/coep-probe.mjs [--iso credentialless|require-corp|none] [--stage n|ni|nr|t|ti|tr] [--build <빌드 루트>] [--chromium <실행 파일>]
 * 기본값: 부모 COEP credentialless, 스테이지 n(단일 스레드, 자식에 COEP 헤더 없음) -> 자식 문서가 `coep-frame-resource-needs-coep-header` 로 차단된다.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { startServers } from "./lib/server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const pocRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pocRoot, "../..");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const iso = argValue("--iso", "credentialless");
const stage = argValue("--stage", "n");
const servers = await startServers({
  buildDir: path.resolve(argValue("--build", path.join(pocRoot, "build"))),
  fixtureRoots: {},
  fixtureDirs: [],
  threeBundleDir: path.join(pocRoot, ".cache", "three-baseline", "full"),
  threeVendorDir: path.join(repoRoot, "node_modules", "three"),
  hostDir: path.join(here, "host"),
});
const chromiumPath = argValue("--chromium", process.env.PW_CHROMIUM_PATH ?? "");
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--no-sandbox", "--disable-dev-shm-usage"],
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
});
const events = [];
try {
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  cdp.on("Network.loadingFailed", (event) => events.push({ kind: "loadingFailed", type: event.type, errorText: event.errorText, blockedReason: event.blockedReason ?? null }));
  cdp.on("Network.responseReceived", (event) => {
    if (event.type === "Document") {
      events.push({ kind: "document", url: new URL(event.response.url).pathname, status: event.response.status, coep: event.response.headers["cross-origin-embedder-policy"] ?? null });
    }
  });
  await page.goto(`${servers.origin}/host/embed.html?iso=${iso}&stage=${encodeURIComponent(`/g/${stage}/index.html`)}`);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const child = page.frames().find((frame) => frame !== page.mainFrame());
  events.push({ kind: "childFrame", url: child?.url() ?? null });
} finally {
  await browser.close();
  await servers.close();
}
process.stdout.write(`${JSON.stringify({ iso, stage, events }, null, 1)}\n`);

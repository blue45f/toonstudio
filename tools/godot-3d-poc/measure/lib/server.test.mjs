import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { startServers } from "./server.mjs";

// 측정 하니스 정적 서버가 루트 밖 파일을 내주지 않는지 확인한다.
// 실행: node --test tools/godot-3d-poc/measure/lib/server.test.mjs
// 경로 한 구간 안의 인코딩된 구분자(..%2F..)는 구간 단위 검사(parts.includes(".."))를 통과해 상위 폴더로 빠져나갔다.
let workspace;
let servers;

before(async () => {
  workspace = mkdtempSync(join(tmpdir(), "ts3d-measure-server-"));
  const buildDir = join(workspace, "build");
  const fixtureDir = join(workspace, "fixtures");
  const hostDir = join(workspace, "host");
  const threeBundleDir = join(workspace, "three");
  const threeVendorDir = join(workspace, "vendor");
  for (const directory of [join(buildDir, "web"), fixtureDir, hostDir, threeBundleDir, threeVendorDir]) {
    mkdirSync(directory, { recursive: true });
  }
  writeFileSync(join(buildDir, "web", "index.html"), "<p>stage</p>");
  writeFileSync(join(fixtureDir, "model.glb"), "glb");
  writeFileSync(join(hostDir, "embed.html"), "<p>host</p>");
  writeFileSync(join(threeBundleDir, "index.html"), "<p>three</p>");
  writeFileSync(join(threeVendorDir, "three.js"), "//three");
  // 각 루트의 바깥(작업 폴더 직하)에 있는 비밀 파일.
  writeFileSync(join(workspace, "secret.txt"), "TOP-SECRET");
  servers = await startServers({
    buildDir,
    fixtureRoots: { model: join(fixtureDir, "model.glb") },
    fixtureDirs: [fixtureDir],
    threeBundleDir,
    threeVendorDir,
    hostDir,
  });
});

after(async () => {
  await servers?.close();
  rmSync(workspace, { recursive: true, force: true });
});

async function get(pathname) {
  const response = await fetch(`${servers.origin}${pathname}`);
  return { status: response.status, body: await response.text() };
}

test("정상 요청은 그대로 서빙한다", async () => {
  assert.deepEqual(await get("/g/n/index.html"), { status: 200, body: "<p>stage</p>" });
  assert.equal((await get("/g/n/")).status, 200);
  assert.deepEqual(await get("/host/embed.html"), { status: 200, body: "<p>host</p>" });
  assert.deepEqual(await get("/three/index.html"), { status: 200, body: "<p>three</p>" });
  assert.deepEqual(await get("/vendor/three/three.js"), { status: 200, body: "//three" });
  assert.deepEqual(await get("/fixtures/model"), { status: 200, body: "glb" });
});

for (const [name, pathname] of [
  ["빌드 폴더", "/g/n/..%2F..%2Fsecret.txt"],
  ["빌드 폴더(소문자 인코딩 구간)", "/g/n/%2e%2e%2f%2e%2e%2fsecret.txt"],
  ["호스트 폴더", "/host/..%2Fsecret.txt"],
  ["Three 번들", "/three/..%2Fsecret.txt"],
  ["Three 벤더", "/vendor/three/..%2Fsecret.txt"],
  ["픽스처", "/fixtures/..%2Fsecret.txt"],
]) {
  test(`${name}의 루트 밖 파일은 인코딩된 상위 이동으로 읽을 수 없다`, async () => {
    const { status, body } = await get(pathname);
    assert.notEqual(status, 200);
    assert.ok(!body.includes("TOP-SECRET"), "루트 밖 파일 내용이 응답에 섞였다");
  });
}

test("fixtureRoots 는 객체 프로토타입 키로 조회되지 않는다", async () => {
  for (const key of ["__proto__", "constructor", "toString"]) {
    const { status } = await get(`/fixtures/${key}`);
    assert.equal(status, 404);
  }
});

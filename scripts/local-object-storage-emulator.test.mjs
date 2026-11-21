import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertLoopbackStorageHost,
  LOCAL_OBJECT_STORAGE_DEFAULT_PORT,
  parseObjectStorageCliArgs,
  parseRawObjectRequest,
  resolveConfinedPath,
  startLocalObjectStorageEmulator,
  validateBucketName,
  verifyLocalObjectStorageRoundTrip,
} from "./local-object-storage-emulator.mjs";

const EMULATOR_PATH = fileURLToPath(new URL("./local-object-storage-emulator.mjs", import.meta.url));

function rawHttpRequest(port, { method = "GET", path = "/", headers = {}, body = null }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest({ hostname: "127.0.0.1", port, method, path, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolvePromise({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on("error", rejectPromise);
    if (body) req.write(body);
    req.end();
  });
}

describe("local-object-storage-emulator path & guard validation", () => {
  it("127.0.0.1 외 호스트 바인딩을 fail-closed로 차단한다", () => {
    assert.doesNotThrow(() => assertLoopbackStorageHost("127.0.0.1"));
    assert.throws(() => assertLoopbackStorageHost("0.0.0.0"), /루프백/);
    assert.throws(() => assertLoopbackStorageHost("r2.cloudflarestorage.com"), /루프백/);
  });

  it("버킷 이름 규칙과 원시 경로 탐색(.., %2e%2e, \\, NUL)을 차단한다", () => {
    assert.equal(validateBucketName("studio-manuscripts").ok, true);
    assert.equal(validateBucketName("..").ok, false);
    assert.equal(validateBucketName("bad..bucket").ok, false);
    assert.equal(validateBucketName("UPPER").ok, false);

    assert.equal(parseRawObjectRequest("/health").route, "health");
    assert.deepEqual(parseRawObjectRequest("/objects/studio-assets/ep1/cut-01.png"), {
      ok: true,
      route: "object",
      bucket: "studio-assets",
      key: "ep1/cut-01.png",
      keySegments: ["ep1", "cut-01.png"],
    });
    assert.deepEqual(parseRawObjectRequest("/objects/studio-assets?prefix=ep1/"), {
      ok: true,
      route: "list",
      bucket: "studio-assets",
      prefix: "ep1/",
    });

    for (const badPath of [
      "/objects/studio-assets/../secret.txt",
      "/objects/studio-assets/ep1/../../secret.txt",
      "/objects/studio-assets/%2e%2e/secret.txt",
      "/objects/studio-assets/%2E%2E%2Fsecret.txt",
      "/objects/studio-assets/a\\b.png",
      "/objects/studio-assets/a%5cb.png",
      "/objects/studio-assets/a%00b.png",
      "/objects/studio-assets/ep1//cut.png",
      "/objects/studio-assets?prefix=../escape",
    ]) {
      const parsed = parseRawObjectRequest(badPath);
      assert.equal(parsed.ok, false, `차단되어야 할 경로가 통과함: ${badPath}`);
      assert.equal(parsed.status, 400, badPath);
    }

    assert.throws(() => resolveConfinedPath("/tmp/base", ["..", "outside"]), /경로 탐색/);
  });

  it("CLI 인자 파싱과 --help 실행을 검증한다", () => {
    assert.equal(parseObjectStorageCliArgs([]).port, LOCAL_OBJECT_STORAGE_DEFAULT_PORT);
    assert.deepEqual(parseObjectStorageCliArgs(["--port", "59123", "--json", "--max-object-bytes=4096"]), {
      help: false,
      json: true,
      port: 59123,
      maxObjectBytes: 4096,
      maxTotalBytes: 128 * 1024 * 1024,
    });
    assert.throws(() => parseObjectStorageCliArgs(["--port", "99999"]), /정수/);
    assert.throws(() => parseObjectStorageCliArgs(["--unknown"]), /알 수 없는 인자/);

    const help = spawnSync(process.execPath, [EMULATOR_PATH, "--help"], { encoding: "utf8" });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /127\.0\.0\.1/u);
    assert.match(help.stdout, /59000/u);
  });
});

describe("local-object-storage-emulator HTTP lifecycle", () => {
  it("PUT/HEAD/GET/LIST/DELETE 왕복·SHA-256 ETag·종료 시 임시 디렉터리 100% 삭제를 보장한다", async () => {
    const emulator = await startLocalObjectStorageEmulator({ port: 0 });
    const storageRoot = emulator.storageRoot;
    assert.equal(emulator.host, "127.0.0.1");
    assert.ok(emulator.port > 0);
    assert.equal(existsSync(storageRoot), true);

    try {
      const healthRes = await fetch(emulator.healthUrl);
      assert.equal(healthRes.status, 200);
      const health = await healthRes.json();
      assert.equal(health.ok, true);
      assert.equal(health.host, "127.0.0.1");
      assert.equal(health.objectCount, 0);

      const roundTrip = await verifyLocalObjectStorageRoundTrip(emulator.baseUrl);
      assert.equal(roundTrip.ok, true);
      assert.equal(roundTrip.traversalBlocked, true);
      assert.equal(roundTrip.deletedVerified, true);
      assert.equal(roundTrip.listCountBeforeDelete, 1);

      // 여러 객체 업로드 후 목록 조회·If-None-Match·덮어쓰기 검증
      const payloadA = Buffer.from("cut-001-lineart-bytes", "utf8");
      const payloadB = Buffer.from("cut-002-color-bytes", "utf8");
      const shaA = createHash("sha256").update(payloadA).digest("hex");

      const putA = await fetch(`${emulator.baseUrl}/objects/studio-work/ep2/cut-001.png`, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: payloadA,
      });
      assert.equal(putA.status, 200);
      assert.equal(putA.headers.get("etag"), `"${shaA}"`);

      const putB = await fetch(`${emulator.baseUrl}/objects/studio-work/ep2/cut-002.webp`, {
        method: "PUT",
        body: payloadB,
      });
      assert.equal(putB.status, 200);
      const bodyB = await putB.json();
      assert.equal(bodyB.contentType, "image/webp");

      const notModified = await fetch(`${emulator.baseUrl}/objects/studio-work/ep2/cut-001.png`, {
        headers: { "If-None-Match": `"${shaA}"` },
      });
      assert.equal(notModified.status, 304);

      const listed = await (await fetch(`${emulator.baseUrl}/objects/studio-work?prefix=ep2/`)).json();
      assert.equal(listed.count, 2);
      assert.deepEqual(
        listed.objects.map((entry) => entry.key),
        ["ep2/cut-001.png", "ep2/cut-002.webp"],
      );

      // 원시 소켓으로 정규화되지 않은 `..` 경로 요청 전송 시에도 400으로 차단되는지 실측 확인
      const rawTraversal = await rawHttpRequest(emulator.port, {
        method: "PUT",
        path: "/objects/studio-work/ep2/../../escape.txt",
        headers: { "Content-Length": "4" },
        body: Buffer.from("nope"),
      });
      assert.equal(rawTraversal.status, 400);
    } finally {
      const closed = await emulator.close();
      assert.equal(closed.closed, true);
      assert.equal(closed.storageRemoved, true);
    }

    assert.equal(existsSync(storageRoot), false, "에뮬레이터 종료 후 임시 저장 디렉터리가 남아 있습니다.");
  });

  it("단일 객체 용량 상한과 전체 누적 용량 상한 초과를 413으로 차단한다", async () => {
    const emulator = await startLocalObjectStorageEmulator({
      port: 0,
      maxObjectBytes: 64,
      maxTotalBytes: 100,
    });

    try {
      // 단일 객체 상한 초과 (65B > 64B)
      const tooLarge = await fetch(`${emulator.baseUrl}/objects/quota-test/oversize.bin`, {
        method: "PUT",
        body: Buffer.alloc(65, 1),
      });
      assert.equal(tooLarge.status, 413);

      // 60B 정상 저장
      const first = await fetch(`${emulator.baseUrl}/objects/quota-test/a.bin`, {
        method: "PUT",
        body: Buffer.alloc(60, 2),
      });
      assert.equal(first.status, 200);

      // 누적 상한 초과 (60B + 50B = 110B > 100B)
      const quotaExceeded = await fetch(`${emulator.baseUrl}/objects/quota-test/b.bin`, {
        method: "PUT",
        body: Buffer.alloc(50, 3),
      });
      assert.equal(quotaExceeded.status, 413);

      // 기존 60B 키 덮어쓰기(60B → 64B)는 총합 64B <= 100B이므로 허용
      const overwriteOk = await fetch(`${emulator.baseUrl}/objects/quota-test/a.bin`, {
        method: "PUT",
        body: Buffer.alloc(64, 4),
      });
      assert.equal(overwriteOk.status, 200);

      const health = await (await fetch(emulator.healthUrl)).json();
      assert.equal(health.objectCount, 1);
      assert.equal(health.totalBytes, 64);
    } finally {
      const closed = await emulator.close();
      assert.equal(closed.storageRemoved, true);
    }
  });
});

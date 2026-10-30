import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ALLOWED_PACK, FIXTURE_DEFS, assetEntry, ledgerWithAllowedAndHeld, planFor, themePacksFor, writeTree } from "./lib/plan-creator-bundle-deploy-test-support.mjs";
import { selfContainedGlb } from "./lib/creator-bundle-pack-rights-test-support.mjs";
import { createReleaseCatalog, RELEASE_DESCRIPTOR_PATH, STATIC_DIRECTORY, writeReleaseCatalog } from "./publish-creator-bundle-release.mjs";
import { BUNDLE_V2_INDEX_KEY } from "./plan-creator-bundle-deploy.mjs";
import { bundleR2BodyFingerprint } from "./lib/creator-bundle-r2-delta.mjs";
import { estimateBundleR2RequestBudget, prepareBundleR2Release, runBundleR2Release } from "./lib/creator-bundle-r2-release.mjs";
import { createBundleR2Rest } from "./lib/creator-bundle-r2-rest.mjs";
import { parseBundleR2ReleaseArgs } from "./upload-creator-bundle-release-r2.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

async function fixture(run) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "bundle-release-r2-")));
  try {
    const assetRoot = join(root, "input"), bodies = [selfContainedGlb("one"), selfContainedGlb("two")];
    const assets = bodies.map((body, i) => assetEntry(`allowed-model-${i}`, 0, `allowed/native/Model${i}.glb`, body));
    writeTree(assetRoot, Object.fromEntries(assets.map((asset, i) => [asset.path, bodies[i]])));
    const ledger = ledgerWithAllowedAndHeld(), ledgerPath = join(root, "ledger.json"); writeFileSync(ledgerPath, JSON.stringify(ledger));
    const catalog = themePacksFor(assets, [ALLOWED_PACK]), catalogBytes = Buffer.from(JSON.stringify(catalog) + "\n");
    const { plan, errors } = planFor({ themePacks: catalog, assetRoot, ledger }); assert.deepEqual(errors, []);
    const release = createReleaseCatalog({ catalogBytes, deployPlan: plan, ledger });
    const result = writeReleaseCatalog(release, join(root, "out"), { protectedRoots: [assetRoot] });
    const options = { releaseRoot: result.releaseRoot, assetRoot, ledgerPath, packDefs: FIXTURE_DEFS };
    const context = prepareBundleR2Release(options), objects = plan.objects.filter((object) => object.source !== null);
    await run({ root, bodies, objects, context, options, release });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
function fakeRest(f, initial = []) {
  const server = new Map(initial.map((i) => [f.objects[i].key, Buffer.from(f.bodies[i])])), calls = [], legacy = Buffer.from("legacy index bytes\n");
  return { server, calls, legacy,
    requestPolicy: { intervalMs: 500, requestTimeoutMs: 30_000, maximumRequests: 100_000 },
    async readCompletion(object) { calls.push("completion-get"); return server.has(object.key) ? Buffer.from(server.get(object.key)) : null; },
    async putCompletion(object, body) { calls.push("completion-put"); assert.equal(object.key, f.context.completion.key);
      assert.deepEqual(body, f.release.files[1].body); server.set(object.key, Buffer.from(body)); },
    async readLegacyIndex() { calls.push("legacy-get"); return Buffer.from(legacy); },
    async listPage() { calls.push("list"); return { objects: [...server].map(([key, body]) => ({ key, size: body.length, etag: bundleR2BodyFingerprint(body).md5 })), truncated: false }; },
    async getObject(object) { calls.push(`GET ${object.key}`); return server.has(object.key) ? Buffer.from(server.get(object.key)) : null; },
    async putObject(object, body) { calls.push(`PUT ${object.key}`); assert.notEqual(object.key, BUNDLE_V2_INDEX_KEY); server.set(object.key, Buffer.from(body)); },
  };
}

test("새 목록의 모든 페이지와 multipart 본문을 확인하고 읽기 모드에서는 PUT하지 않는다", () => fixture(async (f) => {
  const rest = fakeRest(f, [0, 1]), one = f.objects[0], two = f.objects[1];
  rest.listPage = async (cursor) => {
    rest.calls.push(`list ${cursor ?? "first"}`);
    return cursor === undefined
      ? { objects: [{ key: one.key, size: String(one.bytes), etag: bundleR2BodyFingerprint(f.bodies[0]).md5 }], truncated: true, cursor: "next" }
      : { objects: [{ key: two.key, size: two.bytes, etag: "multipart-2" }], truncated: false };
  };
  const result = await runBundleR2Release(f.context, { rest });
  assert.equal(result.pages, 2); assert.equal(result.reused, 2); assert.equal(result.uploaded, 0);
  assert.equal(result.staticReleasePublished, false); assert.equal(result.legacyIndexPreserved, true);
  assert.deepEqual(rest.calls, ["legacy-get", "completion-get", "list first", "list next", `GET ${one.key}`, `GET ${two.key}`, "legacy-get", "completion-get", "legacy-get"]);
}));

test("missing에만 GET404→PUT→GET 전체 SHA를 적용하며 고정 인덱스는 보존한다", () => fixture(async (f) => {
  const rest = fakeRest(f), events = []; let authorities = 0;
  const result = await runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000, assertWriteAuthority: async () => { authorities += 1; }, onEvent: async (event) => { events.push(event); } });
  assert.equal(authorities, 2); assert.equal(result.uploaded, 2); assert.equal(result.productionWrites, 3);
  assert.equal(result.completion.uploaded, 1); assert.equal(result.completion.verified, true);
  assert.equal(result.remoteWholeShaVerified, 2);
  assert.equal(result.conditionalPutGuaranteed, false);
  assert.deepEqual(rest.calls, ["legacy-get", "completion-get", "list", ...f.objects.flatMap((object) => [`GET ${object.key}`, `PUT ${object.key}`, `GET ${object.key}`]), "legacy-get", "completion-get", "completion-put", "completion-get", "legacy-get"]);
  assert.equal(events.filter((event) => event.phase === "put-started").length, 2);
  for (const [i, object] of f.objects.entries()) assert.deepEqual(rest.server.get(object.key), f.bodies[i]);
  assert.equal(rest.calls.some((call) => call === `PUT ${BUNDLE_V2_INDEX_KEY}`), false);
}));

test("목록의 truncation cursor 누락·반복·중복 객체를 전체 목록으로 간주하지 않는다", () => fixture(async (f) => {
  for (const kind of ["missing-cursor", "repeated-cursor", "duplicate-key", "invalid-marker", "invalid-cursor", "empty-cursor", "repeated-terminal-cursor"]) {
    const rest = fakeRest(f); let page = 0;
    rest.listPage = async () => {
      page += 1;
      if (kind === "missing-cursor") return { objects: [], truncated: true };
      if (kind === "repeated-cursor") return { objects: [], truncated: true, cursor: "same" };
      if (kind === "invalid-marker") return { objects: [], truncated: "false" };
      if (kind === "invalid-cursor") return { objects: [], cursor: 23 };
      if (kind === "empty-cursor") return { objects: [], cursor: "" };
      if (kind === "repeated-terminal-cursor") return { objects: [], truncated: page === 1, cursor: "same" };
      return { objects: [{ key: f.objects[0].key, size: f.objects[0].bytes, etag: "opaque" }], truncated: page === 1, cursor: "next" };
    };
    await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000, assertWriteAuthority: async () => {} }));
    assert.equal(rest.calls.some((call) => call.startsWith("PUT ")), false); assert.ok(page <= 2);
  }
}));

test("원격 불일치는 누락분 첫 PUT보다 먼저 중단한다", () => fixture(async (f) => {
  const rest = fakeRest(f, [1]);
  rest.listPage = async () => ({ objects: [{ key: f.objects[1].key, size: f.objects[1].bytes, etag: "multipart-2" }], truncated: false });
  rest.getObject = async (object) => { rest.calls.push(`GET ${object.key}`); return Buffer.alloc(object.bytes); };
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000, assertWriteAuthority: async () => {} }), /원격 본문/u);
  assert.deepEqual(rest.calls, ["legacy-get", "completion-get", `GET ${f.objects[1].key}`]);
}));

test("목록 뒤 나타난 객체는 같은 바이트여도 덮어쓰지 않는다", () => fixture(async (f) => {
  const rest = fakeRest(f);
  rest.getObject = async () => Buffer.from(f.bodies[0]);
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000, assertWriteAuthority: async () => {} }), { code: "OBJECT_APPEARED_BEFORE_PUT" });
  assert.equal(rest.calls.some((call) => call.startsWith("PUT ")), false);
}));

test("처리 여부가 불명확한 PUT은 한 번만 보내고 다음 객체로 넘어가지 않는다", () => fixture(async (f) => {
  const rest = fakeRest(f), events = []; let puts = 0;
  rest.putObject = async (object, body) => { puts += 1; rest.server.set(object.key, Buffer.from(body)); throw new Error("합성 응답 유실"); };
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000, assertWriteAuthority: async () => {}, onEvent: async (event) => { events.push(event); } }));
  assert.equal(puts, 1); assert.equal(rest.server.size, 1);
  assert.equal(events.filter((event) => event.phase === "put-started").length, 1);
  assert.equal(events.filter((event) => event.phase === "put-verified").length, 0);
  assert.equal(rest.calls.includes("completion-put"), false);
}));

test("PUT 뒤 같은 길이의 잘못된 본문을 받으면 다음 PUT을 실행하지 않는다", () => fixture(async (f) => {
  const rest = fakeRest(f); let puts = 0;
  rest.putObject = async (object) => { puts += 1; rest.server.set(object.key, Buffer.alloc(object.bytes)); };
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000, assertWriteAuthority: async () => {} }), /원격 본문/u);
  assert.equal(puts, 1);
  assert.equal(rest.calls.includes("completion-put"), false);
}));

test("원장 또는 원본이 계획 이후 바뀌면 다음 PUT을 실행하지 않는다", () => fixture(async (f) => {
  const rest = fakeRest(f);
  rest.listPage = async () => { writeFileSync(f.options.ledgerPath, "변경"); return { objects: [], truncated: false }; };
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000, assertWriteAuthority: async () => {} }), { code: "CONTROL_CHANGED" });
  assert.equal(rest.calls.some((call) => call.startsWith("PUT ")), false);
}));

test("descriptor와 원문 카탈로그 SHA가 다르면 원격 조회 전에 거부한다", () => fixture(async (f) => {
  const descriptor = JSON.parse(readFileSync(join(f.options.releaseRoot, RELEASE_DESCRIPTOR_PATH)));
  writeFileSync(join(f.options.releaseRoot, STATIC_DIRECTORY, `theme-packs.${descriptor.catalog.sha256}.json`), "{}\n");
  assert.throws(() => prepareBundleR2Release(f.options), { code: "RELEASE_HASH" });
}));

test("실행 중 legacy index가 달라지면 성공으로 보고하지 않는다", () => fixture(async (f) => {
  const rest = fakeRest(f, [0, 1]); let reads = 0;
  rest.readLegacyIndex = async () => Buffer.from(++reads === 1 ? "before" : "after");
  await assert.rejects(runBundleR2Release(f.context, { rest }), { code: "LEGACY_INDEX_CHANGED" });
}));

test("전체 시간 상한과 쓰기 권한 누락을 PUT 전에 거부한다", () => fixture(async (f) => {
  const rest = fakeRest(f);
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000 }), { code: "WRITE_AUTHORITY" });
  let time = 0; rest.listPage = async () => { time = 1000; return { objects: [], truncated: false }; };
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000, assertWriteAuthority: async () => {}, now: () => time, maximumDurationMs: 500 }), { code: "RUN_TIMEOUT" });
  assert.equal(rest.calls.some((call) => call.startsWith("PUT ")), false);
}));

test("CLI에 토큰·unknown·중복 인자를 받지 않고 운영의 다른 release/원장 override도 거부한다", () => {
  const base = ["--asset-root", "/private/input"];
  assert.equal(parseBundleR2ReleaseArgs([...base, "--check"]).mode, "check");
  assert.equal(parseBundleR2ReleaseArgs([...base, "--remote-check"]).mode, "remote-check");
  for (const args of [[...base], [...base, "--production"], [...base, "--api-token", "fixture-token"],
    [...base, "--check", "--check"], [...base, "--check", "--production"],
    [...base, "--production", "--approved-sha", "a".repeat(40), "--release-root", "/other"]]) assert.throws(() => parseBundleR2ReleaseArgs(args));
});

test("optional terminal을 받고 marker 생략+새 cursor의 빈 페이지에서도 다음 페이지를 읽는다", () => fixture(async (f) => {
  const objects = f.objects.map((object, i) => ({ key: object.key, size: object.bytes, etag: bundleR2BodyFingerprint(f.bodies[i]).md5 }));
  for (const terminal of [{}, { truncated: false }, { truncated: false, cursor: "last" }]) {
    const rest = fakeRest(f, [0, 1]); let pages = 0;
    rest.listPage = async () => { pages += 1; return { objects, ...terminal }; };
    const result = await runBundleR2Release(f.context, { rest });
    assert.equal(pages, 1); assert.equal(result.reused, 2); assert.equal(result.missing, 0);
  }
  for (const marker of [{}, { truncated: true }]) {
    const rest = fakeRest(f, [0, 1]), requested = [];
    rest.listPage = async (cursor) => {
      requested.push(cursor);
      return cursor === undefined ? { objects: [], cursor: "next", ...marker } : { objects };
    };
    const result = await runBundleR2Release(f.context, { rest });
    assert.deepEqual(requested, [undefined, "next"]); assert.equal(result.pages, 2); assert.equal(result.reused, 2);
    assert.equal(result.missing, 0); assert.equal(rest.calls.some((call) => call.startsWith("PUT ")), false);
  }
}));

test("실제 adapter의 partial list 실패는 production 첫 PUT 전에 중단한다", () => fixture(async (f) => {
  const methods = [];
  const rest = createBundleR2Rest({ accountId: "a".repeat(32), token: "fixture-only-token", sleep: async () => {},
    fetcher: async (url, init) => {
      methods.push(init.method);
      if (url.includes("/release-index/")) return new Response(null, { status: 404 });
      return url.includes("?") ? new Response(JSON.stringify({ success: false, errors: [{ message: "fixture-provider-private" }], result: [] })) : new Response("legacy");
    } });
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000, assertWriteAuthority: async () => {} }), (error) => error.code === "LIST_FORMAT" && !error.message.includes("fixture-provider-private"));
  assert.deepEqual(methods, ["GET", "GET", "GET"]);
}));

test("GLB가 모두 있어도 전체 SHA를 확인한 뒤 같은 정적 원문을 마지막 한 번만 완료 PUT한다", () => fixture(async (f) => {
  const rest = fakeRest(f, [0, 1]); let authorities = 0;
  const result = await runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000,
    assertWriteAuthority: async () => { authorities += 1; } });
  assert.equal(authorities, 1); assert.equal(result.uploaded, 0); assert.equal(result.productionWrites, 1);
  assert.equal(result.allGlbsVerified, true); assert.equal(result.remoteWholeShaVerified, f.objects.length);
  assert.deepEqual(rest.server.get(f.context.completion.key), f.release.files[1].body);
  assert.equal(f.context.completion.sha256, f.release.descriptor.index.sha256);
  assert.equal(f.context.completion.bytes, f.release.descriptor.index.bytes);
  assert.equal(f.context.completion.key, `assets/studio/bundle-v2/release-index/${f.release.descriptor.index.sha256}.json`);
  assert.deepEqual(rest.calls.filter((call) => call.startsWith("PUT ") || call === "completion-put"), ["completion-put"]);
  assert.equal(rest.calls.filter((call) => call === "completion-get").length, 3);
}));

test("MD5 ETag가 로컬과 같아도 원격 전체 SHA가 다르면 첫 PUT과 완료 표식을 거부한다", () => fixture(async (f) => {
  const rest = fakeRest(f, [0, 1]);
  rest.server.set(f.objects[0].key, Buffer.alloc(f.objects[0].bytes));
  rest.listPage = async () => ({ objects: f.objects.map((object, i) => ({ key: object.key, size: object.bytes,
    etag: bundleR2BodyFingerprint(f.bodies[i]).md5 })), truncated: false });
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000,
    assertWriteAuthority: async () => {} }), /원격 본문/u);
  assert.equal(rest.calls.some((call) => call.startsWith("PUT ") || call === "completion-put"), false);
}));

test("다른 본문의 기존 marker는 목록과 첫 GLB PUT보다 먼저 거부한다", () => fixture(async (f) => {
  const rest = fakeRest(f); rest.server.set(f.context.completion.key, Buffer.alloc(f.context.completion.bytes));
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000,
    assertWriteAuthority: async () => {} }), { code: "COMPLETION_MISMATCH" });
  assert.deepEqual(rest.calls, ["legacy-get", "completion-get"]);
}));

test("정확한 marker가 있어도 GLB 누락 상태는 자동 보수하지 않는다", () => fixture(async (f) => {
  const rest = fakeRest(f, [0]); rest.server.set(f.context.completion.key, Buffer.from(f.release.files[1].body));
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000,
    assertWriteAuthority: async () => {} }), { code: "COMPLETION_WITH_MISSING_OBJECTS" });
  assert.equal(rest.calls.some((call) => call.startsWith("PUT ") || call === "completion-put"), false);
}));

test("기존 marker와 전 GLB가 정확하면 원격 전체 SHA만 검증하고 PUT을 재실행하지 않는다", () => fixture(async (f) => {
  const rest = fakeRest(f, [0, 1]); rest.server.set(f.context.completion.key, Buffer.from(f.release.files[1].body));
  const result = await runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000, assertWriteAuthority: async () => {} });
  assert.equal(result.completion.reused, true); assert.equal(result.completion.verified, true);
  assert.equal(result.productionWrites, 0); assert.equal(result.allGlbsVerified, true);
  assert.equal(rest.calls.some((call) => call.startsWith("PUT ") || call === "completion-put"), false);
  assert.equal(rest.calls.filter((call) => call.startsWith("GET ")).length, 2);
}));

test("신규 marker가 실행 중 나타나면 같은 원문이어도 완료 PUT을 하지 않는다", () => fixture(async (f) => {
  const rest = fakeRest(f, [0, 1]); let reads = 0;
  rest.readCompletion = async () => { reads += 1; return reads === 1 ? null : Buffer.from(f.release.files[1].body); };
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000,
    assertWriteAuthority: async () => {} }), { code: "COMPLETION_APPEARED" });
  assert.equal(rest.calls.includes("completion-put"), false);
}));

test("읽기 모드는 GLB와 marker가 없어도 배포 완료로 꾸미거나 marker를 쓰지 않는다", () => fixture(async (f) => {
  const rest = fakeRest(f);
  const result = await runBundleR2Release(f.context, { rest });
  assert.equal(result.missing, 2); assert.equal(result.productionWrites, 0);
  assert.equal(result.completion.present, false); assert.equal(result.completion.uploaded, 0);
  assert.equal(result.completion.verified, false); assert.equal(result.allGlbsVerified, false);
  assert.equal(result.budget.requests, rest.calls.length); assert.equal(rest.server.size, 0);
  assert.equal(rest.calls.includes("completion-put"), false);
}));

test("일부 GLB 성공 뒤 다음 PUT 실패도 완료 표식을 쓰지 않는다", () => fixture(async (f) => {
  const rest = fakeRest(f); let puts = 0;
  rest.putObject = async (object, body) => { puts += 1; if (puts === 2) throw new Error("합성 PUT 결과 불명"); rest.server.set(object.key, Buffer.from(body)); };
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000, assertWriteAuthority: async () => {} }));
  assert.equal(puts, 2); assert.equal(rest.server.size, 1); assert.equal(rest.calls.includes("completion-put"), false);
}));

test("완료 PUT 응답이 유실되면 재전송·확인 성공 기록 없이 중단한다", () => fixture(async (f) => {
  const rest = fakeRest(f, [0, 1]), events = []; let puts = 0, reads = 0;
  rest.readCompletion = async (object) => { reads += 1; return rest.server.get(object.key) ?? null; };
  rest.putCompletion = async (object, body) => { puts += 1; rest.server.set(object.key, Buffer.from(body)); throw new Error("합성 marker 응답 유실"); };
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000,
    assertWriteAuthority: async () => {}, onEvent: async (event) => { events.push(event); } }));
  assert.equal(puts, 1); assert.equal(reads, 2);
  assert.equal(events.filter((event) => event.phase === "completion-put-started").length, 1);
  assert.equal(events.filter((event) => event.phase === "completion-put-verified").length, 0);
}));

test("마지막 권한 재확인이 실패하면 GLB가 성공했어도 완료 표식을 쓰지 않는다", () => fixture(async (f) => {
  const rest = fakeRest(f); let authorities = 0;
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000,
    assertWriteAuthority: async () => { authorities += 1; if (authorities === 2) throw new Error("합성 main 변경"); } }));
  assert.equal(authorities, 2); assert.equal(rest.server.size, 2); assert.equal(rest.calls.includes("completion-put"), false);
}));

test("완료 전 legacy 원문 변경은 marker PUT 없이 중단한다", () => fixture(async (f) => {
  const rest = fakeRest(f, [0, 1]); let reads = 0;
  rest.readLegacyIndex = async () => Buffer.from(++reads === 1 ? "before" : "after");
  await assert.rejects(runBundleR2Release(f.context, { rest, production: true, requestBudget: 100_000,
    assertWriteAuthority: async () => {} }), { code: "LEGACY_INDEX_CHANGED" });
  assert.equal(rest.calls.includes("completion-put"), false);
}));

test("정확 요청 수와 남은 간격·완료 확인 예산이 부족하면 첫 PUT 전에 중단한다", () => fixture(async (f) => {
  for (const [options, code] of [[{ requestBudget: 1 }, "REQUEST_BUDGET_TOO_SMALL"],
    [{ requestBudget: 100_000, maximumDurationMs: 60_000 }, "TIME_BUDGET_TOO_SMALL"]]) {
    const rest = fakeRest(f);
    await assert.rejects(runBundleR2Release(f.context, { rest, production: true, assertWriteAuthority: async () => {}, ...options }), { code });
    assert.equal(rest.calls.some((call) => call.startsWith("PUT ") || call === "completion-put"), false);
  }
  const estimate = estimateBundleR2RequestBudget({ objects: 5229, missing: 5229, pages: 1, production: true, completionPresent: false });
  assert.equal(estimate.requests, 15695); assert.ok(estimate.spacingLowerBoundMs > 7_200_000);
  assert.equal(estimate.transferDurationGuaranteed, false);
}));

test("production 시간과 요청 수는 자동 기본값 없이 둘 다 명시해야 한다", () => {
  const base = ["--asset-root", "/private/input", "--production", "--approved-sha", "a".repeat(40)];
  for (const args of [base, [...base, "--maximum-seconds", "21600"], [...base, "--request-budget", "16000"]]) {
    assert.throws(() => parseBundleR2ReleaseArgs(args), { code: "ARGUMENTS" });
  }
  const options = parseBundleR2ReleaseArgs([...base, "--maximum-seconds", "21600", "--request-budget", "16000"]);
  assert.equal(options.maximumDurationMs, 21_600_000); assert.equal(options.requestBudget, 16000);
});

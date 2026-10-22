import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import nodeTest from "node:test";
import { fileURLToPath } from "node:url";
import { test as vitestTest } from "vitest";

import {
  buildThemePacks,
  CATALOG_PACKS,
  CROWD_PACKS,
  PENDING_PACKS,
} from "./generate-creator-bundle-theme-packs.mjs";
import {
  HOLD_PUBLIC_LABEL,
  packRightsKey,
  requiredEvidenceKinds,
} from "./lib/creator-bundle-pack-rights.mjs";
import { holdAllLedger, qualifyingEvidence, selfContainedGlb } from "./lib/creator-bundle-pack-rights-test-support.mjs";
import { assessPlanForMode, createBundleV2DeployPlan } from "./plan-creator-bundle-deploy.mjs";

// 루트 `vitest run`(scripts/**/*.test.mjs 수집)과 `node --test` 양쪽에서 같은 파일이 돈다.
const test = process.env.VITEST ? vitestTest : nodeTest;

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "generate-creator-bundle-theme-packs.mjs");
const sha256Of = (buffer) => createHash("sha256").update(buffer).digest("hex");

/**
 * 생성기 정의의 실제 인제스션 id를 쓰는 소형 픽스처. 팩 정의(와 재부여되는 인제스션 id)는 생성기 소스가 정본이라
 * id를 테스트에 베껴 두지 않고 정의에서 읽는다 (각 팩의 첫 인제스션 폴더 = godot/원본 변형).
 */
const firstIngest = (defs, title) => {
  const def = defs.find((candidate) => candidate.title === title);
  assert.ok(def?.ingest.length, `생성기 정의에 인제스션 폴더가 있는 ${title}가 없습니다.`);
  return def.ingest[0];
};
const INGEST = {
  oldTown: firstIngest(CATALOG_PACKS, "Old Town — Courtyards"),
  pirate: firstIngest(CATALOG_PACKS, "Pirate Island"),
  smallProps: firstIngest(CATALOG_PACKS, "Small Props Pack"),
  characters1: firstIngest(CROWD_PACKS, "Characters 1"),
};

function titleToEntry(ledger, title) {
  const entry = ledger.packs.find((candidate) => candidate.title === title);
  assert.ok(entry, `원장에 ${title}가 없습니다.`);
  return entry;
}

/** 실제 원장을 복사해 해당 팩을 allow로 바꾸고 분류가 요구하는 증빙을 전부 채운다. */
function openPack(ledger, title) {
  const entry = titleToEntry(ledger, title);
  const kinds = requiredEvidenceKinds(entry.licenseClass);
  assert.ok(kinds, `${title}: allow 요구가 정의되지 않은 분류입니다.`);
  const have = new Set(entry.evidence.map((item) => item.kind));
  for (const kind of kinds) {
    if (!have.has(kind)) entry.evidence.push(qualifyingEvidence(kind));
  }
  entry.serve = "allow";
  delete entry.holdReason;
  delete entry.holdLabel;
  entry.grant = {
    status: "licensed",
    licenseName: `Creator Bundle: Volume 1 — ${entry.creator} fixture`,
    commercialUse: true,
    attributionRequired: false,
  };
}



function withFixtureTree(run) {
  const root = mkdtempSync(join(tmpdir(), "bundle-theme-packs-test-"));
  try {
    const files = {};
    const assets = [];
    const add = (ingestId, name, label) => {
      const buffer = selfContainedGlb(label);
      const path = `${ingestId}/native/${name}.glb`;
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), buffer);
      files[label] = buffer;
      assets.push({
        id: `${ingestId}-${name}`,
        packId: ingestId,
        role: "runtime",
        format: "glb",
        sourcePath: `${name}.glb`,
        files: [{ kind: "primary", path, sha256: sha256Of(buffer), bytes: buffer.length }],
      });
    };
    add(INGEST.oldTown, "house-a", "old-town-a");
    add(INGEST.oldTown, "house-b", "old-town-b");
    add(INGEST.pirate, "ship", "pirate-ship");
    add(INGEST.smallProps, "prop-a", "small-props-a");
    add(INGEST.smallProps, "prop-b", "small-props-b");
    add(INGEST.characters1, "hero", "characters-1");
    const manifestV2 = {
      kind: "toonstudio.asset-bundle.v2",
      version: 2,
      inServiceOnly: true,
      downloadable: false,
      generatedAt: "2026-10-21T05:14:22.108Z",
      totals: { assets: assets.length },
      assets,
    };
    const themesDoc = { themes: [{ theme: "city", label: "도시" }, { theme: "desert-tropical", label: "사막·열대" }] };
    return run({ root, manifestV2, themesDoc, files });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("원장이 열어 준 팩만 packs·assets에 들어가고 hold 팩은 pendingPacks(rights-hold)로 간다", () => {
  withFixtureTree(({ root, manifestV2, themesDoc }) => {
    const ledger = holdAllLedger();
    openPack(ledger, "Old Town — Courtyards");
    openPack(ledger, "Pirate Island");
    const { output, stats } = buildThemePacks({ manifestV2, themesDoc, assetRoot: root, ledger });

    assert.deepEqual(output.packs.map((pack) => pack.title), ["Old Town — Courtyards", "Pirate Island"]);
    assert.equal(output.assets.length, 3);
    assert.ok(output.assets.every((asset) => !asset.id.includes("small-props") && !asset.id.includes("hero")));
    assert.ok(output.assets.every((asset) => !asset.path.startsWith(INGEST.smallProps)));
    // 허용된 팩은 팩별 권리를 싣는다 (로더가 이 값으로 레코드 권리를 만든다).
    assert.deepEqual(output.packs[0].rights, {
      serve: "allow",
      status: "licensed",
      licenseName: "Creator Bundle: Volume 1 — EmaceArt fixture",
      commercialUse: true,
      attributionRequired: false,
    });
    assert.equal(output.packs[1].rights.licenseName, "Creator Bundle: Volume 1 — RG Poly fixture");
    // Small Props(권고 hold)와 Characters 1(군중)은 원장 hold라 파일을 읽지 않고 대기 목록으로만 간다.
    const held = output.pendingPacks.filter((pack) => pack.reason === "rights-hold");
    assert.ok(held.some((pack) => pack.title === "Small Props Pack"));
    assert.ok(held.some((pack) => pack.title === "Characters 1"));
    assert.equal(held.length, CATALOG_PACKS.length + CROWD_PACKS.length - 2);
    assert.equal(stats.heldPacks.length, held.length);
    assert.ok(held.every((pack) => typeof pack.reasonLabel === "string" && pack.reasonLabel.length > 0));
    assert.deepEqual(output.crowdPacks, []);
    // 기존 정적 보류 14개는 그대로 앞에 남는다.
    assert.deepEqual(output.pendingPacks.slice(0, PENDING_PACKS.length), PENDING_PACKS);
    // 합계는 허용된 팩 기준으로 일치한다.
    assert.equal(output.totals.packs, output.packs.length);
    assert.equal(output.totals.placeableAssets, output.assets.length);
    assert.equal(output.packs.reduce((sum, pack) => sum + pack.placeable, 0), output.assets.length);
    assert.equal(output.totals.crowdGlbAssets, 0);
    assert.ok(output.assets.every((asset) => output.packs[asset.pack] !== undefined));
  });
});

test("생성 결과의 합계는 배포 플래너 인덱스와 일치하고, 원장이 바뀌면 stale로 드러난다", () => {
  withFixtureTree(({ root, manifestV2, themesDoc }) => {
    const ledger = holdAllLedger();
    openPack(ledger, "Old Town — Courtyards");
    openPack(ledger, "Pirate Island");
    const { output } = buildThemePacks({ manifestV2, themesDoc, assetRoot: root, ledger });

    const fresh = createBundleV2DeployPlan({ themePacks: output, assetRoot: root, ledger });
    assert.deepEqual(fresh.errors, []);
    const index = JSON.parse(fresh.plan.objects.at(-1).inlineBody);
    // 패널 가용성 판정(index.files === placeableAssets && index.bytes === 에셋 바이트 합)과 같은 조건.
    assert.equal(index.files, output.totals.placeableAssets);
    assert.equal(index.bytes, output.assets.reduce((sum, asset) => sum + asset.bytes, 0));
    assert.equal(index.packs, output.totals.packs);
    assert.deepEqual(assessPlanForMode(fresh.plan, "production"), { stale: false, refusal: null });

    // 생성 이후 원장에서 한 팩이 hold로 돌아가면 플래너는 그 에셋을 빼고 stale을 알린다.
    const pirate = titleToEntry(ledger, "Pirate Island");
    pirate.serve = "hold";
    pirate.holdReason = "evidence-incomplete";
    pirate.holdLabel = HOLD_PUBLIC_LABEL;
    delete pirate.grant;
    const stale = createBundleV2DeployPlan({ themePacks: output, assetRoot: root, ledger });
    assert.deepEqual(stale.errors, []);
    assert.equal(stale.plan.excludedByRights[0].title, "Pirate Island");
    const staleIndex = JSON.parse(stale.plan.objects.at(-1).inlineBody);
    assert.notEqual(staleIndex.files, output.totals.placeableAssets);
    assert.match(assessPlanForMode(stale.plan, "production").refusal, /--production 거부/);
  });
});

test("원장의 모든 팩을 hold로 두면 허용 팩이 없고 61개 팩이 모두 대기 목록에 있으며 합계가 맞는다", () => {
  withFixtureTree(({ root, manifestV2, themesDoc }) => {
    // 소유자가 이미 연 팩이 있더라도 닫힌 상태를 만들어 본다 (커밋된 원장의 시드 상태에 묶이지 않는다).
    const ledger = holdAllLedger();
    const { output } = buildThemePacks({ manifestV2, themesDoc, assetRoot: root, ledger });
    assert.equal(output.packs.length, 0);
    assert.equal(output.assets.length, 0);
    assert.equal(output.crowdPacks.length, 0);
    assert.equal(output.totals.placeableAssets, 0);
    assert.equal(output.pendingPacks.length, CATALOG_PACKS.length + CROWD_PACKS.length + PENDING_PACKS.length);
  });
});

test("대기 목록의 hold 팩 문구는 원장 holdLabel 그대로이고 사유·약속을 드러내지 않는 같은 문장이다", () => {
  withFixtureTree(({ root, manifestV2, themesDoc }) => {
    const ledger = holdAllLedger();
    openPack(ledger, "Old Town — Courtyards");
    const { output } = buildThemePacks({ manifestV2, themesDoc, assetRoot: root, ledger });
    const held = output.pendingPacks.filter((pack) => pack.reason === "rights-hold");
    assert.ok(held.length > 0);
    for (const pack of held) {
      assert.equal(pack.reasonLabel, titleToEntry(ledger, pack.title).holdLabel, pack.title);
    }
    assert.deepEqual([...new Set(held.map((pack) => pack.reasonLabel))], [HOLD_PUBLIC_LABEL]);
  });
});

test("원장이 연 군중 팩(Characters 1)은 crowdPacks에 들어가고 합계에 반영되며 배치용 권리 블록은 없다", () => {
  withFixtureTree(({ root, manifestV2, themesDoc }) => {
    const ledger = holdAllLedger();
    openPack(ledger, "Characters 1");
    const { output, stats } = buildThemePacks({ manifestV2, themesDoc, assetRoot: root, ledger });
    assert.deepEqual(output.crowdPacks, [{
      catalogIds: ["cbv1-003-cartoon-characters-1"],
      title: "Characters 1",
      creator: "RG Poly",
      category: "crowd-render-only",
      glbAssets: 1,
      ...(output.crowdPacks[0]?.note ? { note: output.crowdPacks[0].note } : {}),
    }]);
    assert.equal(output.totals.crowdGlbAssets, 1);
    // 군중 팩은 렌더 전용이라 packs·assets·권리 블록에 들어가지 않고, 대기 목록에서도 빠진다.
    assert.equal(output.packs.length, 0);
    assert.equal(output.assets.length, 0);
    assert.equal(output.crowdPacks[0].rights, undefined);
    assert.ok(!output.pendingPacks.some((pack) => pack.title === "Characters 1"));
    assert.ok(!stats.heldPacks.some(({ def }) => def.title === "Characters 1"));
    assert.equal(stats.heldPacks.length, CATALOG_PACKS.length + CROWD_PACKS.length - 1);
  });
});

test("닫힌 팩의 실물은 읽지 않는다 — 실물이 없어도 생성이 성공하고, 열린 팩의 실물이 없으면 던진다", () => {
  withFixtureTree(({ root, manifestV2, themesDoc }) => {
    const ledger = holdAllLedger();
    openPack(ledger, "Old Town — Courtyards");
    // 닫힌 팩(Pirate Island·Small Props·Characters 1)의 실물을 모두 지운다. 읽으려 들면 '실물 파일이 없습니다'로 던진다.
    for (const asset of manifestV2.assets) {
      if (asset.packId !== INGEST.oldTown) rmSync(join(root, asset.files[0].path));
    }
    const { output } = buildThemePacks({ manifestV2, themesDoc, assetRoot: root, ledger });
    assert.deepEqual(output.packs.map((pack) => pack.title), ["Old Town — Courtyards"]);
    assert.equal(output.assets.length, 2);

    // 열린 팩의 실물이 사라지면 조용히 건너뛰지 않고 던진다.
    const oldTown = manifestV2.assets.find((asset) => asset.packId === INGEST.oldTown);
    rmSync(join(root, oldTown.files[0].path));
    assert.throws(
      () => buildThemePacks({ manifestV2, themesDoc, assetRoot: root, ledger }),
      /실물 파일이 없습니다/,
    );
  });
});

test("열린 팩의 에셋은 크기 불일치면 던지고 해시 불일치면 건너뛰며 건수를 센다", () => {
  withFixtureTree(({ root, manifestV2, themesDoc }) => {
    const ledger = holdAllLedger();
    openPack(ledger, "Old Town — Courtyards");

    const wrongSize = structuredClone(manifestV2);
    const target = wrongSize.assets.find((asset) => asset.packId === INGEST.oldTown);
    target.files[0].bytes += 1;
    assert.throws(
      () => buildThemePacks({ manifestV2: wrongSize, themesDoc, assetRoot: root, ledger }),
      /크기 불일치/,
    );

    const wrongHash = structuredClone(manifestV2);
    wrongHash.assets.find((asset) => asset.packId === INGEST.oldTown).files[0].sha256 = "0".repeat(64);
    const errors = [];
    const { output, stats } = buildThemePacks({
      manifestV2: wrongHash, themesDoc, assetRoot: root, ledger, onError: (message) => errors.push(message),
    });
    assert.equal(stats.hashMismatch, 1);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /해시 불일치/);
    assert.equal(output.assets.length, 1, "해시가 어긋난 에셋은 배치 가능에 들어가지 않는다");
    assert.equal(output.packs[0].placeable, 1);
  });
});

test("원장이 팩 정의를 덮지 못하거나 증빙 없는 allow가 있으면 생성을 거부한다", () => {
  withFixtureTree(({ root, manifestV2, themesDoc }) => {
    const missingEntry = holdAllLedger();
    missingEntry.packs = missingEntry.packs.filter((entry) => entry.title !== "Pirate Island");
    assert.throws(
      () => buildThemePacks({ manifestV2, themesDoc, assetRoot: root, ledger: missingEntry }),
      /덮지 못합니다.*Pirate Island/,
    );

    const unproven = holdAllLedger();
    const entry = titleToEntry(unproven, "Pirate Island");
    entry.serve = "allow";
    entry.grant = { status: "licensed", licenseName: "x", commercialUse: true, attributionRequired: false };
    delete entry.holdReason;
    delete entry.holdLabel;
    assert.throws(
      () => buildThemePacks({ manifestV2, themesDoc, assetRoot: root, ledger: unproven }),
      /권리 원장이 올바르지 않습니다/,
    );
  });
});

test("Characters 1/2는 공식 카탈로그 기준 제작사(RG Poly)와 id를 쓴다", () => {
  const crowd = Object.fromEntries(CROWD_PACKS.map((pack) => [pack.title, pack]));
  assert.equal(crowd["Characters 1"].creator, "RG Poly");
  assert.deepEqual(crowd["Characters 1"].catalogIds, ["cbv1-003-cartoon-characters-1"]);
  assert.equal(crowd["Characters 2"].creator, "RG Poly");
  assert.deepEqual(crowd["Characters 2"].catalogIds, ["cbv1-007-cartoon-characters-2"]);
  const keys = new Set([...CATALOG_PACKS, ...CROWD_PACKS, ...PENDING_PACKS].map((pack) => packRightsKey(pack)));
  assert.equal(keys.size, CATALOG_PACKS.length + CROWD_PACKS.length + PENDING_PACKS.length);
});

test("CLI는 원장을 --pack-rights로 받아 hold 팩을 빼고 theme-packs를 쓴다", () => {
  withFixtureTree(({ root, manifestV2, themesDoc }) => {
    const ledger = holdAllLedger();
    openPack(ledger, "Old Town — Courtyards");
    const manifestPath = join(root, "manifest-v2.json");
    const themesPath = join(root, "themes.json");
    const ledgerPath = join(root, "ledger.json");
    const outPath = join(root, "theme-packs.json");
    writeFileSync(manifestPath, JSON.stringify(manifestV2));
    writeFileSync(themesPath, JSON.stringify(themesDoc));
    writeFileSync(ledgerPath, JSON.stringify(ledger));
    const args = [SCRIPT, "--manifest-v2", manifestPath, "--themes", themesPath, "--out", outPath, "--pack-rights", ledgerPath];

    const dry = spawnSync(process.execPath, [...args, "--dry-run"], { encoding: "utf8" });
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /dry-run: nothing written/);
    assert.equal(existsSync(outPath), false);

    const written = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(written.status, 0, written.stderr);
    assert.match(written.stdout, /hold: Small Props Pack/);
    const output = JSON.parse(readFileSync(outPath, "utf8"));
    assert.deepEqual(output.packs.map((pack) => pack.title), ["Old Town — Courtyards"]);
    assert.equal(output.totals.placeableAssets, 2);
    assert.ok(output.pendingPacks.some((pack) => pack.reason === "rights-hold" && pack.title === "Pirate Island"));
  });
});

test("CLI는 잘못된 원장이면 아무것도 쓰지 않고 종료 코드 2로 닫는다", () => {
  withFixtureTree(({ root, manifestV2, themesDoc }) => {
    const manifestPath = join(root, "manifest-v2.json");
    const themesPath = join(root, "themes.json");
    const ledgerPath = join(root, "ledger.json");
    const outPath = join(root, "theme-packs.json");
    writeFileSync(manifestPath, JSON.stringify(manifestV2));
    writeFileSync(themesPath, JSON.stringify(themesDoc));
    writeFileSync(ledgerPath, JSON.stringify({ schema: "other" }));
    const result = spawnSync(process.execPath, [
      SCRIPT, "--manifest-v2", manifestPath, "--themes", themesPath, "--out", outPath, "--pack-rights", ledgerPath,
    ], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /권리 원장이 올바르지 않습니다/);
    assert.equal(existsSync(outPath), false);
  });
});

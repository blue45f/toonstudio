import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { assertTrackedDocumentInputs, fixtureGitEnvironment, sparsePatterns } from "./ci-checkout-test-helpers.mjs";

/** 문서 없는 preflight에서도 Git 인덱스만 권위로 사용하는지 독립 검증한다. */
export function assertTrackedDocumentCheckoutContract(typecheckJob) {
  const root = mkdtempSync(join(tmpdir(), "core-document-index-authority-"));
  const env = fixtureGitEnvironment(root);
  const path = "/docs/third-party/opencascade-lgpl.md";
  const relative = path.slice(1), absolute = join(root, relative);
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git("init", "--quiet");
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, "정본 문서\n");
    writeFileSync(join(root, "package.json"), "{}\n");
    git("add", ".");
    const tree = git("write-tree");
    git("config", "core.sparseCheckout", "true");
    git("config", "core.sparseCheckoutCone", "false");
    writeFileSync(join(root, ".git/info/sparse-checkout"), `${sparsePatterns(typecheckJob).join("\n")}\n`);
    git("read-tree", "-mu", tree);
    assert.equal(existsSync(absolute), false, "typecheck lane은 foundation 문서 본문을 내려받지 않습니다.");
    assertTrackedDocumentInputs([path], { cwd: root, env });

    git("update-index", "--force-remove", "--", relative);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, "추적되지 않은 파일\n");
    assert.equal(existsSync(absolute), true);
    assert.throws(() => assertTrackedDocumentInputs([path], { cwd: root, env }), /foundation 문서 정본이 Git 추적 목록에 없습니다/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

/** 최초 checkout의 입력 소유권과 문서 없는 preflight를 실제 Git projection으로 검증한다. */
export function assertStaticCheckoutInputContract(staticJob, repoRoot, typecheckJob) {
  const asset = "/apps/web/public/assets/";
  const foundationInputs = [
    "/apps/web/public/assets/3d/environments/bundle-v1/deploy-index.b90b58fd4c87e9fddb2e39a7f1cbeb75ce93f0bc19f4f1cc053ac696e55e377c.json",
    "/apps/web/public/assets/3d/environments/bundle-v1/theme-packs.e855c272c15db1f75a7a398c93f01c9ce6ff27342f2b10b2707e4daf9abe3ce4.json",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/cgi-director-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/cgi-director-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/chief-pd-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/chief-pd-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/colorist-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/colorist-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/line-artist-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/line-artist-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/diverse-creator-cast-clean-atlas.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/four-studio-themes-atlas.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/themes/cyber-neon-lab.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/themes/hanok-botanical-atelier.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/themes/lofi-cat-storyhouse.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/themes/seoul-editorial-hq.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/action-mocap-actor-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/action-mocap-actor-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/sound-letterer-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/sound-letterer-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/story-writer-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/story-writer-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/studio-cat-mascot-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/studio-cat-mascot-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/genre-studio-themes-atlas.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/specialist-cast-clean-atlas.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/themes/brooklyn-indie-comics-loft.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/themes/murim-bamboo-pavilion.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/themes/romance-palace-conservatory.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/themes/scifi-orbital-command.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/creator-emote-and-walk-sheet.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/emotes/celebrate-highfive.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/emotes/coffee-cat-break.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/emotes/crunch-flame-focus.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/emotes/stride-walk.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/four-more-studio-themes-atlas.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/props/blender-hologram-stage-table.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/props/deadline-espresso-cat-lounge.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/props/dual-cintiq-critique-pod.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/props/webtoon-sound-foley-booth.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/themes/abyssal-bioluminescent-worldlab.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/themes/dolby-sound-dubbing-studio.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/themes/magic-academy-astral-library.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/themes/rooftop-sunset-screening-stage.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/webtoon-props-and-zones-atlas.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/rooms/global-ip-pitch-boardroom.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/rooms/recruit-interview-conservatory.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/rooms/retro-arcade-gacha-lounge.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/rooms/tarot-story-oracle-pavilion.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/walk/creator-walk-down.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/walk/creator-walk-left.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/walk/creator-walk-right.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/walk/creator-walk-up.webp",
    "/apps/web/public/vrm/LICENSES.md",
    ...["Sendagaya_Shino", "Sendagaya_Shibu", "Kate", "Jennifer", "Erika", "Olivia", "Jimmy", "Anna", "Cyberpal"].map((id) => `/apps/web/public/vrm/${id}.vrm`),
  ];
  const routeVisualInputs = [
    `${asset}studio/generated-backgrounds/gpt25-v1/drama/gpt25-bg-drama-boardroom-vertical-depth/background.png`,
    `${asset}studio/generated-backgrounds/gpt25-v1/romance/gpt25-bg-romance-cherry-path-vertical-depth/background.png`,
    `${asset}studio/generated-backgrounds/gpt25-v1/wuxia/gpt25-bg-wuxia-palace-courtyard-vertical-depth/background.png`,
    `${asset}studio/generated-backgrounds/gpt25-v1/daily/gpt25-bg-daily-convenience-store-vertical-depth/background.png`,
    `${asset}studio/generated-backgrounds/gpt25-v1/sf/gpt25-bg-sf-space-station-vertical-depth/background.png`,
    `${asset}studio/generated-backgrounds/gpt25-v1/sf/gpt25-bg-sf-cyber-alley-vertical-depth/background.png`,
    `${asset}studio/generated-backgrounds/gpt25-v1/action/gpt25-bg-action-highway-chase-vertical-depth/background.png`,
    `${asset}studio/generated-backgrounds/gpt25-v1/drama/gpt25-bg-drama-hospital-corridor-vertical-depth/background.png`,
    `${asset}studio/generated-backgrounds/gpt25-v1/romance/gpt25-bg-romance-ferris-wheel-vertical-depth/background.png`,
    `${asset}studio/generated-backgrounds/gpt25-v1/action/gpt25-bg-action-jungle-temple-vertical-depth/background.png`,
    `${asset}studio/generated-backgrounds/gpt25-v1/wuxia/gpt25-bg-wuxia-traditional-market-vertical-depth/background.png`,
    `${asset}studio/generated-backgrounds/gpt25-v1/sf/gpt25-bg-sf-research-lab-vertical-depth/background.png`,
    `${asset}studio/generated-backgrounds/gpt25-v1/daily/gpt25-bg-daily-bedroom-night-vertical-depth/background.png`,
    `${asset}studio/generated-backgrounds/gpt25-v1/fantasy/gpt25-bg-fantasy-dragon-cliff-vertical-depth/background.png`,
  ];
  const foundationDocumentInputs = [
    "/docs/adr/0003-one-primary-surface-owner.md",
    "/docs/adr/0004-2d-baseline-canvaskit-plus-vello-cpu.md",
    "/docs/adr/0005-inking-pipeline-staged.md",
    "/docs/adr/0006-natural-media-hokusai-first.md",
    "/docs/adr/0008-license-isolation-policy.md",
    "/docs/adr/0009-google-ink-poc-gate-and-fallback.md",
    "/docs/adr/0011-v12-frontier-quarantine-ledger.md",
    "/docs/adr/0017-vello-gap-alternative-engine-lanes.md",
    "/docs/adr/0018-no-automatic-engine-fallback-vello-primary.md",
    "/docs/adr/0019-renderer-role-ledger-single-authority.md",
    "/docs/adr/0022-studio-authority-identity-production-modes.md",
    "/docs/adr/0025-skia-retained-document-migration.md",
    "/docs/adr/0026-labs-experimental-apps-engine-selection-and-promotion.md",
    "/docs/studio-bg3d-webgpu-engine-promotion-2026-08-29.md",
    "/docs/candidates/engine-portfolio/capability-survey.md",
    "/docs/third-party/opencascade-lgpl.md",
  ];
  const owned = {
    product: ["/docs/", ...[
      "3d/outfits/README.md", "studio/cc0-20260906/README.md", "3d/LICENSES.md",
      ...["expansion-v1", "mcp-free-v1", "authored-v1", "refined-v6", "webtoon-v7"].map((id) => `3d/environments/${id}/LICENSES.md`),
      "3d/refined-v8/LICENSES.md",
    ].map((path) => asset + path), "/apps/web/public/vrm/LICENSES.md",
    "/tests/benchmarks/results/app-startup-perf.json", "/tests/benchmarks/results/i18n-fix.json"],
    "studio-foundation": [
      ...["production-v2", "living-world", "drawn-characters-v1", "ambient-audio", "npc-cast-v1", "npc-cast-v2", "npc-cast-v3", "npc-cast-v4", "characters-lpc-v1", "portraits-v1", "art-v4", "style-packs", "style-packs-v5", "living-town-v6", "imagegen25-v7", "experience-v8", "cinematic-v9", "world-v2", "office-cast-v2", "office-themes-v1"].map((id) => `${asset}virtual-studio/${id}/`),
      `${asset}virtual-studio/art-v4-manifest.json`, `${asset}studio/props/`,
      `${asset}virtual-studio/toon-office-v1/characters/`, `${asset}studio/illustration-20260926/`,
      `${asset}studio/bundle-renders-v1/`, `${asset}studio/bundle-scenes-v1/`, `${asset}virtual-studio/bundle-decor-v1/`,
      ...foundationInputs,
      ...routeVisualInputs,
      ...foundationDocumentInputs,
    ],
    "studio-editing": [],
    "studio-3d": [`${asset}3d/environments/authored-v1/`],
    "studio-character": ["Sendagaya_Shibu", "Sendagaya_Shino", "Sakurada_Fumiriya", "AliciaSolid", "Darkness_Shibu", "Jimmy", "Jennifer"].map((id) => `/apps/web/public/vrm/${id}.vrm`),
  };
  assert.equal(foundationInputs.length, 63);
  assert.equal(new Set(foundationInputs).size, 63);
  assert.ok(foundationInputs.every((path) => !path.endsWith("/")), "추가 입력은 개별 파일이어야 합니다.");
  assert.equal(routeVisualInputs.length, 14);
  assert.equal(new Set(routeVisualInputs).size, 14);
  assert.ok(routeVisualInputs.every((path) => path.endsWith("/background.png")), "페이지 시각 입력은 원본 PNG 개별 파일이어야 합니다.");
  const routeVisualSet = new Set(routeVisualInputs);
  const foundationDocumentSet = new Set(foundationDocumentInputs);
  assert.equal(foundationDocumentSet.size, 16);
  assert.ok(foundationDocumentInputs.every((path) => path.endsWith(".md") && !path.includes("*")), "문서 입력은 정확한 개별 Markdown 파일이어야 합니다.");
  assertTrackedDocumentInputs(foundationDocumentInputs, { cwd: repoRoot });
  assert.deepEqual(Object.values(owned).map((paths) => paths.filter((path) => !routeVisualSet.has(path) && !foundationDocumentSet.has(path)).length), [13, 90, 0, 1, 7]);
  assert.deepEqual(Object.values(owned).map((paths) => paths.length), [13, 120, 0, 1, 7]);
  const declarations = [...staticJob.matchAll(/\$\{\{ matrix\.shard == '([^']+)' && '([^']+)' \|\| '' \}\}/gu)];
  assert.match(staticJob, /persist-credentials: false/u);
  assert.match(staticJob, /sparse-checkout-cone-mode: false/u);
  const originalDeclarations = declarations.filter((match) => !routeVisualSet.has(match[2]) && !foundationDocumentSet.has(match[2]));
  const routeVisualDeclarations = declarations.filter((match) => routeVisualSet.has(match[2]));
  const foundationDocumentDeclarations = declarations.filter((match) => foundationDocumentSet.has(match[2]));
  assert.equal(originalDeclarations.length, 111, "기존 48개와 foundation 63개 선언을 정확히 보존해야 합니다.");
  assert.equal(new Set(originalDeclarations.map((match) => match[2])).size, 106, "기존 라이선스와 네 VRM의 shard 공유만 유지합니다.");
  assert.deepEqual(routeVisualDeclarations.map((match) => match[2]).sort(), [...routeVisualInputs].sort());
  assert.ok(routeVisualDeclarations.every((match) => match[1] === "studio-foundation"), "페이지 시각 입력은 foundation만 소유해야 합니다.");
  assert.deepEqual(foundationDocumentDeclarations.map((match) => match[2]).sort(), [...foundationDocumentInputs].sort());
  assert.ok(foundationDocumentDeclarations.every((match) => match[1] === "studio-foundation"), "추가 문서 선언은 foundation만 소유해야 합니다.");
  assert.equal(declarations.length, 141, "기존 111개와 원본 PNG 14개·문서 16개 선언을 정확히 보존해야 합니다.");
  assert.equal(new Set(declarations.map((match) => match[2])).size, 136, "새 PNG·문서는 기존 입력이나 다른 shard 선언과 중복하지 않습니다.");
  for (const [shard, paths] of Object.entries(owned)) {
    assert.deepEqual(declarations.filter((match) => match[1] === shard).map((match) => match[2]).sort(), [...paths].sort(), shard);
  }
  const root = mkdtempSync(join(tmpdir(), "core-shard-initial-checkout-"));
  const env = fixtureGitEnvironment(root);
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  const input = (path) => `${path.slice(1)}${path.endsWith("/") ? "fixture-payload.bin" : ""}`;
  const world = "apps/web/public/assets/virtual-studio/world/default-world.json";
  const unrelated = ["apps/web/public/assets/unrelated/large.glb", "apps/web/public/vrm/unrelated.vrm", "artifacts/unrelated.bin",
    "apps/web/public/assets/virtual-studio/studio-art-v11/unrelated-large.webp",
    "apps/web/public/assets/3d/environments/bundle-v1/unrelated-large.glb"];
  const unrelatedDocuments = ["docs/third-party/unrelated.md", "docs/adr/9999-unrelated.md", "docs/unrelated/large.bin"];
  try {
    git("init", "--quiet");
    for (const file of [world, ...Object.values(owned).flat().map(input), ...unrelated, ...unrelatedDocuments, "package.json"]) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), "fixture\n");
    }
    git("add", ".");
    git("-c", "user.name=CI Fixture", "-c", "user.email=ci@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
    git("config", "core.sparseCheckout", "true");
    git("config", "core.sparseCheckoutCone", "false");
    for (const shard of Object.keys(owned)) {
      writeFileSync(join(root, ".git/info/sparse-checkout"), `${sparsePatterns(staticJob, { shard }).join("\n")}\n`);
      git("read-tree", "-mu", "HEAD");
      assert.ok(existsSync(join(root, world)), `${shard}: 공통 메타데이터 누락`);
      for (const [owner, paths] of Object.entries(owned)) {
        for (const path of paths) {
          // 3D 팩 전체에 속한 라이선스는 기존 팩 복원에도 포함되던 공통 입력이다.
          const sharedPackLicense = shard === "studio-3d" && path === `${asset}3d/environments/authored-v1/LICENSES.md`;
          // product가 기존에 소유한 전체 문서는 foundation의 개별 입력 추가 뒤에도 유지한다.
          const sharedProductDocument = shard === "product" && foundationDocumentSet.has(path);
          const ownedByShard = owned[shard].includes(path);
          assert.equal(existsSync(join(root, input(path))), ownedByShard || sharedPackLicense || sharedProductDocument, `${shard}: ${owner} 입력 경계 ${path}`);
        }
      }
      for (const file of unrelated) assert.equal(existsSync(join(root, file)), false, `${shard}: 무관한 대형 자산 ${file}`);
      for (const file of unrelatedDocuments) assert.equal(existsSync(join(root, file)), shard === "product", `${shard}: 기존 product 외의 무관한 문서 ${file}`);
    }
    // preflight는 선언을 검사하고, 문서 본문 복원은 위의 실제 shard 행렬에서 검증한다.
    writeFileSync(join(root, ".git/info/sparse-checkout"), `${sparsePatterns(typecheckJob).join("\n")}\n`);
    git("read-tree", "-mu", "HEAD");
    for (const path of foundationDocumentInputs) {
      assert.equal(existsSync(join(root, path.slice(1))), false, `preflight에 불필요한 문서 본문: ${path}`);
      assertTrackedDocumentInputs([path], { cwd: root, env });
    }
    assert.throws(() => assertTrackedDocumentInputs(["/docs/adr/0003-one-primary-surface-owner-typo.md"], { cwd: root, env }), /foundation 문서 정본이 Git 추적 목록에 없습니다/u);
    const untracked = "docs/adr/untracked-foundation.md";
    mkdirSync(dirname(join(root, untracked)), { recursive: true });
    writeFileSync(join(root, untracked), "untracked fixture\n");
    assert.ok(existsSync(join(root, untracked)));
    assert.throws(() => assertTrackedDocumentInputs([`/${untracked}`], { cwd: root, env }), /foundation 문서 정본이 Git 추적 목록에 없습니다/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

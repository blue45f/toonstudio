import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CORE_CHECK_COUNT,
  MAX_CORE_SCORE,
  REPO_ROOT,
  WAVE8_BONUS_CHECK_COUNT,
  formatMasterChecklistText,
  parseCliArgs,
  runMasterChecklist,
} from "./verify-toonstudio-master-checklist.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, "verify-toonstudio-master-checklist.mjs");

function createOverlayRepoRoot(customize) {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "toonstudio-master-checklist-"));
  for (const topDir of ["apps", "config", "docs", "scripts"]) {
    symlinkSync(path.join(REPO_ROOT, topDir), path.join(tmpRoot, topDir), "dir");
  }
  customize(tmpRoot);
  return tmpRoot;
}

describe("verify-toonstudio-master-checklist CLI & scoring gate", () => {
  it("실제 저장소에서 20/20 핵심 항목 100/100점을 달성한다", () => {
    const report = runMasterChecklist({ repoRoot: REPO_ROOT });

    assert.equal(report.schema, "toonstudio.master-checklist/1");
    assert.equal(report.totalCoreCount, CORE_CHECK_COUNT);
    assert.equal(report.maxScore, MAX_CORE_SCORE);
    assert.equal(report.passedCoreCount, 20);
    assert.equal(report.score, 100);
    assert.equal(report.passed, true);
    assert.deepEqual(report.failedChecks, []);
    assert.equal(report.checks.length, 20);
    assert.equal(report.wave8Bonus.totalCount, WAVE8_BONUS_CHECK_COUNT);

    for (const check of report.checks) {
      assert.equal(check.passed, true, `expected pass for ${check.id}: ${check.missingReasons.join("; ")}`);
      assert.equal(check.earned, 5);
      assert.ok(check.evidence.length > 0);
    }

    const formatted = formatMasterChecklistText(report);
    assert.match(formatted, /PASS · 핵심 100\/100점 \(20\/20\)/);
    assert.match(formatted, /20\. \[PASS \+5\]/);
  });

  it("CLI --json 실행이 exit code 0과 100/100 JSON을 출력한다", () => {
    const proc = spawnSync(process.execPath, [SCRIPT_PATH, "--json"], {
      encoding: "utf8",
    });

    assert.equal(proc.status, 0, proc.stderr);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.score, 100);
    assert.equal(parsed.passedCount, 20);
    assert.equal(parsed.totalCount, 20);
    assert.equal(parsed.passed, true);
  });

  it("빈 디렉터리 대상 실행 시 미달 사유를 상세 출력하고 exit code 1로 실패한다", () => {
    const emptyDir = mkdtempSync(path.join(os.tmpdir(), "toonstudio-empty-check-"));
    try {
      const textProc = spawnSync(process.execPath, [SCRIPT_PATH, "--root", emptyDir], {
        encoding: "utf8",
      });
      assert.equal(textProc.status, 1);
      assert.match(textProc.stdout, /FAIL · 핵심 0\/100점 \(0\/20\)/);
      assert.match(textProc.stdout, /미달 사유:/);

      const jsonProc = spawnSync(process.execPath, [SCRIPT_PATH, "--root", emptyDir, "--json"], {
        encoding: "utf8",
      });
      assert.equal(jsonProc.status, 1);
      const parsed = JSON.parse(jsonProc.stdout);
      assert.equal(parsed.score, 0);
      assert.equal(parsed.passed, false);
      assert.equal(parsed.failedChecks.length, 20);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("단일 기준선 위반(lintStrictMaxWarnings > 1)을 95/100으로 정확히 검출한다", () => {
    const overlayRoot = createOverlayRepoRoot((tmpRoot) => {
      rmSync(path.join(tmpRoot, "config"));
      mkdirSync(path.join(tmpRoot, "config"), { recursive: true });
      const original = JSON.parse(
        readFileSync(path.join(REPO_ROOT, "config/architecture-source-ratchet.json"), "utf8"),
      );
      writeFileSync(
        path.join(tmpRoot, "config/architecture-source-ratchet.json"),
        JSON.stringify({ ...original, lintStrictMaxWarnings: 3 }, null, 2),
      );
    });

    try {
      const report = runMasterChecklist({ repoRoot: overlayRoot });
      assert.equal(report.score, 95);
      assert.equal(report.passedCoreCount, 19);
      assert.equal(report.passed, false);
      assert.equal(report.failedChecks.length, 1);
      assert.equal(report.failedChecks[0].id, "lint-warning-ratchet");
      assert.match(report.failedChecks[0].missingReasons[0], /3/);
    } finally {
      rmSync(overlayRoot, { recursive: true, force: true });
    }
  });

  it("--strict-wave8 모드에서 Track 1·Track 2·신규 9종 스프라이트가 모두 갖춰지면 23/23을 통과한다", () => {
    const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "toonstudio-strict-wave8-"));
    try {
      symlinkSync(path.join(REPO_ROOT, "config"), path.join(tmpRoot, "config"), "dir");
      symlinkSync(path.join(REPO_ROOT, "docs"), path.join(tmpRoot, "docs"), "dir");
      symlinkSync(path.join(REPO_ROOT, "scripts"), path.join(tmpRoot, "scripts"), "dir");

      // apps/web 하위 필요한 디렉터리만 복사하고 나머지는 심볼릭 링크로 구성
      mkdirSync(path.join(tmpRoot, "apps/web/public/assets/studio"), { recursive: true });
      cpSync(
        path.join(REPO_ROOT, "apps/web/public/assets/studio/vibrant-sprites"),
        path.join(tmpRoot, "apps/web/public/assets/studio/vibrant-sprites"),
        { recursive: true },
      );

      mkdirSync(path.join(tmpRoot, "apps/web/src/domains"), { recursive: true });
      for (const rel of ["app", "shared"]) {
        symlinkSync(
          path.join(REPO_ROOT, "apps/web/src", rel),
          path.join(tmpRoot, "apps/web/src", rel),
          "dir",
        );
      }
      for (const domain of ["catalog", "community", "legal", "market", "showcase"]) {
        symlinkSync(
          path.join(REPO_ROOT, "apps/web/src/domains", domain),
          path.join(tmpRoot, "apps/web/src/domains", domain),
          "dir",
        );
      }

      // marketing 도메인 오버레이 (Track 1)
      cpSync(
        path.join(REPO_ROOT, "apps/web/src/domains/marketing"),
        path.join(tmpRoot, "apps/web/src/domains/marketing"),
        { recursive: true },
      );
      mkdirSync(path.join(tmpRoot, "apps/web/src/domains/marketing/wow-showcase"), { recursive: true });
      writeFileSync(
        path.join(tmpRoot, "apps/web/src/domains/marketing/wow-showcase/HomeInteractiveWowShowcase.tsx"),
        "export function HomeInteractiveWowShowcase() { return null; }\n",
      );
      writeFileSync(
        path.join(tmpRoot, "apps/web/src/domains/marketing/wow-showcase/home-wow-showcase.css"),
        ".home-wow-showcase { opacity: 1; }\n",
      );
      writeFileSync(
        path.join(tmpRoot, "apps/web/src/domains/marketing/wow-showcase/HomeInteractiveWowShowcase.test.tsx"),
        "export {};\n",
      );
      const refDashPath = path.join(tmpRoot, "apps/web/src/domains/marketing/ReferenceCreatorDashboard.tsx");
      writeFileSync(refDashPath, `${readFileSync(refDashPath, "utf8")}\n// <HomeInteractiveWowShowcase />\n`);

      // creator 도메인 오버레이 (Track 2)
      mkdirSync(path.join(tmpRoot, "apps/web/src/domains/creator"), { recursive: true });
      const creatorDir = path.join(REPO_ROOT, "apps/web/src/domains/creator");
      const creatorEntries = [
        "StudioAppSettingsPanel.tsx",
        "StudioColorPopover.tsx",
        "StudioLeftToolRail.tsx",
        "StudioUnifiedAssetToolPopoverContentDirectDrag.tsx",
        "academy-and-roles",
        "ai",
        "ai-simple-setup",
        "ai-teammate-and-search",
        "bg3d",
        "canvas-chrome",
        "csp-brush-atelier",
        "deadline-meter",
        "ergonomics",
        "global-ost-premiere",
        "growth-ip",
        "ip-market-guide-hub",
        "multi-device-ecosystem",
        "nextgen-perf-engine",
        "offline",
        "precision-3d-craft",
        "production-hub",
        "publish",
        "render",
        "session-endurance",
        "smart-defaults-pm-ops",
        "studio-router",
        "studio-scale-and-3d-fit",
        "vibrant-studio-fx",
        "workspace",
      ];
      for (const entry of creatorEntries) {
        symlinkSync(
          path.join(creatorDir, entry),
          path.join(tmpRoot, "apps/web/src/domains/creator", entry),
        );
      }
      mkdirSync(path.join(tmpRoot, "apps/web/src/domains/creator/studio-shell/beginner-quickstart"), {
        recursive: true,
      });
      writeFileSync(
        path.join(tmpRoot, "apps/web/src/domains/creator/studio-shell/beginner-quickstart/BeginnerInstantComicWizard.tsx"),
        "export function BeginnerInstantComicWizard() { return null; }\n",
      );
      writeFileSync(
        path.join(tmpRoot, "apps/web/src/domains/creator/studio-shell/beginner-quickstart/beginner-instant-wizard.css"),
        ".beginner-wizard { opacity: 1; }\n",
      );
      writeFileSync(
        path.join(tmpRoot, "apps/web/src/domains/creator/studio-shell/beginner-quickstart/BeginnerInstantComicWizard.test.tsx"),
        "export {};\n",
      );
      writeFileSync(
        path.join(tmpRoot, "apps/web/src/domains/creator/studio-shell/CreateStartGrandAtelierSection.tsx"),
        "export function CreateStartGrandAtelierSection() { return '<BeginnerInstantComicWizard />'; }\n",
      );

      // Wave 8 신규 9종 WebP 스프라이트 더미 추가
      const wave8Sprites = [
        "wow-hero-atelier-stage.webp",
        "innov-neural-memory.webp",
        "innov-crossmedia-ip.webp",
        "innov-rights-ledger.webp",
        "innov-live-palette.webp",
        "beginner-1-story.webp",
        "beginner-2-pose.webp",
        "beginner-3-color.webp",
        "beginner-4-publish.webp",
      ];
      for (const sprite of wave8Sprites) {
        writeFileSync(
          path.join(tmpRoot, "apps/web/public/assets/studio/vibrant-sprites", sprite),
          Buffer.from("RIFF0000WEBPVP8 "),
        );
      }

      const report = runMasterChecklist({ repoRoot: tmpRoot, strictWave8: true });
      assert.equal(report.strictWave8, true);
      assert.equal(report.coreScore, 100);
      assert.equal(report.passedCoreCount, 20);
      assert.equal(report.wave8Bonus.passedCount, 3);
      assert.equal(report.passedCount, 23);
      assert.equal(report.totalCount, 23);
      assert.equal(report.passed, true);
      assert.deepEqual(report.failedChecks, []);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("parseCliArgs가 유효 옵션과 오류 옵션을 결정적으로 처리한다", () => {
    const parsed = parseCliArgs(["--json", "--strict-wave8", "--root", "."]);
    assert.equal(parsed.json, true);
    assert.equal(parsed.strictWave8, true);
    assert.equal(parsed.repoRoot, path.resolve("."));

    assert.throws(() => parseCliArgs(["--root"]), /경로를 지정/);
    assert.throws(() => parseCliArgs(["--nope"]), /알 수 없는 옵션/);

    const badProc = spawnSync(process.execPath, [SCRIPT_PATH, "--nope"], { encoding: "utf8" });
    assert.equal(badProc.status, 2);
  });
});

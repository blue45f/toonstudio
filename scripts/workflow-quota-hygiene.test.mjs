import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

const { describe, test } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");

const WORKFLOWS_DIR = fileURLToPath(new URL("../.github/workflows/", import.meta.url));
const WORKFLOW_FILES = readdirSync(WORKFLOWS_DIR)
  .filter((name) => /\.ya?ml$/u.test(name))
  .sort();

/** 릴리스 롤백 증적·서명 배포본으로 7일 초과 보관을 명시적으로 허용하는 워크플로와 최대 보관일 */
const RELEASE_RETENTION_ALLOWLIST = new Map([
  ["cloud-production-deploy.yml", 14],
  ["desktop-sync-release.yml", 30],
]);

/** 배포·마이그레이션·자산 업로드처럼 중간 취소를 금지해야 하는 워크플로 */
const NON_CANCELLING_WORKFLOWS = [
  "cloud-production-deploy.yml",
  "api-container-release.yml",
  "production-database-migrations.yml",
  "studio-asset-upload.yml",
  "studio-gpu-soak-repro.yml",
];

function loadWorkflow(name) {
  const source = readFileSync(`${WORKFLOWS_DIR}/${name}`, "utf8");
  return { name, source, parsed: parseYaml(source) };
}

function collectUploadArtifactSteps(parsed) {
  const uploads = [];
  for (const [jobId, job] of Object.entries(parsed?.jobs ?? {})) {
    for (const step of job?.steps ?? []) {
      if (typeof step?.uses === "string" && step.uses.startsWith("actions/upload-artifact@")) {
        uploads.push({
          jobId,
          stepName: step.name ?? "(unnamed)",
          with: step.with ?? {},
        });
      }
    }
  }
  return uploads;
}

describe("GitHub Actions 스토리지 쿼터·동시 실행 위생 정책", () => {
  test("모든 워크플로는 유효한 YAML이며 최상위 concurrency 그룹을 선언한다", () => {
    const missing = [];
    for (const name of WORKFLOW_FILES) {
      const { parsed } = loadWorkflow(name);
      const group = parsed?.concurrency?.group;
      if (typeof group !== "string" || group.trim() === "") {
        missing.push(name);
      }
    }
    assert.deepEqual(
      missing,
      [],
      `concurrency 누락 워크플로가 있습니다: ${missing.join(", ")}`,
    );
  });

  test("배포·마이그레이션·업로드·소크 보존 워크플로는 cancel-in-progress: false를 유지한다", () => {
    for (const name of NON_CANCELLING_WORKFLOWS) {
      if (!WORKFLOW_FILES.includes(name)) continue;
      const { parsed } = loadWorkflow(name);
      assert.equal(
        parsed?.concurrency?.["cancel-in-progress"],
        false,
        `${name}은 실행 중 취소를 막기 위해 cancel-in-progress: false여야 합니다`,
      );
    }
  });

  test("모든 actions/upload-artifact 단계는 기본 90일 누수를 막기 위해 retention-days를 명시한다", () => {
    const missing = [];
    for (const name of WORKFLOW_FILES) {
      const { parsed } = loadWorkflow(name);
      for (const upload of collectUploadArtifactSteps(parsed)) {
        const retention = Number(upload.with["retention-days"]);
        if (!Number.isInteger(retention) || retention < 1) {
          missing.push(`${name} (${upload.jobId} / ${upload.with.name ?? upload.stepName})`);
        }
      }
    }
    assert.deepEqual(
      missing,
      [],
      `retention-days 누락 아티팩트 업로드(기본 90일 보관 위험): ${missing.join(", ")}`,
    );
  });

  test("비릴리스 진단 아티팩트는 7일 이하, job 간 전달용 dist 번들은 1일로 제한한다", () => {
    const violations = [];
    for (const name of WORKFLOW_FILES) {
      const { parsed } = loadWorkflow(name);
      const maxAllowed = RELEASE_RETENTION_ALLOWLIST.get(name) ?? 7;
      for (const upload of collectUploadArtifactSteps(parsed)) {
        const retention = Number(upload.with["retention-days"]);
        const artifactName = String(upload.with.name ?? "");
        const artifactPath = String(upload.with.path ?? "").trim();
        if (retention > maxAllowed) {
          violations.push(
            `${name} (${artifactName}): retention-days=${retention} > ${maxAllowed}`,
          );
        }
        const isDistBundle = /^dist\/?$/u.test(artifactPath) || /-dist(?:-|$)/u.test(artifactName);
        if (isDistBundle && retention > 1) {
          violations.push(
            `${name} (${artifactName}): 전달용 dist 아티팩트는 1일 보관이어야 합니다 (현재 ${retention}일)`,
          );
        }
      }
    }
    assert.deepEqual(
      violations,
      [],
      `아티팩트 보관 기간 상한 초과:\n${violations.join("\n")}`,
    );
  });

  test("cloud-production-deploy.yml의 웹 빌드는 검증된 typecheck-shards 체크포인트 캐시를 읽기 전용으로 복원한다", () => {
    const { parsed } = loadWorkflow("cloud-production-deploy.yml");
    const steps = parsed?.jobs?.["cloudflare-web"]?.steps ?? [];
    const keyStep = steps.find((step) => step.id === "typecheck-shards-key");
    const restoreStep = steps.find(
      (step) =>
        typeof step?.uses === "string"
        && step.uses.startsWith("actions/cache/restore@")
        && step?.with?.path === "node_modules/.cache/typecheck-shards/report.json",
    );
    const buildStep = steps.find((step) => typeof step?.run === "string" && step.run.includes("pnpm run build"));

    assert.ok(keyStep, "typecheck-shards 캐시 키 계산 단계가 필요합니다");
    assert.match(String(keyStep.run), /core-typecheck-shards-v1-/u);
    assert.match(String(keyStep.run), /scripts\/typecheck-shards\.mjs --print-cache-key/u);
    assert.ok(restoreStep, "typecheck-shards 체크포인트 캐시 복원 단계가 필요합니다");
    assert.ok(buildStep, "웹 빌드 단계가 필요합니다");
    assert.ok(steps.indexOf(keyStep) < steps.indexOf(restoreStep));
    assert.ok(steps.indexOf(restoreStep) < steps.indexOf(buildStep));
  });
});

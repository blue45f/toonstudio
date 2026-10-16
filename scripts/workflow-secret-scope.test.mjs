import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const { describe, test } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");

const root = fileURLToPath(new URL("../", import.meta.url));

/**
 * 장기 시크릿(외부 API 키·이슈 트래커 토큰)을 잡 전체 env 에 두면 의존성 설치 스크립트,
 * 브라우저 설치, 빌드 같은 모든 단계의 프로세스가 값을 읽을 수 있다. 공급망 침해가 한 번이면
 * 키가 그대로 유출되므로, 값을 실제로 쓰는 단계의 env 에만 전달한다.
 * GITHUB_TOKEN 은 잡 권한(permissions)으로 따로 제한하므로 이 정책의 대상이 아니다.
 */
const SCOPED_SECRET_WORKFLOWS = [
  ".github/workflows/studio-hyper3d-live-acceptance-v2.yml",
  ".github/workflows/studio-soak-10h.yml",
];

/** 의존성·도구 설치처럼 외부 코드를 실행하는 단계. 시크릿이 보이면 안 된다. */
const INSTALL_STEP = /\b(pnpm\s+(install|i)\b|npm\s+(ci|install)\b|apt-get\s+install|playwright\s+install|pip\s+install)/u;

function secretNames(env) {
  const names = new Set();
  for (const value of Object.values(env ?? {})) {
    for (const match of String(value).matchAll(/\bsecrets\.([A-Za-z0-9_]+)/gu)) {
      if (match[1] !== "GITHUB_TOKEN") names.add(match[1]);
    }
  }
  return [...names].sort();
}

function loadJobs(relativePath) {
  const document = parse(readFileSync(`${root}${relativePath}`, "utf8"));
  return Object.entries(document.jobs ?? {});
}

describe("워크플로 시크릿 전달 범위", () => {
  for (const relativePath of SCOPED_SECRET_WORKFLOWS) {
    test(`${relativePath}: 잡 env 에 시크릿을 두지 않는다`, () => {
      const exposed = loadJobs(relativePath).flatMap(([jobId, job]) =>
        secretNames(job.env).map((name) => `${jobId}: ${name}`),
      );
      assert.deepEqual(
        exposed,
        [],
        "시크릿은 값을 쓰는 단계의 env 로만 전달해야 합니다(잡 env 는 모든 단계에 노출됩니다).",
      );
    });

    test(`${relativePath}: 설치·빌드 단계는 시크릿을 받지 않는다`, () => {
      const exposed = loadJobs(relativePath).flatMap(([jobId, job]) =>
        (job.steps ?? [])
          .filter((step) => INSTALL_STEP.test(String(step.run ?? "")))
          .flatMap((step) =>
            secretNames(step.env).map((name) => `${jobId} / ${step.name ?? step.run}: ${name}`),
          ),
      );
      assert.deepEqual(exposed, []);
    });

    test(`${relativePath}: 시크릿을 쓰는 단계가 최소 하나는 남아 있다`, () => {
      // 시크릿을 아예 지워서 통과하는 일을 막는다. 값은 쓰는 단계의 env 로 옮겨졌어야 한다.
      const consumers = loadJobs(relativePath).flatMap(([, job]) =>
        (job.steps ?? []).filter((step) => secretNames(step.env).length > 0),
      );
      assert.ok(consumers.length > 0, "시크릿을 받는 단계가 없습니다.");
    });
  }
});

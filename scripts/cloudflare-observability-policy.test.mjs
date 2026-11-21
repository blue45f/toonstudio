import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLOUDFLARE_OBSERVABILITY_CONFIG_PATHS,
  parseObservabilityWranglerJsonc,
  validateCloudflareObservabilityConfig,
  validateCloudflareObservabilityRepository,
} from "./cloudflare-observability-policy.mjs";
import { analyticsDeploymentConfig } from "./deploy-cloudflare-analytics.mjs";

const { afterEach, describe, test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const STATIC_CONFIG = "deploy/cloudflare-static/wrangler.jsonc";
const directories = [];

function fixture(sources = {}) {
  const root = mkdtempSync(join(tmpdir(), "toonstudio-observability-test-"));
  directories.push(root);
  const files = Object.fromEntries(CLOUDFLARE_OBSERVABILITY_CONFIG_PATHS.map((path) => [path, "{}"]));
  for (const [path, source] of Object.entries({ ...files, ...sources })) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
  return root;
}

function nested(path, value) {
  return path.split(".").reduceRight((child, key) => ({ [key]: child }), value);
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Cloudflare 저장소의 명시 관측 활성화 정책", () => {
  test("실제 Worker 설정과 두 Analytics 생성 경로는 새 opt-in 없이 통과한다", () => {
    assert.deepEqual(validateCloudflareObservabilityRepository(), []);
  });

  test("기본 저장소 루트는 호출 작업 디렉터리에 의존하지 않는다", () => {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", [
      `import { validateCloudflareObservabilityRepository } from ${JSON.stringify(new URL("./cloudflare-observability-policy.mjs", import.meta.url).href)};`,
      "const issues = validateCloudflareObservabilityRepository();",
      "if (issues.length) throw new Error(issues.join('\\n'));",
    ].join("\n")], { cwd: fixture(), encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
  });

  test("미선언·명시 비활성·관측과 무관한 enabled 필드를 혼동하지 않는다", () => {
    for (const config of [
      {},
      { keep_vars: true, vars: { EXAMPLE: "observability.enabled = true" } },
      { unrelated: { enabled: true, persist: true } },
      { observability: { enabled: false, traces: { enabled: false }, issues: { enabled: false } } },
      { observability: { enabled: true, logs: { enabled: false } } },
    ]) assert.deepEqual(validateCloudflareObservabilityConfig(config), []);
  });

  for (const path of ["enabled", "logs.enabled", "traces.enabled", "issues.enabled"]) {
    for (const environment of [false, true]) {
      test(`${environment ? "env.production" : "기본 설정"}의 ${path} 활성화를 차단한다`, () => {
        const scope = { observability: nested(path, true) };
        const config = environment ? { observability: { enabled: false }, env: { production: scope } } : scope;
        const issues = validateCloudflareObservabilityConfig(config, "fixture");
        assert.equal(issues.length, 1);
        assert.match(issues[0], new RegExp(`${environment ? "env\\.production\\." : ""}observability\\.${path.replaceAll(".", "\\.")}:`));
        assert.match(issues[0], /계정 요금제·공유 사용량·비용 근거/u);
      });
    }
  }

  test("Logs 별칭 false가 Traces와 Issues 활성화를 가리지 않는다", () => {
    const issues = validateCloudflareObservabilityConfig({
      observability: { enabled: false, logs: { enabled: true }, traces: { enabled: true }, issues: { enabled: true } },
    });
    assert.equal(issues.length, 3);
    for (const feature of ["logs", "traces", "issues"]) assert.ok(issues.some((issue) => issue.includes(`${feature}.enabled`)));
  });

  test("sampling 0과 persist false도 새 수집 활성화를 승인하지 않는다", () => {
    const issues = validateCloudflareObservabilityConfig({
      observability: { traces: { enabled: true, head_sampling_rate: 0, persist: false } },
    });
    assert.equal(issues.length, 1);
    assert.match(issues[0], /traces.enabled/u);
  });

  for (const feature of ["logs", "traces"]) {
    test(`${feature}의 미확인 수집 상태에서 persist true를 별도 검토한다`, () => {
      const issues = validateCloudflareObservabilityConfig({ observability: { [feature]: { persist: true } } });
      assert.equal(issues.length, 1);
      assert.ok(issues[0].includes(`${feature}.persist`));
      assert.match(issues[0], /수집 비활성이 확인되지 않은/u);
    });

    test(`${feature}가 명시 비활성일 때 persist true만으로 활성화로 판정하지 않는다`, () => {
      assert.deepEqual(validateCloudflareObservabilityConfig({
        observability: { [feature]: { enabled: false, persist: true } },
      }), []);
    });
  }

  test("Logs alias false는 logs persistence에만 적용한다", () => {
    assert.deepEqual(validateCloudflareObservabilityConfig({
      observability: { enabled: false, logs: { persist: true } },
    }), []);
    assert.equal(validateCloudflareObservabilityConfig({
      observability: { enabled: false, traces: { persist: true } },
    }).length, 1);
  });

  test("환경별 persistence와 정확한 진단 opt-in을 검사한다", () => {
    for (const scope of [
      { observability: { logs: { persist: true } } },
      { observability: { traces: { persist: true } } },
      { vars: { EDGE_ERROR_DIAGNOSTICS_ENABLED: "true" } },
    ]) {
      const issues = validateCloudflareObservabilityConfig({ env: { production: scope } });
      assert.equal(issues.length, 1);
      assert.match(issues[0], /env.production/u);
    }
    for (const value of [undefined, "false", "TRUE", " true", true, 1]) {
      assert.deepEqual(validateCloudflareObservabilityConfig({ vars: { EDGE_ERROR_DIAGNOSTICS_ENABLED: value } }), []);
    }
    assert.equal(validateCloudflareObservabilityConfig({ vars: { EDGE_ERROR_DIAGNOSTICS_ENABLED: "true" } }).length, 1);
  });

  test("잘못된 객체와 boolean을 활성화 없음으로 처리하지 않는다", () => {
    for (const config of [
      null, [], false,
      { observability: "false" },
      { observability: { logs: [] } },
      { observability: { enabled: "true" } },
      { observability: { traces: { enabled: 1 } } },
      { observability: { logs: { persist: "false" } } },
      { env: [] },
      { env: { production: null } },
    ]) assert.ok(validateCloudflareObservabilityConfig(config).length > 0);
  });
});

describe("Wrangler JSONC와 저장소 입력 검증", () => {
  test("공식 raw parser는 주석·끝 쉼표·URL과 이스케이프 문자열을 그대로 구분한다", () => {
    const raw = String.raw`{
      // "observability": { "enabled": true }
      "vars": { "EXAMPLE": "https://example.test/a/*comment*/?q=\\\"enabled\\\":true", },
      /* "EDGE_ERROR_DIAGNOSTICS_ENABLED": "true" */
      "observability": { "enabled": false, },
    }`;
    const config = parseObservabilityWranglerJsonc(raw);
    assert.equal(config.observability.enabled, false);
    assert.ok(config.vars.EXAMPLE.startsWith("https://example.test/"));
    assert.deepEqual(validateCloudflareObservabilityRepository(fixture({ [STATIC_CONFIG]: raw })), []);
  });

  for (const path of CLOUDFLARE_OBSERVABILITY_CONFIG_PATHS) {
    test(`${path}의 실제 JSONC 설정 변경을 탐지한다`, () => {
      const root = fixture({ [path]: JSON.stringify({ env: { production: { observability: { issues: { enabled: true } } } } }) });
      const issues = validateCloudflareObservabilityRepository(root);
      assert.equal(issues.length, 1);
      assert.ok(issues[0].startsWith(`${path}.env.production.observability.issues.enabled:`));
    });
  }

  test("JSONC 구문 오류·비객체·누락 파일은 설정 원문 없이 실패한다", () => {
    for (const source of ['{ "PRIVATE_FIXTURE": "sensitive-fixture",', "null", "[]"]) {
      const issues = validateCloudflareObservabilityRepository(fixture({ [STATIC_CONFIG]: source }));
      assert.equal(issues.length, 1);
      assert.match(issues[0], /JSONC 객체로 해석하지 못했습니다/u);
      assert.ok(!issues[0].includes("sensitive-fixture"));
    }
    const root = fixture();
    rmSync(join(root, STATIC_CONFIG));
    assert.equal(validateCloudflareObservabilityRepository(root).length, 1);
  });

  test("검사하는 경로가 설치된 공식 Wrangler 스키마의 boolean 필드에 해당한다", () => {
    const schema = JSON.parse(readFileSync(join(ROOT, "node_modules/wrangler/config-schema.json"), "utf8"));
    const properties = schema.definitions.Observability.properties;
    assert.equal(properties.enabled.type, "boolean");
    for (const feature of ["logs", "traces", "issues"]) {
      assert.equal(properties[feature].properties.enabled.type, "boolean");
      if (feature !== "issues") assert.equal(properties[feature].properties.persist.type, "boolean");
    }
  });
});

describe("Analytics 생성기 기본값 보존", () => {
  test("합성 입력으로 dry-run과 production을 모두 검사하고 실제 환경을 전달하지 않는다", () => {
    const modes = [];
    const analyticsConfigFactory = (environment, production, gitState) => {
      modes.push(production);
      assert.notEqual(environment, process.env);
      assert.equal(environment.CLOUDFLARE_API_TOKEN, undefined);
      return analyticsDeploymentConfig(environment, production, gitState);
    };
    assert.deepEqual(validateCloudflareObservabilityRepository(fixture(), { analyticsConfigFactory }), []);
    assert.deepEqual(modes, [false, true]);
  });

  test("기존 enabled false 제거와 production 전용 활성화도 실패한다", () => {
    const missing = validateCloudflareObservabilityRepository(fixture(), { analyticsConfigFactory: () => ({}) });
    assert.equal(missing.length, 2);
    assert.ok(missing.every((issue) => issue.includes("기존 false 기본값")));
    const analyticsConfigFactory = (environment, production, gitState) => {
      const config = analyticsDeploymentConfig(environment, production, gitState);
      if (production) config.observability.traces = { enabled: true };
      return config;
    };
    const issues = validateCloudflareObservabilityRepository(fixture(), { analyticsConfigFactory });
    assert.equal(issues.length, 1);
    assert.match(issues[0], /production.*traces.enabled/u);
  });

  test("Analytics의 별도 소스·환경 opt-in과 미확인 persistence도 차단한다", () => {
    for (const extra of [
      { logs: { enabled: true } },
      { traces: { enabled: true } },
      { issues: { enabled: true } },
      { traces: { persist: true } },
    ]) {
      const config = { observability: { enabled: false, ...extra } };
      assert.equal(validateCloudflareObservabilityConfig(config, "Analytics", { analytics: true }).length, 1);
    }
    const config = { observability: { enabled: false }, env: { review: { observability: { enabled: true } } } };
    assert.equal(validateCloudflareObservabilityConfig(config, "Analytics", { analytics: true }).length, 1);
  });

  test("생성기 실패 원문에 들어 있는 값은 결과에 노출하지 않는다", () => {
    const analyticsConfigFactory = () => { throw new Error("sensitive-fixture"); };
    const issues = validateCloudflareObservabilityRepository(fixture(), { analyticsConfigFactory });
    assert.equal(issues.length, 2);
    assert.ok(issues.every((issue) => issue.includes("설정 생성 검사를 완료하지 못했습니다")));
    assert.ok(issues.every((issue) => !issue.includes("sensitive-fixture")));
  });
});

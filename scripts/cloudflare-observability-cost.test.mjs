import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeCost, createTemplate, exitCodeFor } from "./cloudflare-observability-cost.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");
const SCRIPT = fileURLToPath(new URL("./cloudflare-observability-cost.mjs", import.meta.url));
const day = (index) => `2026-12-${String(index + 1).padStart(2, "0")}`;

function paid({ ingestion = 30, storage = 7, days = 30 } = {}) {
  const input = createTemplate("paid");
  input.pricing = { model: "standard-2026-12-01", confirmed: true, ingestionAllowanceGB: 50, storageAllowanceGBMonth: 10 };
  input.evidence = { confirmed: true, capturedAt: "2027-01-02T10:00:00+09:00", scope: "account", includesOtherProjects: true, includesExistingStoredData: true, singleBillingCycle: true, dailyUsageComplete: true };
  input.period = { startDate: day(0), endDate: day(days - 1), throughDate: day(days - 1), state: "observed_complete" };
  input.usage = { ingestionGB: ingestion, dailyStorage: Array.from({ length: days }, (_, index) => ({ date: day(index), maxQueryableGB: storage })), dailyIngestion: [] };
  return input;
}
function free(values) {
  const input = paid({ days: values.length });
  input.plan = "free";
  input.pricing.ingestionAllowanceGB = 0.5;
  input.pricing.storageAllowanceGBMonth = null;
  input.evidence.includesExistingStoredData = null;
  input.usage = { ingestionGB: null, dailyStorage: [], dailyIngestion: values.map((value, index) => ({ date: day(index), ingestionGB: value })) };
  return input;
}
function assertBlocked(input, status = "needs_evidence") {
  const result = analyzeCost(input);
  assert.equal(result.status, status);
  assert.equal(result.additionalUsd, null);
  assert.equal(result.additionalChargeIsZero, null);
  assert.equal(result.invoiceFinal, false);
  assert.equal(exitCodeFor(result), 2);
}

describe("Cloudflare 관측 비용의 근거와 과금 경계", () => {
  it("미확인 템플릿을 무료 또는 사용량 0으로 처리하지 않는다", () => {
    for (const plan of ["paid", "free"]) {
      const template = createTemplate(plan);
      assert.equal(template.usage.ingestionGB, null);
      assert.equal(template.pricing.ingestionAllowanceGB, null);
      assertBlocked(template);
    }
    assert.throws(() => createTemplate("enterprise"));
  });

  for (const [name, mutate] of [
    ["플랜", (input) => { input.plan = "unknown"; }],
    ["요금 적용", (input) => { input.pricing.confirmed = false; }],
    ["요금 모델", (input) => { input.pricing.model = "unverified"; }],
    ["계정 전체 범위", (input) => { input.evidence.scope = "worker"; }],
    ["다른 프로젝트", (input) => { input.evidence.includesOtherProjects = null; }],
    ["기존 저장분", (input) => { input.evidence.includesExistingStoredData = false; }],
    ["단일 청구 주기", (input) => { input.evidence.singleBillingCycle = null; }],
    ["일별 완전성", (input) => { input.evidence.dailyUsageComplete = false; }],
    ["수집량", (input) => { input.usage.ingestionGB = null; }],
    ["실제 수집 포함량", (input) => { input.pricing.ingestionAllowanceGB = undefined; }],
    ["실제 저장 포함량", (input) => { input.pricing.storageAllowanceGBMonth = null; }],
    ["확보 시각", (input) => { input.evidence.capturedAt = null; }],
  ]) {
    it(`${name} 미확인 시 판정을 보류한다`, () => {
      const input = paid();
      mutate(input);
      assertBlocked(input);
    });
  }

  it("지원하지 않는 계약 플랜을 Paid로 추정하지 않는다", () => {
    const input = paid();
    input.plan = "enterprise";
    assertBlocked(input, "unsupported_plan");
  });

  it("수집과 저장이 정확히 포함량과 같으면 초과료 0이다", () => {
    const result = analyzeCost(paid({ ingestion: 50, storage: 10 }));
    assert.equal(result.status, "observed_within_allowance");
    assert.equal(result.additionalChargeIsZero, true);
    assert.equal(result.additionalUsd, 0);
    assert.equal(result.invoiceFinal, false);
    assert.equal(exitCodeFor(result), 0);
  });

  it("수집 50GB 안이어도 저장 초과료를 계산한다", () => {
    const result = analyzeCost(paid({ ingestion: 45, storage: 10.5 }));
    assert.equal(result.status, "observed_overage");
    assert.equal(result.ingestionAdditionalUsd, 0);
    assert.equal(result.storageAdditionalUsd, 0.05);
    assert.equal(result.additionalUsdExact, "1/20");
    assert.equal(exitCodeFor(result), 1);
  });

  it("수집 중단 후 기존 저장분 비용과 두 종류 초과료를 계산한다", () => {
    assert.equal(analyzeCost(paid({ ingestion: 0, storage: 12 })).additionalUsd, 0.2);
    assert.equal(analyzeCost(paid({ ingestion: 75, storage: 17.5 })).additionalUsd, 7);
  });

  it("31일 자료도 저장 합계의 분모는 30이다", () => {
    const result = analyzeCost(paid({ ingestion: 50, storage: 10, days: 31 }));
    assert.equal(result.storageGBMonthExact, "31/3");
    assert.equal(result.additionalUsdExact, "1/30");
    assert.equal(result.status, "observed_overage");
  });

  it("소수 합산의 오차로 경계의 0원을 초과료로 바꾸지 않는다", () => {
    const input = paid({ ingestion: 0, storage: 0.1 });
    input.pricing.storageAllowanceGBMonth = 0.1;
    assert.equal(analyzeCost(input).additionalChargeIsZero, true);
  });

  it("실제 부분 기간 포함량과 0 포함량을 명시값 그대로 사용한다", () => {
    const input = paid({ ingestion: 2, storage: 3.6, days: 1 });
    input.pricing.ingestionAllowanceGB = 1;
    input.pricing.storageAllowanceGBMonth = 0.1;
    assert.equal(analyzeCost(input).additionalUsd, 0.252);
    input.pricing.ingestionAllowanceGB = 0;
    assert.equal(analyzeCost(input).additionalUsd, 0.502);
  });

  it("소액을 반올림하여 0원으로 판정하거나 출력하지 않는다", () => {
    const input = paid({ ingestion: 0.000000001, storage: 0, days: 1 });
    input.pricing.ingestionAllowanceGB = 0;
    const result = analyzeCost(input);
    assert.equal(result.additionalUsd, 0.00000000025);
    assert.equal(result.additionalUsdExact, "1/4000000000");
    assert.equal(result.additionalChargeIsZero, false);
    input.usage.ingestionGB = Number.MIN_VALUE;
    const tiny = analyzeCost(input);
    assert.equal(tiny.status, "observed_overage");
    assert.equal(tiny.additionalUsd, null);
    assert.notEqual(tiny.additionalUsdExact, "0");
    assert.equal(tiny.additionalChargeIsZero, false);
  });

  it("진행 중·관측 완료·예상 구간을 구별하고 어느 결과도 최종 청구로 표시하지 않는다", () => {
    const input = paid({ days: 1 });
    input.period.state = "in_progress";
    input.period.endDate = day(30);
    const current = analyzeCost(input);
    assert.equal(current.status, "observed_within_allowance");
    assert.equal(current.periodState, "in_progress");
    assert.match(current.notes.join(" "), /남은 기간의 비용은 예측하지/u);
    input.period.state = "forecast";
    assertBlocked(input, "invalid_input");
    input.period.endDate = day(0);
    const forecast = analyzeCost(input);
    assert.equal(forecast.status, "forecast_within_allowance");
    assert.equal(forecast.invoiceFinal, false);
    input.usage.ingestionGB = 60;
    assert.equal(analyzeCost(input).status, "forecast_overage");
  });

  it("기존 비용이 없거나 기간·범위가 다르면 증감을 0으로 대체하지 않는다", () => {
    const input = paid({ ingestion: 75, storage: 17.5 });
    assert.equal(analyzeCost(input).deltaUsd, null);
    input.comparison = { oldAdditionalUsd: 8, sameScopeAndPeriod: false };
    assert.equal(analyzeCost(input).deltaUsd, null);
    input.comparison.sameScopeAndPeriod = true;
    const result = analyzeCost(input);
    assert.equal(result.deltaUsd, -1);
    assert.equal(result.additionalUsd, 7);
    assert.equal(result.additionalChargeIsZero, false);
  });

  it("미래 날짜의 실측과 당일 미완결 자료의 관측 완료를 거부한다", () => {
    const input = paid();
    input.evidence.capturedAt = "2026-11-21T21:00:00+09:00";
    assertBlocked(input, "invalid_input");
    input.period.state = "in_progress";
    assertBlocked(input, "invalid_input");
    input.period.state = "forecast";
    assert.equal(analyzeCost(input).status, "forecast_within_allowance");
    input.evidence.capturedAt = "2026-12-30T21:00:00+09:00";
    input.period.state = "observed_complete";
    assertBlocked(input, "invalid_input");
    input.period.state = "in_progress";
    assert.equal(analyzeCost(input).status, "observed_within_allowance");
  });
});

describe("Free는 UTC 일별 한도와 로그 수집 위험을 구분", () => {
  it("도달 미만은 0원, 정확히 도달한 날부터 수집 중단 위험을 표시한다", () => {
    assert.equal(analyzeCost(free([0.49, 0.49])).status, "observed_within_allowance");
    const result = analyzeCost(free([0.1, 0.5]));
    assert.equal(result.status, "free_cap_reached");
    assert.deepEqual(result.freeCapDates, [day(1)]);
    assert.equal(result.additionalChargeIsZero, true);
    assert.equal(result.additionalUsd, 0);
    assert.equal(exitCodeFor(result), 1);
  });

  it("낮은 월평균으로 피크일의 위험을 상계하지 않는다", () => {
    const input = free([0.8, 0, 0, 0]);
    input.period.state = "forecast";
    const result = analyzeCost(input);
    assert.equal(result.status, "free_cap_reached");
    assert.equal(result.periodState, "forecast");
    assert.deepEqual(result.freeCapDates, [day(0)]);
  });

  it("일별 값을 생략하거나 합계만 주면 0원으로 판정하지 않는다", () => {
    const input = free([0.2, 0.3]);
    input.usage.ingestionGB = 0.5;
    assert.equal(analyzeCost(input).additionalUsd, 0);
    input.usage.ingestionGB = 0.6;
    assertBlocked(input, "invalid_input");
    input.usage.dailyIngestion = [];
    assertBlocked(input, "invalid_input");
  });

  it("Free 관측 완료는 확보 시각의 UTC 일자에서 하루가 끝났는지 확인한다", () => {
    const input = free([0.1]);
    input.evidence.capturedAt = "2026-12-02T00:30:00+09:00";
    assertBlocked(input, "invalid_input");
    input.evidence.capturedAt = "2026-12-02T09:00:00+09:00";
    assert.equal(analyzeCost(input).status, "observed_within_allowance");
  });
});

describe("일별 누락과 잘못된 입력은 안전하게 거부", () => {
  it("빠진 날과 미확인 저장량을 0으로 보충하지 않는다", () => {
    const input = paid();
    input.usage.dailyStorage.splice(2, 1);
    assertBlocked(input);
    const unknown = paid();
    unknown.usage.dailyStorage[0].maxQueryableGB = null;
    assertBlocked(unknown);
  });

  for (const [name, mutate] of [
    ["중복 날짜", (input) => { input.usage.dailyStorage[1].date = day(0); }],
    ["범위 밖 날짜", (input) => { input.usage.dailyStorage[0].date = "2027-01-01"; }],
    ["실재하지 않는 날짜", (input) => { input.period.startDate = "2026-12-32"; }],
    ["윤년이 아닌 2월 29일", (input) => { input.period.startDate = "2027-02-29"; }],
    ["이전 요금 기간", (input) => { input.period.startDate = "2026-11-30"; }],
    ["역순 기간", (input) => { input.period.endDate = "2026-12-01"; }],
    ["지나치게 긴 기간", (input) => { input.period.endDate = "9999-12-31"; }],
    ["시간대 없는 확보 시각", (input) => { input.evidence.capturedAt = "2027-01-01T10:00:00"; }],
    ["잘못된 확보 날짜", (input) => { input.evidence.capturedAt = "2027-02-30T10:00:00Z"; }],
    ["문자열 수치", (input) => { input.usage.ingestionGB = "0"; }],
    ["음수 수치", (input) => { input.usage.dailyStorage[0].maxQueryableGB = -1; }],
    ["NaN 수치", (input) => { input.usage.ingestionGB = Number.NaN; }],
    ["무한 수치", (input) => { input.usage.ingestionGB = Infinity; }],
    ["문자열 확인 표시", (input) => { input.evidence.confirmed = "true"; }],
    ["알 수 없는 입력 항목", (input) => { input.unrecognized = "fixture-only-marker"; }],
  ]) {
    it(`${name} 거부`, () => {
      const input = paid();
      mutate(input);
      assertBlocked(input, "invalid_input");
    });
  }

  it("일별 배열의 크기를 검사하고 입력 객체를 수정하지 않는다", () => {
    const input = paid();
    const before = JSON.stringify(input);
    analyzeCost(input);
    assert.equal(JSON.stringify(input), before);
    input.usage.dailyStorage = Array.from({ length: 367 }, () => ({ date: day(0), maxQueryableGB: 0 }));
    assertBlocked(input, "invalid_input");
  });
});

describe("오프라인 CLI와 출력 정보 보호", () => {
  function inTemp(run) {
    const directory = mkdtempSync(join(tmpdir(), "toonstudio-observability-cost-"));
    try { run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
  }
  const invoke = (args, cwd) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", cwd });

  it("다른 호출 위치에서 읽고 입력 파일을 그대로 유지한다", () => inTemp((directory) => {
    const path = join(directory, "usage.json");
    const content = JSON.stringify(paid());
    writeFileSync(path, content);
    const execution = invoke(["--input", "usage.json", "--json"], directory);
    assert.equal(execution.status, 0, execution.stderr);
    const result = JSON.parse(execution.stdout);
    assert.equal(result.status, "observed_within_allowance");
    assert.equal(result.invoiceFinal, false);
    assert.equal(readFileSync(path, "utf8"), content);
  }));

  it("템플릿·도움말·위험·미확인의 종료 코드를 제공한다", () => inTemp((directory) => {
    assert.equal(invoke(["--help"], directory).status, 0);
    const template = invoke(["--template", "free"], directory);
    assert.equal(template.status, 0);
    assert.equal(JSON.parse(template.stdout).usage.ingestionGB, null);
    const path = join(directory, "usage.json");
    writeFileSync(path, JSON.stringify(paid({ ingestion: 60 })));
    assert.equal(invoke(["--input", path, "--json"], directory).status, 1);
    writeFileSync(path, JSON.stringify(createTemplate("paid")));
    assert.equal(invoke(["--input", path, "--json"], directory).status, 2);
    assert.equal(invoke(["--input", path, "--template", "paid"], directory).status, 2);
  }));

  it("잘못된 JSON·파일명·알 수 없는 값·인자를 원문 출력하지 않는다", () => inTemp((directory) => {
    const marker = "fixture-private-content-marker";
    const path = join(directory, `${marker}.json`);
    for (const content of [`{${marker}`, JSON.stringify({ ...paid(), extra: marker })]) {
      writeFileSync(path, content);
      const execution = invoke(["--input", path, "--json"], directory);
      assert.equal(execution.status, 2);
      assert.ok(!(execution.stdout + execution.stderr).includes(marker));
    }
    const missing = invoke(["--input", join(directory, `${marker}-missing`), "--json"], directory);
    assert.equal(missing.status, 2);
    assert.ok(!(missing.stdout + missing.stderr).includes(marker));
    const argument = invoke([`--${marker}`], directory);
    assert.equal(argument.status, 2);
    assert.ok(!(argument.stdout + argument.stderr).includes(marker));
  }));

  it("큰 파일을 계산하지 않고 안전한 오류를 반환한다", () => inTemp((directory) => {
    const path = join(directory, "oversized.json");
    writeFileSync(path, " ".repeat(1_048_577));
    const execution = invoke(["--input", path, "--json"], directory);
    assert.equal(execution.status, 2);
    assert.equal(JSON.parse(execution.stderr).status, "invalid_input");
  }));
});

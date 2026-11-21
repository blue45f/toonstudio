#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = "standard-2026-12-01";
const MAX_DAYS = 366;
const DAY_MS = 86_400_000;
const NOTES = [
  "확인 표시는 입력자의 진술이며, 이 도구는 실제 계정·배포 설정을 조회하거나 변경하지 않습니다.",
  "결과는 Observability 추가 사용료 계산이며 최종 청구액이 아닙니다. 기본료·다른 서비스·세금·환율·크레딧은 포함하지 않습니다.",
  "period는 새 요금이 적용되는 계산 구간입니다. 전환 시각·부분일·실제 포함량은 공급자 근거로 확인하며 청구 주기 전체로 자동 해석하지 않습니다.",
  "Paid의 capturedAt은 공급자의 일별 집계와 같은 시간대·오프셋으로 입력하세요. Free의 날짜 경계는 UTC를 사용합니다.",
  "Paid는 한 번에 하나의 실제 청구 주기 안의 새 요금 적용 구간만 입력합니다. 사용량·포함량을 주기 간 합산하거나 이월하지 않습니다.",
];
const HELP = `사용법:
  node scripts/cloudflare-observability-cost.mjs --template paid|free
  node scripts/cloudflare-observability-cost.mjs --input <검증한 JSON> [--json]
네트워크·계정 변경 없이 집계값만 읽습니다. 계정 ID·자격증명·원문 로그를 입력하지 마세요.
종료 코드: 0=입력 범위 내 포함량, 1=초과 또는 Free 수집 중단 위험, 2=입력 오류·근거 부족.
부분 기간과 예상 결과는 남은 기간의 0원 또는 최종 청구를 보장하지 않습니다.`;

export function createTemplate(plan) {
  if (plan !== "paid" && plan !== "free") throw new Error("템플릿은 paid 또는 free를 지정하세요.");
  return {
    schemaVersion: 1,
    plan,
    pricing: { model: "unverified", confirmed: false, ingestionAllowanceGB: null, storageAllowanceGBMonth: null },
    evidence: { confirmed: false, capturedAt: null, scope: "unverified", includesOtherProjects: null, includesExistingStoredData: null, singleBillingCycle: null, dailyUsageComplete: null },
    period: { startDate: null, endDate: null, throughDate: null, state: "unverified" },
    usage: { ingestionGB: null, dailyStorage: [], dailyIngestion: [] },
    comparison: { oldAdditionalUsd: null, sameScopeAndPeriod: false },
  };
}

// 입력의 십진 표현을 분수로 계산해 금액 반올림과 일별 합산 오차가 0원 판정을 바꾸지 않게 한다.
function fraction(numerator, denominator = 1n) {
  let a = numerator < 0n ? -numerator : numerator;
  let b = denominator;
  while (b) [a, b] = [b, a % b];
  return { n: numerator / a, d: denominator / a };
}
function decimal(value) {
  const [coefficient, exponent = "0"] = String(value).split("e");
  const [whole, digits = ""] = coefficient.split(".");
  const power = Number(exponent) - digits.length;
  const n = BigInt(whole + digits);
  return power >= 0 ? fraction(n * 10n ** BigInt(power)) : fraction(n, 10n ** BigInt(-power));
}
const ZERO = fraction(0n);
const add = (a, b) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const subtract = (a, b) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
const divide = (a, divisor) => fraction(a.n, a.d * divisor);
const positive = (a) => a.n > 0n ? a : ZERO;
const exact = (a) => a.d === 1n ? String(a.n) : `${a.n}/${a.d}`;
function approximate(a) {
  const n = Number(a.n);
  const d = Number(a.d);
  const value = n / d;
  // 표현할 수 없는 극소 양수를 0으로 반환하지 않고 exact 분수를 남긴다.
  return Number.isFinite(value) && !(value === 0 && a.n !== 0n) ? value : null;
}

function dateValue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? stamp : null;
}
function timestampValid(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/u.test(value)
    && dateValue(value.slice(0, 10)) !== null
    && !/[+-]14:(?!00)/u.test(value)
    && Number.isFinite(Date.parse(value));
}

export function analyzeCost(input) {
  const errors = [];
  const missing = [];
  const result = {
    schemaVersion: 1, status: "needs_evidence", periodState: null, invoiceFinal: false,
    additionalChargeIsZero: null, ingestionGB: null, storageGBMonth: null, storageGBMonthExact: null,
    ingestionAdditionalUsd: null, storageAdditionalUsd: null, additionalUsd: null, additionalUsdExact: null,
    deltaUsd: null, deltaUsdExact: null, freeCapDates: [], errors, missingEvidence: missing, notes: [...NOTES],
  };
  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  function object(value, fields, path, optional = false) {
    if (value === null || value === undefined) {
      if (!optional) missing.push(`${path}: 필수 정보가 미확인입니다.`);
      return {};
    }
    if (!isObject(value)) { errors.push(`${path}: 객체가 필요합니다.`); return {}; }
    if (Object.keys(value).some((key) => !fields.includes(key))) errors.push(`${path}: 지원하지 않는 항목이 있습니다. 템플릿의 항목명을 확인하세요.`);
    return value;
  }
  function amount(value, path, required = true) {
    if (value === undefined || value === null) { if (required) missing.push(`${path}: 수치가 미확인입니다.`); return null; }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
      errors.push(`${path}: 유한한 0 이상의 수가 필요합니다.`); return null;
    }
    return decimal(value);
  }
  function confirmed(value, path, required = true) {
    if (value !== undefined && value !== null && typeof value !== "boolean") errors.push(`${path}: true/false가 필요합니다.`);
    else if (required && value !== true) missing.push(`${path}: 확인이 필요합니다.`);
  }
  function date(value, path) {
    if (value === null || value === undefined) { missing.push(`${path}: 날짜가 미확인입니다.`); return null; }
    const stamp = dateValue(value);
    if (stamp === null) errors.push(`${path}: 실재하는 YYYY-MM-DD 날짜가 필요합니다.`);
    return stamp;
  }
  const root = object(input, ["schemaVersion", "plan", "pricing", "evidence", "period", "usage", "comparison"], "input");
  if (root.schemaVersion !== 1) errors.push("schemaVersion: 1 템플릿을 사용하세요.");
  const plan = root.plan;
  const unsupported = plan !== undefined && plan !== null && !["paid", "free", "unknown"].includes(plan);
  if (!["paid", "free"].includes(plan)) missing.push("plan: Observability Free/Paid 적용 상태를 확인하세요.");
  const pricing = object(root.pricing, ["model", "confirmed", "ingestionAllowanceGB", "storageAllowanceGBMonth"], "pricing");
  const evidence = object(root.evidence, ["confirmed", "capturedAt", "scope", "includesOtherProjects", "includesExistingStoredData", "singleBillingCycle", "dailyUsageComplete"], "evidence");
  const period = object(root.period, ["startDate", "endDate", "throughDate", "state"], "period");
  const usage = object(root.usage, ["ingestionGB", "dailyStorage", "dailyIngestion"], "usage");
  const comparison = object(root.comparison, ["oldAdditionalUsd", "sameScopeAndPeriod"], "comparison", true);
  if (pricing.model !== MODEL) missing.push("pricing.model: standard-2026-12-01 적용을 확인하세요.");
  confirmed(pricing.confirmed, "pricing.confirmed");
  confirmed(evidence.confirmed, "evidence.confirmed");
  confirmed(evidence.includesOtherProjects, "evidence.includesOtherProjects");
  confirmed(evidence.includesExistingStoredData, "evidence.includesExistingStoredData", plan === "paid");
  confirmed(evidence.singleBillingCycle, "evidence.singleBillingCycle", plan === "paid");
  confirmed(evidence.dailyUsageComplete, "evidence.dailyUsageComplete");
  if (evidence.scope !== "account") missing.push("evidence.scope: 다른 프로젝트를 포함한 계정 전체 집계가 필요합니다.");
  if (evidence.capturedAt === null || evidence.capturedAt === undefined) missing.push("evidence.capturedAt: 시간대가 포함된 확보 시각이 필요합니다.");
  else if (!timestampValid(evidence.capturedAt)) errors.push("evidence.capturedAt: 시간대가 포함된 유효한 ISO 시각이 필요합니다.");
  const start = date(period.startDate, "period.startDate");
  const end = date(period.endDate, "period.endDate");
  const through = date(period.throughDate, "period.throughDate");
  const state = period.state;
  if (["in_progress", "observed_complete", "forecast"].includes(state)) result.periodState = state;
  else missing.push("period.state: 관측 진행 중·관측 완료·예상을 구분해야 합니다.");
  let days = null;
  if (start !== null && end !== null && through !== null) {
    if (start < dateValue("2026-12-01")) errors.push("period.startDate: 새 요금 적용 전 기간은 계산할 수 없습니다.");
    if (end < start || through < start || through > end) errors.push("period: 날짜 순서 또는 대상 범위가 잘못되었습니다.");
    else if ((end - start) / DAY_MS + 1 > MAX_DAYS) errors.push("period: 계산 범위는 최대 366일입니다.");
    else days = Array.from({ length: (through - start) / DAY_MS + 1 }, (_, i) => new Date(start + i * DAY_MS).toISOString().slice(0, 10));
    if (["observed_complete", "forecast"].includes(state) && through !== end) errors.push("period.throughDate: 관측 완료·예상은 대상 종료일까지의 데이터가 필요합니다.");
  }
  if (state !== "forecast" && through !== null && timestampValid(evidence.capturedAt)) {
    const capturedDate = plan === "free"
      ? new Date(evidence.capturedAt).toISOString().slice(0, 10)
      : evidence.capturedAt.slice(0, 10);
    const capturedDay = dateValue(capturedDate);
    if (through > capturedDay) errors.push("period.throughDate: 확보 시각 이후의 미래 날짜를 실측으로 표시할 수 없습니다.");
    else if (state === "observed_complete" && through === capturedDay) errors.push("period.state: 당일 최대량이 확정되기 전에는 관측 완료로 표시할 수 없습니다. in_progress를 사용하세요.");
  }
  function daily(value, field, path, required) {
    if (value === undefined || value === null) { if (required) missing.push(`${path}: 일별 데이터가 필요합니다.`); return null; }
    if (!Array.isArray(value) || value.length > MAX_DAYS) { errors.push(`${path}: 최대 366개의 일별 배열이 필요합니다.`); return null; }
    if (!required && value.length === 0) return null;
    const seen = new Set();
    const values = [];
    for (const [index, row] of value.entries()) {
      const prefix = `${path}[${index}]`;
      const entry = object(row, ["date", field], prefix);
      const stamp = date(entry.date, `${prefix}.date`);
      const numeric = amount(entry[field], `${prefix}.${field}`);
      if (stamp !== null) {
        if (seen.has(entry.date)) errors.push(`${path}: 같은 날짜가 중복되었습니다.`);
        seen.add(entry.date);
        if (days && !days.includes(entry.date)) errors.push(`${path}: 집계 범위 밖 날짜가 있습니다.`);
      }
      if (stamp !== null && numeric !== null) values.push({ date: entry.date, value: numeric });
    }
    if (days && days.some((day) => !seen.has(day))) missing.push(`${path}: 대상 기간에 빠진 날짜가 있습니다. 0으로 보충하지 않습니다.`);
    if (required && value.length === 0) missing.push(`${path}: 일별 데이터가 미확인입니다.`);
    return values;
  }
  const ingestion = amount(usage.ingestionGB, "usage.ingestionGB", plan === "paid");
  const storageDays = daily(usage.dailyStorage, "maxQueryableGB", "usage.dailyStorage", plan === "paid");
  const ingestionDays = daily(usage.dailyIngestion, "ingestionGB", "usage.dailyIngestion", plan === "free");
  const dailyTotal = ingestionDays?.reduce((sum, row) => add(sum, row.value), ZERO) ?? null;
  if (ingestion && dailyTotal && subtract(ingestion, dailyTotal).n !== 0n) errors.push("usage.ingestionGB: 일별 수집량 합계와 일치하지 않습니다.");
  const ingestionAllowance = amount(pricing.ingestionAllowanceGB, "pricing.ingestionAllowanceGB");
  const storageAllowance = amount(pricing.storageAllowanceGBMonth, "pricing.storageAllowanceGBMonth", plan === "paid");
  if (plan === "free" && ingestionAllowance && subtract(ingestionAllowance, decimal(0.5)).n !== 0n) errors.push("pricing.ingestionAllowanceGB: 지원하는 표준 Free의 일일 한도는 0.5GB입니다.");
  if (plan === "free" && storageAllowance !== null) errors.push("pricing.storageAllowanceGBMonth: Free의 저장량은 종량 과금 대상이 아니므로 null로 지정하세요.");
  const oldCost = amount(comparison.oldAdditionalUsd, "comparison.oldAdditionalUsd", false);
  confirmed(comparison.sameScopeAndPeriod, "comparison.sameScopeAndPeriod", false);
  if (errors.length || missing.length || unsupported) {
    result.status = errors.length ? "invalid_input" : unsupported ? "unsupported_plan" : "needs_evidence";
    return result;
  }
  let ingestionCost = ZERO;
  let storageCost = ZERO;
  if (plan === "paid") {
    const storage = divide(storageDays.reduce((sum, row) => add(sum, row.value), ZERO), 30n);
    ingestionCost = divide(positive(subtract(ingestion, ingestionAllowance)), 4n);
    storageCost = divide(positive(subtract(storage, storageAllowance)), 10n);
    result.ingestionGB = approximate(ingestion);
    result.storageGBMonth = approximate(storage);
    result.storageGBMonthExact = exact(storage);
    result.notes.push("Paid 표준 추가 단가: 수집 $0.25/GB, 저장 $0.10/GB-month. 일별 최대 저장량 합계는 월의 일수와 관계없이 30으로 나눕니다. 이미 발생한 초과분은 이후 수집 중단으로 취소되지 않습니다.");
  } else {
    result.ingestionGB = approximate(dailyTotal);
    result.freeCapDates = ingestionDays.filter((row) => subtract(row.value, ingestionAllowance).n >= 0n).map((row) => row.date).sort();
    result.notes.push("Free의 dailyIngestion은 UTC 일별 값입니다. 0.5GB 도달 시 수집이 중단되므로 추가 사용료 0이어도 로그 누락 가능성이 있습니다. 월 합계·다른 날의 여유로 상계하지 않습니다.");
  }
  const total = add(ingestionCost, storageCost);
  result.ingestionAdditionalUsd = approximate(ingestionCost);
  result.storageAdditionalUsd = approximate(storageCost);
  result.additionalUsd = approximate(total);
  result.additionalUsdExact = exact(total);
  result.additionalChargeIsZero = total.n === 0n;
  const prefix = state === "forecast" ? "forecast" : "observed";
  result.status = result.freeCapDates.length ? "free_cap_reached" : `${prefix}_${total.n > 0n ? "overage" : "within_allowance"}`;
  if (oldCost !== null && comparison.sameScopeAndPeriod === true) {
    const delta = subtract(total, oldCost);
    result.deltaUsd = approximate(delta);
    result.deltaUsdExact = exact(delta);
  }
  result.notes.push(state === "in_progress"
    ? "관측 진행 중인 입력 범위만 계산했습니다. 미관측일·보관 잔량·남은 기간의 비용은 예측하지 않았습니다."
    : state === "forecast" ? "예상 입력의 시나리오 계산입니다. 실측값 또는 확정 청구로 취급하지 마세요."
      : "입력한 적용 구간의 관측 완료 계산입니다. 청구서 확정이나 전체 청구 주기의 검증 완료를 뜻하지 않습니다.");
  return result;
}

export function exitCodeFor(result) {
  if (["observed_within_allowance", "forecast_within_allowance"].includes(result.status)) return 0;
  if (["observed_overage", "forecast_overage", "free_cap_reached"].includes(result.status)) return 1;
  return 2;
}

export function runCli(args) {
  let inputPath;
  let template;
  let json = false;
  const seen = new Set();
  try {
    if (args.length === 1 && args[0] === "--help") { console.log(HELP); return 0; }
    for (let index = 0; index < args.length; index += 1) {
      const flag = args[index];
      if (seen.has(flag) || !["--input", "--template", "--json"].includes(flag)) throw new Error("arguments");
      seen.add(flag);
      if (flag === "--json") json = true;
      else {
        const value = args[++index];
        if (!value || value.startsWith("--")) throw new Error("arguments");
        if (flag === "--input") inputPath = value;
        else template = value;
      }
    }
    if (Boolean(inputPath) === Boolean(template)) throw new Error("arguments");
    if (template) { console.log(JSON.stringify(createTemplate(template), null, 2)); return 0; }
    const info = statSync(inputPath);
    if (!info.isFile() || info.size > 1_048_576) throw new Error("input");
    const contents = readFileSync(inputPath, "utf8");
    if (Buffer.byteLength(contents) > 1_048_576) throw new Error("input");
    const result = analyzeCost(JSON.parse(contents));
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`판정: ${result.status}\n기간 상태: ${result.periodState ?? "미확인"}\n추가 사용료 USD: ${result.additionalUsd ?? result.additionalUsdExact ?? "미확인"}\n정확한 USD 값: ${result.additionalUsdExact ?? "미확인"}\n최종 청구 확인: 아니요`);
      for (const message of [...result.errors, ...result.missingEvidence, ...result.notes]) console.log(`- ${message}`);
    }
    return exitCodeFor(result);
  } catch {
    // 파일명·JSON 원문·런타임 오류 메시지에 사용자 정보가 들어 있을 수 있으므로 출력하지 않는다.
    const message = "입력 파일 또는 인자를 처리하지 못했습니다. --help와 --template paid|free로 형식을 확인하고 1MiB 이하의 집계 JSON을 사용하세요.";
    console.error(json ? JSON.stringify({ status: "invalid_input", invoiceFinal: false, error: message }) : message);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}

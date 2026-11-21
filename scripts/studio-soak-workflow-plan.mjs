import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STUDIO_SOAK_PROFILES = Object.freeze([
  { id: "desktop", profile: "desktop", webgpu: "0" },
  { id: "desktop-webgpu", profile: "desktop", webgpu: "1" },
  { id: "kakaotalk-android", profile: "kakaotalk-android-360", webgpu: "0" },
  { id: "instagram-ios", profile: "instagram-ios-390", webgpu: "0" },
  { id: "naver-android", profile: "naver-android-412", webgpu: "0" },
]);

function choice(name, value, allowed, fallback) {
  const selected = value?.trim() || fallback;
  if (!allowed.includes(selected)) throw new Error(`${name}: ${allowed.join(", ")} 중 하나를 선택하세요.`);
  return selected;
}

function integer(name, value, fallback, maximum) {
  const parsed = Number(value?.trim() || fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name}: 1부터 ${maximum}까지의 정수를 입력하세요.`);
  }
  return String(parsed);
}

function flag(name, value, fallback) {
  const selected = choice(name, value, ["true", "false", "1", "0"], fallback ? "1" : "0");
  return selected === "true" || selected === "1" ? "1" : "0";
}

/** 수동 입력을 실행 전에 검증하고, 정기 검사의 기존 다섯 환경은 유지한다. */
export function createStudioSoakWorkflowPlan(env = process.env) {
  const manual = env.GITHUB_EVENT_NAME === "workflow_dispatch";
  const requested = manual ? env : {};
  const profile = choice("profile", requested.SOAK_PROFILE,
    ["all", ...STUDIO_SOAK_PROFILES.map((entry) => entry.id)], "all");
  const selected = STUDIO_SOAK_PROFILES.filter((entry) => profile === "all" || entry.id === profile);
  const baseline = flag("latency_baseline", requested.SOAK_LATENCY_BASELINE, false);
  if (baseline === "1" && selected.length !== 1) {
    throw new Error("대표 지연 검사를 선행 조건으로 쓰려면 profile에서 단일 환경을 선택하세요.");
  }
  return {
    matrix: JSON.stringify({ include: selected }),
    minutes: integer("minutes", requested.SOAK_MINUTES, 300, 300),
    workload: choice("workload", requested.SOAK_WORKLOAD, ["bounded-churn", "accumulate"], "bounded-churn"),
    input: choice("input", requested.SOAK_INPUT, ["auto", "mouse", "pen", "touch"], "auto"),
    brush_cycles: integer("brush_cycles", requested.SOAK_BRUSH_CYCLES, 5, 100),
    sample_heap_per_stroke: flag("sample_heap_per_stroke", requested.SOAK_SAMPLE_HEAP_PER_STROKE, false),
    stop_on_failure: flag("stop_on_failure", requested.SOAK_STOP_ON_FAILURE, manual),
    measure_pointer_latency: flag("measure_pointer_latency", requested.SOAK_MEASURE_POINTER_LATENCY, false),
    latency_profile: baseline === "1" ? selected[0].id : "none",
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const plan = createStudioSoakWorkflowPlan();
    if (!process.env.GITHUB_OUTPUT) throw new Error("검증 계획을 전달할 GITHUB_OUTPUT 경로가 없습니다.");
    appendFileSync(process.env.GITHUB_OUTPUT,
      Object.entries(plan).map(([key, value]) => `${key}=${value}\n`).join(""));
    console.log(`Studio 소크 계획: ${plan.minutes}분 · ${plan.workload} · ${plan.input} · ${plan.matrix}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

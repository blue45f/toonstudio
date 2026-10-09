import { RAPIER_FOOTPRINT_KO } from "../../lanes/physics/rapier-footprint";

import type { Verdict } from "../../bench/report/report-schema";
import type { LaneDescriptor, LaneId } from "../../lanes/lane";

/**
 * 레인 성숙도(`LaneDescriptor.maturity`)에 따른 UI 규칙.
 *
 * - `experimental` 레인은 검증 범위가 Node 22 단일 스레드 측정이 중심이라 **인증 판정(PASS/FAIL) 집계에서 제외**한다
 *   (`docs/license-policy.md` 3절 6항). 지표·임계값 표는 참고용("(참고)")으로 그대로 보이되 종합 판정은 "인증 제외"로 바꿔 표시한다.
 * - 리포트 스키마(`bench/report`)는 성숙도를 담지 않으므로 레지스트리에서 레인 ID로 찾는다. 레지스트리에 없는 레인(구버전 세션·레지스트리 변경)은
 *   성숙도를 알 수 없으므로 **안전한 쪽으로** 인증 집계에서 빼고 "레인 미등록"으로 따로 센다(원래 판정은 참고용으로 남긴다) — 인증처럼 읽히지 않게 한다.
 */

/** 실험 배지 문구. */
export const EXPERIMENTAL_BADGE_LABEL = "실험";

/** 실험 레인 공통 검증 범위 설명(한글). */
export const EXPERIMENTAL_SCOPE_KO =
  "검증 범위는 Node 22 단일 스레드 측정이 중심이고 브라우저는 소프트웨어 렌더러 스모크만 했다. 성능·결정성·실기기·GPU·교차 머신·실펜 손맛은 미검증이다. 인증 판정(PASS/FAIL) 집계에서 제외한다.";

/** 레인별 추가 주의(검증된 한계만 적는다). */
const EXPERIMENTAL_LANE_NOTES: Readonly<Partial<Record<LaneId, string>>> = {
  "mpm-paint":
    "순수 TS CPU 솔버다. 입자 한도를 넘으면 오류로 드러나고 다른 구현으로 바꾸지 않는다. 종이 결·가장자리 농담이 없어 cpu-reference의 안료 질감과 다르다.",
  "bristle-pbd":
    "순수 TS CPU 붓털 물리다. 압력에 따른 폭 변화가 cpu-reference보다 훨씬 작다(저장소 측정: N=32에서 30→40 px, cpu-reference는 10→82 px).",
  "bristle-rapier":
    `Rapier 2D wasm을 이 레인을 고르는 순간 처음 불러온다(${RAPIER_FOOTPRINT_KO}). 불러오기·초기화에 실패하면 한글 사유를 보이고 다른 레인으로 바꾸지 않는다.`,
};

export function isExperimental(desc: Pick<LaneDescriptor, "maturity"> | null | undefined): boolean {
  return desc?.maturity === "experimental";
}

/** 인증 판정 집계에서 빠지는 레인인가(현재는 실험 레인). */
export function isCertificationExcluded(desc: Pick<LaneDescriptor, "maturity"> | null | undefined): boolean {
  return isExperimental(desc);
}

/** 실험 레인의 전체 설명(공통 + 레인별). 안정 레인이면 null. */
export function experimentalDescription(desc: Pick<LaneDescriptor, "id" | "maturity"> | null | undefined): string | null {
  if (!desc || !isExperimental(desc)) return null;
  const note = EXPERIMENTAL_LANE_NOTES[desc.id];
  return note ? `${EXPERIMENTAL_SCOPE_KO} ${note}` : EXPERIMENTAL_SCOPE_KO;
}

/** 셀렉트 옵션 문구. 레이블에 이미 "실험"이 들어 있으면 중복해서 붙이지 않는다. */
export function laneOptionLabel(desc: Pick<LaneDescriptor, "id" | "label" | "maturity">, reason: string | null): string {
  const mark = isExperimental(desc) && !desc.label.includes(EXPERIMENTAL_BADGE_LABEL) ? ` [${EXPERIMENTAL_BADGE_LABEL}]` : "";
  return `${desc.label} (${desc.id})${mark}${reason ? ` — ${reason}` : ""}`;
}

/** 종합 판정 표시. 실험·미등록 레인은 `excluded`가 true이고 원래 판정은 참고용으로만 남긴다. */
export interface VerdictDisplay {
  readonly text: string;
  readonly excluded: boolean;
  /** 레지스트리에 없는 레인이라 성숙도를 알 수 없는가(인증 집계에서 안전하게 뺀 경우). */
  readonly unregistered: boolean;
  /** 참고용 원래 판정(없으면 null). */
  readonly reference: Verdict | null;
}

/** 레지스트리 조회 결과가 없다(`null`·`undefined`)는 것은 성숙도를 알 수 없다는 뜻이다. */
export function verdictDisplay(verdict: Verdict | null, desc: Pick<LaneDescriptor, "maturity"> | null | undefined): VerdictDisplay {
  if (verdict === null) return { text: "—", excluded: false, unregistered: false, reference: null };
  if (desc === null || desc === undefined) return { text: "레인 미등록", excluded: true, unregistered: true, reference: verdict };
  if (isCertificationExcluded(desc)) return { text: "인증 제외(실험)", excluded: true, unregistered: false, reference: verdict };
  return { text: verdict, excluded: false, unregistered: false, reference: verdict };
}

/** 지표별 판정 셀 표시. 실험·미등록 레인은 합격/불합격 색 대신 "(참고)"를 붙여 인증처럼 읽히지 않게 한다. */
export interface MetricVerdictDisplay {
  readonly text: string;
  /** 참고용 스타일로 그려야 하는가. */
  readonly reference: boolean;
}

export function metricVerdictDisplay(verdict: Verdict | undefined, desc: Pick<LaneDescriptor, "maturity"> | null | undefined): MetricVerdictDisplay {
  if (verdict === undefined) return { text: "—", reference: false };
  if (desc === null || desc === undefined) return { text: `${verdict} (참고·레인 미등록)`, reference: true };
  if (isCertificationExcluded(desc)) return { text: `${verdict} (참고)`, reference: true };
  return { text: verdict, reference: false };
}

/**
 * 리포트 원문·다운로드 JSON 안내. JSON의 `verdict`는 성숙도를 담지 않는 원시 판정이라(스키마 변경은 별도 승인 사항) 밖으로 가져가면 실험 레인의 PASS가
 * 인증처럼 읽힐 수 있다. 실험·미등록 레인이면 그 사실을 화면에 밝힌다. 안정 레인이면 null.
 */
export function rawVerdictNoteKo(desc: Pick<LaneDescriptor, "maturity"> | null | undefined): string | null {
  if (desc === null || desc === undefined) {
    return "이 레인은 레지스트리에 없는 레인이라 성숙도를 알 수 없다. 아래 원문·JSON의 verdict는 성숙도를 담지 않는 원시 판정이며 인증으로 읽으면 안 된다.";
  }
  if (isCertificationExcluded(desc)) {
    return "실험 레인이다. 아래 원문·JSON의 verdict는 성숙도를 담지 않는 원시 판정이므로 PASS/FAIL이 있어도 인증이 아니다(참고용). 밖으로 가져갈 때 이 사실을 함께 전하라.";
  }
  return null;
}

/** 세션 리포트 인증 집계. 실험 레인 리포트는 PASS/FAIL/UNAVAILABLE 어디에도 세지 않고 `excluded`에만, 레지스트리에 없는 레인은 `unregistered`에만 센다. */
export interface CertificationSummary {
  readonly pass: number;
  readonly fail: number;
  readonly unavailable: number;
  readonly excluded: number;
  readonly unregistered: number;
  readonly total: number;
}

export function summarizeCertification(
  reports: readonly { readonly laneId: LaneId; readonly verdict: Verdict }[],
  registry: readonly LaneDescriptor[],
): CertificationSummary {
  let pass = 0;
  let fail = 0;
  let unavailable = 0;
  let excluded = 0;
  let unregistered = 0;
  for (const report of reports) {
    const desc = registry.find((d) => d.id === report.laneId) ?? null;
    if (desc === null) {
      unregistered += 1;
    } else if (isCertificationExcluded(desc)) {
      excluded += 1;
    } else if (report.verdict === "PASS") {
      pass += 1;
    } else if (report.verdict === "FAIL") {
      fail += 1;
    } else {
      unavailable += 1;
    }
  }
  return { pass, fail, unavailable, excluded, unregistered, total: reports.length };
}

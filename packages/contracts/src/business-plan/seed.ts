import { todayKst } from "./primitives";
import { APPROVAL_TYPES } from "./types";

import type { BusinessPlanClaimKind, BusinessPlanState } from "./types";

const TASKS = [
  ["문제 인식", "문제·고객"],
  ["고객 설득 근거", "문제·고객"],
  ["웹툰 제작 공정별 기존 도구 비교", "제품·공정"],
  ["도구 간 연결이 끊기는 지점과 실제 병목", "제품·공정"],
  ["스케치업·블렌더 통합 제공 계획", "제품·공정"],
  ["매출·벤치마크 재검증", "수치·시장"],
  ["마케팅·통계 사실관계 보완", "수치·시장"],
  ["시장·매출 지표 교차검증", "수치·시장"],
  ["캡처 최신화", "문서·제출"],
  ["제출 양식 재포맷", "문서·제출"],
  ["멘토 피드백 반영 여부", "문서·제출"],
] as const;

const CLAIMS: readonly (readonly [string, number, BusinessPlanClaimKind])[] = [
  ["문제 발생 근거", 1, "정성 주장"],
  ["고객과 구매 결정자", 2, "정성 주장"],
  ["도입 효과와 지불 의향", 2, "정성 주장"],
  ["기존 도구의 기능 비교", 3, "비교표"],
  ["공정별 병목과 재작업", 4, "수치"],
  ["SketchUp·Blender 교환 범위", 5, "제품 구현"],
  ["가격 벤치마크", 6, "비교표"],
  ["매출 전망의 입력 근거", 6, "매출 전망"],
  ["비용과 손익분기 가정", 6, "매출 전망"],
  ["통계 원문의 해석", 7, "수치"],
  ["마케팅 성과와 목표 구분", 7, "수치"],
  ["산업 시장 규모의 정의", 8, "시장 규모"],
  ["목표 시장의 범위", 8, "시장 규모"],
  ["캡처와 제품 버전 일치", 9, "제품 구현"],
  ["공식 제출 조건", 10, "정성 주장"],
  ["멘토 요청의 반영 근거", 11, "정성 주장"],
];

const CHECKS = [
  ["공식 양식과 제출 안내 원문 대조", "서식"],
  ["표지 정보·문항·본문 분량 확인", "서식"],
  ["표·그림 잘림과 가독성 확인", "서식"],
  ["주장·비교표와 원문 출처 대응", "출처"],
  ["캡처 촬영일·제품 버전·예시 표시 확인", "내용"],
  ["실적·가정·목표·계획 표현 구분", "내용"],
  ["제출 파일 구성·파일명·정상 열림 확인", "파일"],
  ["제출 경로·마감·시간대 확인", "파일"],
] as const;

const id = (prefix: string, index: number): string => `${prefix}-${String(index).padStart(2, "0")}`;

/**
 * 공개 코드에 둘 수 있는 빈 템플릿이다. 실제 사업 문단·멘토 원문·개인 링크·마감일은
 * 포함하지 않는다. 사용자 데이터는 인증된 저장소 또는 사용자의 JSON 가져오기로 채운다.
 */
export function createEmptyBusinessPlanState(now: Date = new Date()): BusinessPlanState {
  if (!Number.isFinite(now.getTime())) throw new RangeError("보드 생성 시각이 올바르지 않습니다.");
  const updatedAt = now.toISOString();
  return {
    schemaVersion: 1,
    project: {
      title: "사업계획서",
      subtitle: "고도화 · 제출 준비",
      createdAt: todayKst(now),
      deadlines: [
        { id: "pre", label: "사전 제출", at: "", sourceUrl: "", verified: false, note: "" },
        { id: "final", label: "최종 제출", at: "", sourceUrl: "", verified: false, note: "" },
      ],
    },
    tasks: TASKS.map(([title, category], index) => ({
      id: id("BP", index + 1), title, category, status: "초안", priority: "보통", description: "", owner: "",
      assignment: "", nextAction: "", notes: "", evidenceUrl: "", sourceTitle: "", verifiedAt: "", dueDate: "", updatedAt,
    })),
    claims: CLAIMS.map(([title, task, kind], index) => ({
      id: id("CL", index + 1), taskId: id("BP", task), title, kind, text: "", value: "", unit: "", period: "", scope: "",
      factStatus: "미확인", sourceUrl: "", sourceTitle: "", publisher: "", publishedAt: "", sourceLocation: "", originalExcerpt: "",
      crossSourceUrl: "", crossSourceTitle: "", crossNotes: "", verifiedAt: "", reviewer: "", reviewDays: 30,
      notes: "", assumptions: "", formula: "", updatedAt,
    })),
    documents: ["사업계획서 본문", "붙임 · 근거 자료"].map((title, index) => ({
      id: id("DOC", index + 1), title, sourceUrl: "", fileName: "", workingLabel: "작업용", workingText: "",
      previousLabel: "이전 버전", previousText: "", updatedAt, submission: null, history: [], notes: "",
    })),
    mentor: [],
    checks: CHECKS.map(([title, group], index) => ({ id: id("CK", index + 1), title, group, checked: false, note: "", evidenceUrl: "" })),
    approvals: APPROVAL_TYPES.map((type, index) => ({ id: id("AP", index + 1), title: type, type, status: "승인 대기", scope: "", note: "" })),
    activity: [],
  };
}

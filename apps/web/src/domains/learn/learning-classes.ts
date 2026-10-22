import { LESSONS } from "./learning-content";
import type { LearningLevel } from "./learning-paths";

/**
 * 클래스 카탈로그와 수강 등록 상태.
 *
 * 클래스는 현금 결제를 받지 않는다(2026-10-02 정책 확정): 무료(0P)이거나
 * 활동으로 모은 포인트만 차감한다. 포인트 차감·환불은
 * `learning-class-points.ts` 어댑터 한 곳에서 지갑 원장과 연결한다.
 * 커리큘럼은 기존 강좌(LESSONS)를 참조만 하며 강좌 콘텐츠를 복제하지 않는다.
 * 등록 기록은 브라우저 로컬이 단일 출처이고, 저장값은 신뢰하지 않고 검증한다.
 */
export interface ClassCurriculumWeek {
  week: number;
  title: string;
  summary: string;
  lessonIds: readonly string[];
}

export interface ClassProduct {
  id: string;
  title: string;
  summary: string;
  instructor: string;
  level: LearningLevel;
  /** 등록에 필요한 활동 포인트. 0이면 무료 클래스. 현금 가격은 존재하지 않는다. */
  pointPrice: number;
  outcomes: readonly string[];
  curriculum: readonly ClassCurriculumWeek[];
}

export const CLASS_PRODUCTS: readonly ClassProduct[] = [
  {
    id: "first-episode-masterclass",
    title: "첫 회차 완성 마스터클래스",
    summary: "로그라인 한 줄에서 게시 가능한 첫 회차까지, 강좌와 스튜디오 실습 미션을 주차별로 엮은 대표 클래스입니다.",
    instructor: "툰스튜디오 아카데미 제작진",
    level: "starter",
    // 구 현금 가격 99,000원을 포인트 정책 환산(100원 = 1P)으로 바꾼 값이다.
    pointPrice: 990,
    outcomes: [
      "상황·변화·반응이 읽히는 3컷 콘티와 첫 회차 러프",
      "대사 순서가 한눈에 읽히는 말풍선 배치",
      "원본과 게시본을 분리한 최종 검수 기록",
    ],
    curriculum: [
      { week: 1, title: "이야기와 호흡 설계", summary: "목표를 행동으로 바꾸고 컷 간격으로 읽는 호흡을 설계합니다.", lessonIds: ["story-board", "scroll-rhythm"] },
      { week: 2, title: "대사와 말풍선", summary: "대화 순서와 글자 공간을 설계해 읽기 흐름을 만듭니다.", lessonIds: ["lettering"] },
      { week: 3, title: "툰스튜디오 첫 3컷 실습", summary: "배운 연출을 실제 작업 화면의 러프로 옮깁니다.", lessonIds: ["studio-first-page"] },
      { week: 4, title: "게시 검수와 완성", summary: "게시 크기로 다시 확인하고 검수 기록을 남깁니다.", lessonIds: ["publish-check"] },
    ],
  },
  {
    id: "visual-finish-class",
    title: "작화·채색 완성 클래스",
    summary: "투시와 실루엣으로 공간과 초점을 잡고, 선화와 레이어 채색을 수정 가능한 구조로 완성하는 클래스입니다.",
    instructor: "툰스튜디오 아카데미 제작진",
    level: "growing",
    // 무료 클래스 — 포인트 없이 바로 등록한다.
    pointPrice: 0,
    outcomes: [
      "아이레벨과 소실점이 일관된 공간 초안",
      "작게 보아도 행동이 읽히는 캐릭터 한 컷",
      "밑색·음영·클리핑이 분리된 채색 구조와 내보내기",
    ],
    curriculum: [
      { week: 1, title: "공간과 카메라", summary: "아이레벨과 소실점으로 장면의 공간 관계를 잡습니다.", lessonIds: ["camera-perspective"] },
      { week: 2, title: "실루엣과 선화", summary: "외곽으로 행동을 읽히게 하고 선마다 역할을 부여합니다.", lessonIds: ["character-silhouette", "inking"] },
      { week: 3, title: "레이어 채색", summary: "밑색·음영·클리핑을 분리해 수정 가능한 구조를 만듭니다.", lessonIds: ["color-layers"] },
      { week: 4, title: "스튜디오 레이어 실습", summary: "원본을 유지한 채 색 수정과 내보내기를 실습합니다.", lessonIds: ["studio-layer-practice"] },
    ],
  },
  {
    id: "episode-workflow-class",
    title: "한 회차 제작 워크플로 클래스",
    summary: "회차 구조 설계에서 배경·톤 마무리와 조립 검수까지, 실제 제작 순서를 주차별로 한 회차 분량으로 완주하는 클래스입니다.",
    instructor: "툰스튜디오 아카데미 제작진",
    level: "growing",
    pointPrice: 500,
    outcomes: [
      "질문·고조·답이 대응하는 회차 구조표와 콘티",
      "장소와 시간대가 읽히는 배경과 톤 마무리",
      "단계별 마감 표시와 검수 기록이 있는 조립본",
    ],
    curriculum: [
      { week: 1, title: "회차 구조 설계", summary: "시작 질문과 고조, 답을 구조표로 세우고 세 컷 콘티로 검증합니다.", lessonIds: ["episode-arc", "story-board"] },
      { week: 2, title: "공간과 배경 실습", summary: "배경으로 장소와 시간을 설명하고 작업 화면에서 카메라를 잡습니다.", lessonIds: ["background-scene", "studio-background-practice"] },
      { week: 3, title: "톤과 질감 마무리", summary: "톤의 명도 단계와 효과선으로 표면과 분위기를 구분합니다.", lessonIds: ["tone-effects"] },
      { week: 4, title: "조립과 게시 준비", summary: "컷을 회차로 조립하고 게시 검수까지 한 흐름으로 마칩니다.", lessonIds: ["studio-episode-assembly", "publish-check"] },
    ],
  },
  {
    id: "character-review-class",
    title: "캐릭터 일관성과 리뷰·수정 클래스",
    summary: "캐릭터 시트로 기준을 고정하고, 배경 속에서도 같은 인물로 읽히게 한 뒤 피드백을 수정으로 연결하는 심화 클래스입니다.",
    instructor: "툰스튜디오 아카데미 제작진",
    level: "advanced",
    pointPrice: 700,
    outcomes: [
      "비율·표정·기준색이 고정된 캐릭터 시트",
      "배경 속에서도 실루엣과 얼굴이 유지되는 캐릭터 컷",
      "피드백을 수정 지시로 바꾼 전후 비교 기록",
    ],
    curriculum: [
      { week: 1, title: "캐릭터 기준 세우기", summary: "캐릭터 시트를 만들고 실루엣으로 행동이 읽히는지 확인합니다.", lessonIds: ["character-consistency", "character-silhouette"] },
      { week: 2, title: "배경 속 캐릭터", summary: "배경의 공간 규칙 안에서 인물의 접지와 크기를 맞춥니다.", lessonIds: ["background-scene", "studio-background-practice"] },
      { week: 3, title: "피드백과 수정", summary: "감상을 위치와 현상으로 번역하고 우선순위대로 고칩니다.", lessonIds: ["feedback-revision"] },
      { week: 4, title: "조립 검수와 완성", summary: "수정본을 회차로 조립하고 처음부터 끝까지 검수합니다.", lessonIds: ["studio-episode-assembly"] },
    ],
  },  {
    id: "serial-operations-class",
    title: "연재 운영 클래스",
    summary: "단계별 마감 계획부터 연재 캘린더와 예약, 휴재 공지와 독자 지표까지 연재를 지속 가능하게 운영하는 클래스입니다.",
    instructor: "툰스튜디오 아카데미 제작진",
    level: "growing",
    pointPrice: 600,
    outcomes: [
      "게시일에서 거꾸로 계산한 단계별 마감 계획과 비축분 운영",
      "게시일과 제작 일정이 함께 보이는 연재 캘린더와 예약 운영",
      "공지와 지표 기록이 쌓이는 연재 운영 루틴",
    ],
    curriculum: [
      { week: 1, title: "일정 설계", summary: "회차 구조를 세우고 게시일 기준 단계별 마감 계획을 만듭니다.", lessonIds: ["serial-schedule", "episode-arc"] },
      { week: 2, title: "캘린더와 게시 준비", summary: "캘린더에 회차를 배치하고 검수를 마친 회차를 예약합니다.", lessonIds: ["studio-serial-calendar", "publish-check"] },
      { week: 3, title: "공지와 조립 운영", summary: "휴재·지연 공지를 운영 정보로 쓰고 조립 검수와 일정을 맞춥니다.", lessonIds: ["hiatus-notice-ops", "studio-episode-assembly"] },
      { week: 4, title: "지표 읽기와 다음 회차", summary: "유입과 이탈 지표를 읽어 다음 회차의 변경 가설을 세웁니다.", lessonIds: ["reader-data-reading"] },
    ],
  },
  {
    id: "collaboration-production-class",
    title: "협업 제작 클래스",
    summary: "역할과 권한 설계, 동시 드로잉, 검수·승인과 외주 합의까지 팀으로 한 회차를 완성하는 협업 클래스입니다.",
    instructor: "툰스튜디오 아카데미 제작진",
    level: "advanced",
    pointPrice: 800,
    outcomes: [
      "작업 단위별 책임과 권한이 명시된 팀 분담표",
      "병합 규칙과 공동 검수를 거친 동시 드로잉 결과물",
      "결정 기록이 남는 검수·승인과 외주 합의 문서",
    ],
    curriculum: [
      { week: 1, title: "역할과 피드백 기준", summary: "작업 단위와 권한을 정하고 피드백을 수정 지시로 바꾸는 기준을 맞춥니다.", lessonIds: ["team-roles-permissions", "feedback-revision"] },
      { week: 2, title: "동시 드로잉 실습", summary: "영역을 나누어 함께 그리고 겹침 규칙으로 병합을 검수합니다.", lessonIds: ["studio-co-drawing"] },
      { week: 3, title: "검수·승인과 비교 검수", summary: "검수 상태를 구분해 결정으로 잇고 전후 비교로 확정합니다.", lessonIds: ["review-approval-flow", "studio-compare-review"] },
      { week: 4, title: "외주 합의와 운영", summary: "산출물과 수정 범위를 합의 문서로 남기는 법을 익힙니다.", lessonIds: ["outsourcing-communication"] },
    ],
  },
  {
    id: "classroom-start-class",
    title: "교육기관 도입: 교실 운영 클래스",
    summary: "학원·교육기관에서 웹툰 과정을 열기 위한 운영 계획, 과제 설계와 템플릿 과정안, 평가 루브릭을 한 번에 준비하는 클래스입니다.",
    instructor: "툰스튜디오 아카데미 제작진",
    level: "growing",
    pointPrice: 400,
    outcomes: [
      "복습 주차와 진단이 포함된 교실 운영 계획",
      "주차마다 강좌와 과제가 연결된 과정 템플릿 활용안",
      "누가 평가해도 흔들리지 않는 루브릭 기준표",
    ],
    curriculum: [
      { week: 1, title: "교실 운영 설계", summary: "주차 리듬과 진단으로 과정의 시작점을 설계하고 첫 이야기를 만듭니다.", lessonIds: ["classroom-operations", "story-board"] },
      { week: 2, title: "과제 설계와 첫 실습", summary: "목표가 드러나는 과제를 설계하고 스튜디오 첫 실습과 연결합니다.", lessonIds: ["assignment-design", "studio-first-page"] },
      { week: 3, title: "템플릿 과정안 만들기", summary: "교실 템플릿을 자신의 기간과 학습자에 맞게 조정합니다.", lessonIds: ["studio-classroom-practice"] },
      { week: 4, title: "평가 루브릭 완성", summary: "수준 설명이 관찰 가능한 루브릭으로 피드백 기준을 확정합니다.", lessonIds: ["assessment-rubric"] },
    ],
  },
  {
    id: "advanced-craft-class",
    title: "심화 제작 클래스: 시즌·색·공간",
    summary: "시즌 아크와 컬러 스크립트로 큰 설계를 세우고 3D 배경·마네킹·AI 채색 후보와 비교 검수로 완성도를 높이는 심화 클래스입니다.",
    instructor: "툰스튜디오 아카데미 제작진",
    level: "advanced",
    pointPrice: 900,
    outcomes: [
      "큰 질문과 전환점이 설계된 시즌 아크 표",
      "회차 전체의 색 흐름을 통제하는 컬러 스크립트",
      "공간 실습과 비교 검수를 거친 심화 완성 회차",
    ],
    curriculum: [
      { week: 1, title: "시즌 설계", summary: "시즌의 큰 질문과 회차 아크를 층을 나누어 설계합니다.", lessonIds: ["season-arc-design", "episode-arc"] },
      { week: 2, title: "색 흐름 설계", summary: "컬러 스크립트로 전환을 설계하고 톤 마무리와 연결합니다.", lessonIds: ["color-script", "tone-effects"] },
      { week: 3, title: "공간 실습 심화", summary: "3D 배경 배치와 마네킹 포즈로 공간과 구도를 잡습니다.", lessonIds: ["studio-bg3d-practice", "studio-mannequin-pose"] },
      { week: 4, title: "채색 후보와 비교 검수", summary: "AI 채색 후보를 검수하고 전후 비교로 최종본을 확정합니다.", lessonIds: ["studio-ai-coloring", "studio-compare-review"] },
    ],
  },
];

const PRODUCT_BY_ID = new Map(CLASS_PRODUCTS.map((product) => [product.id, product]));

export function getClassProduct(classId: string): ClassProduct | undefined {
  return PRODUCT_BY_ID.get(classId);
}

export function getClassLessonIds(product: ClassProduct): string[] {
  return [...new Set(product.curriculum.flatMap((week) => week.lessonIds))];
}

/** 포인트 표기. 0P인 무료 클래스의 "무료" 라벨은 화면이 따로 정한다. */
export function formatPoints(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return `${safe.toLocaleString("ko-KR")}P`;
}

/** 카탈로그 무결성 — 존재하지 않는 강좌를 참조하면 안 된다. */
export function validateClassCatalog(products: readonly ClassProduct[] = CLASS_PRODUCTS): string[] {
  const lessonIds = new Set(LESSONS.map((lesson) => lesson.id));
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    if (seen.has(product.id)) problems.push(`중복된 클래스 id: ${product.id}`);
    seen.add(product.id);
    if (!Number.isInteger(product.pointPrice) || product.pointPrice < 0) {
      problems.push(`포인트 가격이 올바르지 않은 클래스: ${product.id}`);
    }
    product.curriculum.forEach((week, index) => {
      if (week.week !== index + 1) problems.push(`주차 순서가 어긋난 클래스: ${product.id}`);
      for (const lessonId of week.lessonIds) {
        if (!lessonIds.has(lessonId)) problems.push(`없는 강좌를 참조하는 클래스: ${product.id} → ${lessonId}`);
      }
    });
  }
  return problems;
}

export type EnrollmentStatus = "enrolled" | "cancelled";

export interface ClassEnrollment {
  classId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  updatedAt: string;
  /** 포인트로 등록한 경우 지갑 원장의 차감 이벤트 ID(수강 취소 시 환불에 쓴다). 무료 등록이면 null. */
  spendEventId: string | null;
  /** 등록 당시 차감한 포인트. 무료 등록이면 0. */
  pointPricePaid: number;
}

export interface ClassEnrollmentState {
  version: 1;
  enrollments: Record<string, ClassEnrollment>;
}

export const CLASS_ENROLLMENT_STORAGE_KEY = "toonstudio:learning-classes:v1";

const MAX_TIMESTAMP_LENGTH = 64;

export function emptyClassEnrollments(): ClassEnrollmentState {
  return { version: 1, enrollments: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedTimestamp(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TIMESTAMP_LENGTH ? value : fallback;
}

function boundedEventId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TIMESTAMP_LENGTH ? value : null;
}

function nonNegativeAmount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

/** 저장된 등록 기록은 신뢰하지 않는다 — 모르는 클래스·깨진 상태는 버린다. */
export function parseClassEnrollments(raw: string | null): ClassEnrollmentState {
  if (!raw || raw.length > 100_000) return emptyClassEnrollments();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return emptyClassEnrollments(); }
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.enrollments)) return emptyClassEnrollments();
  const enrollments: Record<string, ClassEnrollment> = {};
  for (const [classId, record] of Object.entries(value.enrollments)) {
    if (!PRODUCT_BY_ID.has(classId) || !isRecord(record)) continue;
    if (record.status !== "enrolled" && record.status !== "cancelled") continue;
    enrollments[classId] = {
      classId,
      status: record.status,
      enrolledAt: boundedTimestamp(record.enrolledAt, ""),
      updatedAt: boundedTimestamp(record.updatedAt, ""),
      spendEventId: boundedEventId(record.spendEventId),
      pointPricePaid: nonNegativeAmount(record.pointPricePaid),
    };
  }
  return { version: 1, enrollments };
}

/**
 * 소유자별 저장 키. 수강 등록은 계정 전용 기능이라, 기록을 계정 키로 나눠
 * 같은 브라우저의 다른 계정에게 이전 계정의 등록·환불 상태가 보이지 않게 한다.
 * ownerKey가 없으면 레거시 키(기존 호출·테스트 호환).
 */
export function classEnrollmentStorageKey(ownerKey?: string): string {
  return ownerKey ? `${CLASS_ENROLLMENT_STORAGE_KEY}:${ownerKey}` : CLASS_ENROLLMENT_STORAGE_KEY;
}

export function loadClassEnrollments(
  storage: (Pick<Storage, "getItem"> & Partial<Pick<Storage, "setItem" | "removeItem">>) | null,
  ownerKey?: string,
): ClassEnrollmentState {
  if (!storage) return emptyClassEnrollments();
  try {
    const scopedRaw = storage.getItem(classEnrollmentStorageKey(ownerKey));
    const scoped = parseClassEnrollments(scopedRaw);
    if (scopedRaw !== null || !ownerKey || ownerKey === "guest") return scoped;
    // 스코프 키가 없으면 레거시 기록을 첫 계정이 claim 한다 — 읽은 자리에서
    // 스코프 키로 옮기고 레거시를 지워, 다음 계정이 또 claim 하지 않게 한다.
    const legacyRaw = storage.getItem(CLASS_ENROLLMENT_STORAGE_KEY);
    const legacy = parseClassEnrollments(legacyRaw);
    if (legacyRaw !== null && storage.setItem && storage.removeItem) {
      try {
        storage.setItem(classEnrollmentStorageKey(ownerKey), legacyRaw);
        storage.removeItem(CLASS_ENROLLMENT_STORAGE_KEY);
      } catch {
        // 이관 쓰기가 실패해도 읽은 값은 그대로 돌려준다.
      }
    }
    return legacy;
  } catch {
    return emptyClassEnrollments();
  }
}

export function saveClassEnrollments(
  storage: Pick<Storage, "setItem"> | null,
  state: ClassEnrollmentState,
  ownerKey?: string,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(classEnrollmentStorageKey(ownerKey), JSON.stringify(parseClassEnrollments(JSON.stringify(state))));
    return true;
  } catch {
    return false;
  }
}

export function getActiveEnrollment(state: ClassEnrollmentState, classId: string): ClassEnrollment | null {
  const enrollment = state.enrollments[classId];
  return enrollment?.status === "enrolled" ? enrollment : null;
}

/** 수강 등록 — 이미 등록된 클래스는 최초 등록 시각을 유지한다. */
export function enrollClass(
  state: ClassEnrollmentState,
  classId: string,
  input: { now: string; spendEventId?: string | null; pointPricePaid?: number },
): ClassEnrollmentState {
  if (!PRODUCT_BY_ID.has(classId)) return state;
  const existing = state.enrollments[classId];
  if (existing?.status === "enrolled") return state;
  return {
    ...state,
    enrollments: {
      ...state.enrollments,
      [classId]: {
        classId,
        status: "enrolled",
        enrolledAt: existing?.enrolledAt || input.now,
        updatedAt: input.now,
        spendEventId: input.spendEventId ?? null,
        pointPricePaid: input.pointPricePaid ?? 0,
      },
    },
  };
}

export function cancelEnrollment(state: ClassEnrollmentState, classId: string, now: string): ClassEnrollmentState {
  const existing = state.enrollments[classId];
  if (!existing || existing.status !== "enrolled") return state;
  return {
    ...state,
    enrollments: {
      ...state.enrollments,
      [classId]: { ...existing, status: "cancelled", updatedAt: now },
    },
  };
}

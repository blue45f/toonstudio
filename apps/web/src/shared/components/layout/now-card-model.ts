/**
 * "지금 할 일"(NowCard) 데이터 계약 + 도출 규칙 — 순수 함수 모듈 (BLUEPRINT §3.2).
 *
 * 표면은 신호(signals)만 모아 이 모듈에 넘기고, 카드는 최대 1개만 돌려받는다.
 * 표면마다 우선순위를 재구현하지 않는 것이 이 모듈의 존재 이유다(S3-5 확산의 전제).
 * React·라우터·저장소에 닿지 않으므로 규칙별로 단위 테스트가 가능하다
 * (now-card-model.test.ts).
 *
 * 우선순위 (BLUEPRINT §3.2 고정 순서 — 바꾸려면 청사진부터 고친다):
 *   ① 막힌 일: 저장 실패 → 검수 필수 핀 → 게시 검사 실패
 *   ② 진행 중 회차의 다음 단계 (작업공간 홈에서는 "이어하기"가 이 자리)
 *   ③ 마감이 가까운 일정 (NOW_CARD_DEADLINE_WINDOW_DAYS 이내만)
 *   ④ 추천 학습/소재 (콘텐츠라 제목·근거는 추천자가 지역화해 넘긴다)
 * 신호가 undefined/null이면 "없음"이 아니라 "판정 불가"다 — 없는 셈 치고
 * 다음 규칙으로 넘어가되, 상태를 지어내지 않는다(단계 모델의 unknown과 같은 원칙).
 *
 * 빈 상태·전부 완료 상태도 계약의 일부다: 작품이 없으면 "start",
 * 작품이 있는데 걸린 일이 없으면 "all-clear"(청사진 표준 문형)를 돌려준다.
 * 작품이 없으면 추천(④)보다 빈 상태(start)가 먼저다 — 첫 작품이 없는
 * 사용자에게 추천은 다음 행동이 될 수 없다.
 */
import type { NowCardTone } from "./NowCard";

export type { NowCardTone };

/** 도출 규칙 식별자 — 어떤 규칙이 카드를 만들었는지 테스트·계측이 고정한다. */
export type NowCardRuleId =
  | "blocked-storage"
  | "blocked-review"
  | "blocked-publish"
  | "resume"
  | "deadline"
  | "recommend"
  | "start"
  | "all-clear";

/** 우선순위 선언 — deriveNowCard의 평가 순서와 항상 같아야 한다(테스트 고정). */
export const NOW_CARD_RULE_PRIORITY: readonly NowCardRuleId[] = Object.freeze([
  "blocked-storage",
  "blocked-review",
  "blocked-publish",
  "resume",
  "deadline",
  "recommend",
  "start",
  "all-clear",
]);

/** ③ 규칙이 발화하는 마감 창 — 이보다 먼 일정은 "지금 할 일"이 아니다. */
export const NOW_CARD_DEADLINE_WINDOW_DAYS = 3;

/** (ko, en) => 현재 언어 문자열 — useBilingual/ProductionLocalize와 같은 규약. */
export type NowCardLocalize = (ko: string, en: string) => string;

/**
 * 표면이 모아 넘기는 신호. 전부 "읽기 전용 스냅샷"이며, 도출은 부수효과가 없다.
 * href는 표면이 자기 라우팅 규칙(맥락 파라미터 포함)으로 만들어 넘긴다 —
 * 이 모듈은 경로를 지어내지 않는다.
 */
export interface NowCardSignals {
  /** ① 저장 실패/저장 정보를 읽지 못함. 표면에 복구 구역이 따로 있으면 넘기지 않는다(중복 공지 방지). */
  readonly storageBlocked?: { readonly href: string } | null;
  /** ① 검수 필수 핀 — 0이면 막힌 일이 없는 것이고, null/undefined면 판정 불가. */
  readonly reviewBlocked?: { readonly pinCount: number; readonly href: string } | null;
  /** ① 게시 검사 실패 — 의미는 reviewBlocked와 같다. */
  readonly publishBlocked?: { readonly failureCount: number; readonly href: string } | null;
  /**
   * ② 이어하기/진행 중 회차의 다음 단계. summary·progress는 호출자가 이미
   * 지역화한 한 줄이다(이어하기 요약은 저장소 어댑터가 언어를 알고 만든다).
   */
  readonly resume?: {
    readonly href: string;
    readonly projectTitle: string;
    readonly summary: string | null;
    readonly progress?: string | null;
  } | null;
  /** ③ 가장 가까운 일정 하나만. daysUntil은 표면이 오늘 기준으로 계산해 넘긴다. */
  readonly deadline?: { readonly href: string; readonly label: string; readonly daysUntil: number } | null;
  /** ④ 추천 콘텐츠 — 제목·근거 문장은 추천자가 지역화해 넘긴다. */
  readonly recommendation?: { readonly href: string; readonly title: string; readonly reason: string } | null;
  /** 작품이 하나라도 있는가 — start(빈 상태)와 all-clear를 가르는 기준. */
  readonly hasProject: boolean;
  /** start 카드의 행동 경로 (예: "/studio/new"). */
  readonly startHref: string;
  /** all-clear 카드의 행동 경로 (예: 회차 목록). */
  readonly allClearHref: string;
}

/**
 * §3.2 데이터 계약의 직렬화 가능한 형태 — NowCard 컴포넌트의 표시 props와 달리
 * 문자열·경로만 들고 있어, 도출 결과를 테스트·로그·다른 표면과 그대로 주고받는다.
 * `reason`(근거 문장)은 모든 규칙에서 필수다: "왜 이 카드인가"를 말할 수 없는
 * 카드는 만들지 않는다(청사진 §3.2 — 잘못 도출된 카드는 신뢰를 깎는다).
 */
export interface DerivedNowCard {
  readonly ruleId: NowCardRuleId;
  readonly tone: NowCardTone;
  /** 다음 행동 한 문장. */
  readonly title: string;
  /** 왜 지금인지 한 줄 — 근거 문장. 빈 문자열인 카드는 존재하지 않는다. */
  readonly reason: string;
  /** 대상 표면으로 가는 행동 — 최대 1개. */
  readonly actionLabel: string;
  readonly href: string;
  /** 진척 한 줄 (선택). */
  readonly progress?: string;
  /** 닫기 가능 여부. 막힌 일(①)과 빈 상태(start)는 닫을 수 없다. */
  readonly dismissible: boolean;
}

/**
 * 신호에서 "지금 할 일" 카드 하나를 도출한다. 돌려주는 값은 항상 0개(null) 또는
 * 1개다 — 표면당 카드 1개 원칙은 이 반환형이 강제한다.
 * null인 경우: 판정에 필요한 최소 신호(start/all-clear 경로)는 항상 있으므로
 * 실제로는 신호 객체가 있을 때 null이 되지 않지만, 반환형은 "있을 때만 표시"
 * (§3.1 슬롯 규칙)를 타입으로 남겨 둔다.
 */
export function deriveNowCard(signals: NowCardSignals, localize: NowCardLocalize): DerivedNowCard | null {
  const bt = localize;

  // ① 막힌 일 — 세부 순서는 데이터 안전(저장) → 협업 차단(검수 핀) → 공개 차단(게시 검사).
  if (signals.storageBlocked) {
    return {
      ruleId: "blocked-storage",
      tone: "danger",
      title: bt("저장 공간을 먼저 확인해 주세요", "Check storage first"),
      reason: bt(
        "저장 정보를 읽지 못해 이어갈 위치를 정할 수 없어요. 원고는 변경하지 않았습니다.",
        "Storage could not be read, so there is no safe place to resume. Your work has not been changed.",
      ),
      actionLabel: bt("저장 공간 확인", "Check storage"),
      href: signals.storageBlocked.href,
      dismissible: false,
    };
  }
  if (signals.reviewBlocked && signals.reviewBlocked.pinCount > 0) {
    const { pinCount, href } = signals.reviewBlocked;
    return {
      ruleId: "blocked-review",
      tone: "danger",
      title: bt(`답을 기다리는 필수 검수 핀 ${pinCount}개`, `${pinCount} required review pins waiting for an answer`),
      reason: bt(
        "필수 핀이 풀려야 다음 단계로 넘어갈 수 있어요.",
        "Required pins must be resolved before the work can move to the next step.",
      ),
      actionLabel: bt("검수 열기", "Open review"),
      href,
      dismissible: false,
    };
  }
  if (signals.publishBlocked && signals.publishBlocked.failureCount > 0) {
    const { failureCount, href } = signals.publishBlocked;
    return {
      ruleId: "blocked-publish",
      tone: "danger",
      title: bt(`게시 검사를 통과하지 못한 항목 ${failureCount}개`, `${failureCount} items failed the publish check`),
      reason: bt(
        "검사 실패 항목이 공개를 막고 있어요. 고치면 바로 다시 검사할 수 있어요.",
        "Failed checks are blocking publishing. Fix them and the check can run again right away.",
      ),
      actionLabel: bt("게시 검사 확인", "Review publish checks"),
      href,
      dismissible: false,
    };
  }

  // ② 진행 중 회차의 다음 단계 — 작업공간 홈에서는 저장된 이어하기 위치가 그 신호다.
  if (signals.resume) {
    const { href, projectTitle, summary, progress } = signals.resume;
    return {
      ruleId: "resume",
      tone: "default",
      title: bt("하던 작업 이어하기", "Pick up where you left off"),
      reason: summary ?? bt(
        `${projectTitle}에서 멈춘 위치가 저장돼 있어요.`,
        `Your place in ${projectTitle} is saved.`,
      ),
      actionLabel: bt("이어서 작업", "Resume work"),
      href,
      ...(progress ? { progress } : {}),
      dismissible: false,
    };
  }

  // ③ 마감이 가까운 일정 — 창(3일) 밖 일정은 지금 할 일이 아니다.
  if (signals.deadline && signals.deadline.daysUntil <= NOW_CARD_DEADLINE_WINDOW_DAYS) {
    const { href, label, daysUntil } = signals.deadline;
    return {
      ruleId: "deadline",
      tone: daysUntil < 0 ? "danger" : "warning",
      title: daysUntil < 0
        ? bt(`${label} 마감이 지났어요`, `${label} is past its deadline`)
        : daysUntil === 0
          ? bt(`${label} 마감이 오늘이에요`, `${label} is due today`)
          : bt(`${label} 마감까지 ${daysUntil}일 남았어요`, `${label} is due in ${daysUntil} days`),
      reason: bt(
        "마감이 가까운 일정부터 끝내면 게시 흐름이 밀리지 않아요.",
        "Finishing the closest deadline first keeps the publishing flow on track.",
      ),
      actionLabel: bt("일정 확인하기", "Check the schedule"),
      href,
      dismissible: false,
    };
  }

  // 빈 상태 — 작품이 없으면 추천보다 첫 작품 시작이 다음 행동이다.
  if (!signals.hasProject) {
    return {
      ruleId: "start",
      tone: "default",
      title: bt("첫 작품을 시작해 보세요", "Start your first work"),
      reason: bt(
        "아직 만든 작품이 없어요. 형식을 고르면 바로 첫 회차를 준비할 수 있어요.",
        "You have no works yet. Choose a format and you can prepare the first episode right away.",
      ),
      actionLabel: bt("새 작품 만들기", "Create a new work"),
      href: signals.startHref,
      dismissible: false,
    };
  }

  // ④ 추천 학습/소재 — 걸린 일·이어할 일·가까운 마감이 없을 때만.
  if (signals.recommendation) {
    return {
      ruleId: "recommend",
      tone: "default",
      title: signals.recommendation.title,
      reason: signals.recommendation.reason,
      actionLabel: bt("보러 가기", "Take a look"),
      href: signals.recommendation.href,
      dismissible: true,
    };
  }

  // 전부 완료 — 청사진 §3.2 표준 문형.
  return {
    ruleId: "all-clear",
    tone: "success",
    title: bt("지금 막힌 일은 없어요. 다음 회차를 시작할까요?", "Nothing is blocked. Start the next episode?"),
    reason: bt(
      "막힌 일도, 가까운 마감도 없어요.",
      "There are no blockers and no close deadlines.",
    ),
    actionLabel: bt("다음 회차 시작", "Start the next episode"),
    href: signals.allClearHref,
    dismissible: true,
  };
}

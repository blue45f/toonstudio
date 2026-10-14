/**
 * studio-publish-verdict — 첫 게시(또는 투고·챌린지 제출) 후 "판정 가시화" 순수 모델.
 *
 * 배경 (근거 2건):
 * - 한겨레 지망생 이탈 기획: 창작 지망생의 이탈은 판정을 받는 순간이 아니라
 *   피드백이 끊기는 구간에서 발생한다. 제출 뒤 "지금 어떤 상태인지, 다음
 *   피드백·판단은 언제인지"가 보이지 않으면 사용자는 조용히 떠난다.
 * - 네이버웹툰 3단 리그(도전만화→베스트도전→정식연재) 분석: 단계가 나뉜
 *   리그가 작동하는 이유는 각 단계의 상태와 다음 단계로 가는 조건·시점이
 *   제출자에게 계속 보이기 때문이다.
 *
 * 이 모듈이 고정하는 계약 ("반드시 표시"):
 * 1. 현재 상태는 항상 하나로 표시된다: 검토 중(in-review) / 통과(passed) /
 *    보완 필요(needs-revision) / 종료(closed).
 * 2. 판정 전(검토 중)이면 다음 피드백·판단 시점을 반드시 표시한다. 시점 결정
 *    순서는 ① 명시된 nextFeedbackAt ② 챌린지·학습 기간 상한(periodEnd —
 *    기간 종료가 곧 판정 시점) ③ 제출 시각 + 피드백 보장 기간
 *    (feedbackWindowDays, 기본 DEFAULT_FEEDBACK_WINDOW_DAYS일). 제출 시각조차
 *    해석할 수 없으면 시점 미정 문구로라도 표시한다 — 빈칸으로 두지 않는다.
 * 3. 판정이 끝난 상태(통과·보완·종료)면 클로징 메시지를 반드시 표시한다.
 *    호출자가 closingMessage를 주지 않으면 상태별 기본 클로징을 쓴다.
 * 4. 학습·챌린지 과제는 상한(회차 상한·기간)을 처음부터 표시한다
 *    (capsLabel). 그리고 중단·종료와 무관하게 결과물이 포트폴리오에 남는다는
 *    안내(portfolioNote)를 챌린지·학습에서는 항상, 그 외 종결 상태에서는
 *    클로징 메시지가 대신한다.
 *
 * 날짜 표기는 Asia/Seoul 기준 "2026년 10월 21일(수)" 형식으로 고정한다 —
 * 서버 ISO 시각을 사용자 시간대로 보여야 "언제까지"가 의미를 갖는다.
 */

export type PublishVerdictKind = "publish" | "submission" | "challenge" | "learning";

export type PublishVerdictStatus = "in-review" | "passed" | "needs-revision" | "closed";

/** 피드백 보장 기간 기본값(일). 명시 시점도 기간 상한도 없을 때의 최후 산출 근거. */
export const DEFAULT_FEEDBACK_WINDOW_DAYS = 7;

export interface PublishVerdictCaps {
  /** 제출할 수 있는 총 회차 상한. 없으면 null. */
  readonly maxEpisodes?: number | null;
  /** 지금까지 제출한 회차 수. 없으면 null. */
  readonly completedEpisodes?: number | null;
  /** 과제·챌린지 기간 시작(ISO). 없으면 null. */
  readonly periodStart?: string | null;
  /** 과제·챌린지 기간 종료(ISO) — 판정 시점의 기본값이기도 하다. */
  readonly periodEnd?: string | null;
}

export interface PublishVerdictInput {
  readonly kind: PublishVerdictKind;
  readonly status: PublishVerdictStatus;
  /** 제출·게시 시각(ISO). */
  readonly submittedAt: string;
  /** 다음 피드백·판단 예정 시각(ISO). 알면 명시한다. */
  readonly nextFeedbackAt?: string | null;
  /** 피드백 보장 기간(일). 미지정 시 DEFAULT_FEEDBACK_WINDOW_DAYS. */
  readonly feedbackWindowDays?: number | null;
  /** 종결 시 클로징 메시지. 없으면 상태별 기본값을 쓴다. */
  readonly closingMessage?: string | null;
  /** 학습·챌린지 상한. 일반 게시에는 없을 수 있다. */
  readonly caps?: PublishVerdictCaps | null;
  /** 포트폴리오로 가는 경로. 있으면 카드가 링크를 단다. */
  readonly portfolioHref?: string | null;
}

export interface PublishVerdictView {
  readonly status: PublishVerdictStatus;
  /** 판정이 끝난 상태(통과·보완·종료)인가. */
  readonly terminal: boolean;
  /** 상태 한 줄 라벨: "검토 중" | "통과" | "보완 필요" | "종료". */
  readonly statusLabel: string;
  /** 상태 설명 한 줄. */
  readonly headline: string;
  /** 산출된 다음 피드백·판단 시점(ISO). 검토 중이 아닐 때와 산출 불가 시 null. */
  readonly nextFeedbackAt: string | null;
  /** 시점이 지났는데 아직 검토 중이면 true — 지연 안내를 함께 표시한다. */
  readonly nextFeedbackOverdue: boolean;
  /** "다음 피드백·판단 시점: …" 전체 문구. 검토 중이면 항상 non-null, 종결이면 null. */
  readonly nextFeedbackLabel: string | null;
  /** 종결 상태의 클로징 메시지. 종결이면 항상 non-null, 검토 중이면 null. */
  readonly closingMessage: string | null;
  /** "총 12화까지 · 지금까지 3화 제출 · 기간 …" 상한 문구. 상한이 없으면 null. */
  readonly capsLabel: string | null;
  /** 포트폴리오 보존 안내. 챌린지·학습이면 항상 non-null. */
  readonly portfolioNote: string | null;
  readonly portfolioHref: string | null;
}

const STATUS_LABELS: Record<PublishVerdictStatus, string> = {
  "in-review": "검토 중",
  passed: "통과",
  "needs-revision": "보완 필요",
  closed: "종료",
};

const KIND_SUBJECTS: Record<PublishVerdictKind, string> = {
  publish: "게시",
  submission: "투고",
  challenge: "챌린지 제출",
  learning: "학습 과제 제출",
};

const DEFAULT_CLOSING_MESSAGES: Record<Exclude<PublishVerdictStatus, "in-review">, string> = {
  passed:
    "판정이 끝났습니다. 통과를 축하합니다 — 이번 결과물은 포트폴리오에 등록돼 다음 기회의 근거가 됩니다.",
  "needs-revision":
    "보완 요청으로 이번 판정이 마무리됐습니다. 지적된 부분을 고쳐 다시 제출하면 새 판정 주기가 시작됩니다. 기존 제출물은 포트폴리오에 그대로 남습니다.",
  closed:
    "이번 회차는 종료됐습니다. 참여해 주셔서 감사합니다. 제출한 결과물은 삭제되지 않고 포트폴리오에 그대로 남습니다.",
};

export const PUBLISH_VERDICT_PORTFOLIO_NOTE =
  "중단하거나 종료돼도 지금까지 만든 결과물은 포트폴리오에 그대로 남습니다.";

const verdictDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

/** ISO → "2026년 10월 21일(수)". 해석할 수 없으면 null. */
export function formatPublishVerdictDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  return verdictDateFormatter.format(new Date(time));
}

function resolveNextFeedbackAt(input: PublishVerdictInput): string | null {
  const explicit = input.nextFeedbackAt;
  if (explicit && Number.isFinite(Date.parse(explicit))) return explicit;
  const periodEnd = input.caps?.periodEnd;
  if (periodEnd && Number.isFinite(Date.parse(periodEnd))) return periodEnd;
  const submitted = Date.parse(input.submittedAt);
  if (!Number.isFinite(submitted)) return null;
  const windowDays =
    typeof input.feedbackWindowDays === "number" && input.feedbackWindowDays > 0
      ? input.feedbackWindowDays
      : DEFAULT_FEEDBACK_WINDOW_DAYS;
  return new Date(submitted + windowDays * 86_400_000).toISOString();
}

function resolveCapsLabel(caps: PublishVerdictCaps | null | undefined): string | null {
  if (!caps) return null;
  const parts: string[] = [];
  if (typeof caps.maxEpisodes === "number" && caps.maxEpisodes > 0) {
    parts.push(`총 ${caps.maxEpisodes}화까지 제출할 수 있어요`);
  }
  if (typeof caps.completedEpisodes === "number" && caps.completedEpisodes >= 0) {
    parts.push(`지금까지 ${caps.completedEpisodes}화 제출`);
  }
  const start = formatPublishVerdictDate(caps.periodStart);
  const end = formatPublishVerdictDate(caps.periodEnd);
  if (start && end) parts.push(`기간 ${start} ~ ${end}`);
  else if (end) parts.push(`마감 ${end}`);
  else if (start) parts.push(`${start}부터 시작`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function resolvePublishVerdictView(
  input: PublishVerdictInput,
  now: Date = new Date(),
): PublishVerdictView {
  const terminal = input.status !== "in-review";
  const subject = KIND_SUBJECTS[input.kind];
  const statusLabel = STATUS_LABELS[input.status];

  const headline = terminal
    ? input.status === "passed"
      ? `${subject} 판정이 끝났습니다 — 통과했어요.`
      : input.status === "needs-revision"
        ? `${subject} 판정이 끝났습니다 — 보완이 필요해요.`
        : `${subject} 흐름이 종료됐습니다.`
    : `${subject}이 접수됐고 판정을 기다리고 있어요.`;

  let nextFeedbackAt: string | null = null;
  let nextFeedbackOverdue = false;
  let nextFeedbackLabel: string | null = null;
  if (!terminal) {
    nextFeedbackAt = resolveNextFeedbackAt(input);
    const formatted = formatPublishVerdictDate(nextFeedbackAt);
    if (nextFeedbackAt && formatted) {
      nextFeedbackOverdue = Date.parse(nextFeedbackAt) < now.getTime();
      nextFeedbackLabel = nextFeedbackOverdue
        ? `다음 피드백·판단 시점: ${formatted}까지였어요. 예정보다 늦어지고 있어 새 시점이 확정되는 대로 알려드립니다.`
        : `다음 피드백·판단 시점: ${formatted}까지`;
    } else {
      // 시점을 산출할 재료가 없어도 빈칸으로 두지 않는다 — 단절 구간을 만들지 않는 것이 계약이다.
      nextFeedbackLabel =
        "다음 피드백·판단 시점은 정해지는 대로 이 화면에 바로 표시됩니다. 그 전에는 접수 상태가 그대로 유지됩니다.";
    }
  }

  const closingMessage = terminal
    ? input.closingMessage?.trim()
      ? input.closingMessage
      : DEFAULT_CLOSING_MESSAGES[input.status as Exclude<PublishVerdictStatus, "in-review">]
    : null;

  return {
    status: input.status,
    terminal,
    statusLabel,
    headline,
    nextFeedbackAt,
    nextFeedbackOverdue,
    nextFeedbackLabel,
    closingMessage,
    capsLabel: resolveCapsLabel(input.caps),
    portfolioNote:
      input.kind === "challenge" || input.kind === "learning"
        ? PUBLISH_VERDICT_PORTFOLIO_NOTE
        : null,
    portfolioHref: input.portfolioHref ?? null,
  };
}

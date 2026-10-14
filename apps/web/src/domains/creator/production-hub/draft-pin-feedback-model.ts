/**
 * 초안 핀 피드백 — 순수 모델 (실제 사례 흡수: We-toon 피드백 3요소).
 *
 * 근거: Ko et al., We-toon (ACM UIST '22) — 글 작가는 그림 실력이 없어
 * 의도를 말과 인터넷 레퍼런스로만 전해야 했고, 그 모호함이 캐릭터
 * 디자인·초안 수정 단계의 왕복을 폭발시켰다. 해법으로 도출된 것이
 * 피드백 3요소 패킷이다: 무엇을(설명) + 어디를(영역 표시) + 어떻게
 * (레퍼런스). 이 모델은 그 패킷을 초안 단계 피드백의 기본 동선으로
 * 강제·안내한다:
 *
 * - 콘티·스케치 같은 "그림이 있는 초안" 단계에서는 핀이 기본이다
 *   (pin-first). 핀 없는 텍스트 피드백은 그 단계에서 제출할 수 없고,
 *   무엇이 빠졌는지 안내가 돌아간다.
 * - 기획처럼 그림이 아직 없는 단계와 식자·검수 이후 단계에서는
 *   핀을 권하되 텍스트도 받는다 (pin-or-text).
 * - 단계 합의 게이트의 반려 판정도 같은 패킷으로 평가할 수 있게
 *   변환 함수를 둔다 — 게이트 사유(무엇을) + 핀(어디를)이 한 몸이다.
 *
 * 핀 자체의 저장·앵커 규칙은 원고 핀 모델(manuscript-pin-feedback-model)이
 * 정본이다. 이 모델은 패킷의 완성도만 판정한다.
 */
import type { BilingualLabel } from "./production-labels";
import type { EpisodeStageId } from "./production-project-surfaces";
import type { StageGateDecision } from "./stage-consensus-gate-model";

/**
 * 피드백 채널 정책.
 * - pin-first: 그림 위 핀이 있어야 제출할 수 있다 (콘티·스케치 초안).
 * - pin-or-text: 텍스트만으로도 되지만 핀을 권한다.
 */
export type DraftFeedbackChannel = "pin-first" | "pin-or-text";

/**
 * 단계별 채널. 작화(art)는 스케치 초안이 그림으로 존재하는 단계라
 * pin-first다. 기획(plan)은 아직 그림이 없어 텍스트가 본문이다.
 */
export function draftFeedbackChannelForStage(stageId: EpisodeStageId): DraftFeedbackChannel {
  switch (stageId) {
    case "storyboard":
    case "art":
      return "pin-first";
    default:
      return "pin-or-text";
  }
}

/** 피드백 패킷 — 무엇을 + 어디를 + 어떻게. */
export interface PinFeedbackPacket {
  /** 무엇을 고칠 것인가 (설명 본문). */
  readonly body: string;
  /** 어디를 — 원고/비교 화면의 핀 스레드. 없으면 null. */
  readonly pinThreadId: string | null;
  /** 어떻게 — 참고할 레퍼런스 에셋 ID들. */
  readonly referenceAssetIds: readonly string[];
}

export type PinFeedbackMissing = "body" | "pin" | "reference";

export interface PinFeedbackEvaluation {
  readonly channel: DraftFeedbackChannel;
  readonly missing: readonly PinFeedbackMissing[];
  /** 이 패킷을 이 단계의 피드백으로 제출할 수 있는가. */
  readonly submittable: boolean;
  /** 빠진 요소를 채우라는 안내. 빠진 게 없으면 빈 배열. */
  readonly guidance: readonly BilingualLabel[];
}

const GUIDANCE: Readonly<Record<PinFeedbackMissing, BilingualLabel>> = Object.freeze({
  body: {
    ko: "무엇을 고칠지 한 줄이라도 적어 주세요.",
    en: "Write at least one line about what should change.",
  },
  pin: {
    ko: "고칠 곳을 그림 위에 핀으로 찍어 주세요. 말로만 설명하면 서로 다른 그림을 떠올려요.",
    en: "Pin the spot on the artwork. Words alone make each person picture a different drawing.",
  },
  reference: {
    ko: "원하는 느낌의 레퍼런스를 하나 붙이면 왕복이 줄어요.",
    en: "Attaching one reference for the intended feel cuts the round trips.",
  },
});

/**
 * 패킷을 단계 정책으로 평가한다.
 * - 본문은 어느 단계에서나 필수다.
 * - 핀은 pin-first 단계에서 필수, pin-or-text에서는 권장(빠져도 제출 가능,
 *   안내만 붙는다).
 * - 레퍼런스는 항상 권장이다 (필수로 만들면 레퍼런스가 없는 정당한
 *   피드백까지 막히므로).
 */
export function evaluatePinFeedbackPacket(
  packet: PinFeedbackPacket,
  stageId: EpisodeStageId,
): PinFeedbackEvaluation {
  const channel = draftFeedbackChannelForStage(stageId);
  const missing: PinFeedbackMissing[] = [];
  if (packet.body.trim().length === 0) missing.push("body");
  if (!packet.pinThreadId) missing.push("pin");
  if (packet.referenceAssetIds.length === 0) missing.push("reference");
  const blockingMissing = missing.filter(
    (item) => item === "body" || (item === "pin" && channel === "pin-first"),
  );
  return {
    channel,
    missing,
    submittable: blockingMissing.length === 0,
    guidance: missing.map((item) => GUIDANCE[item]),
  };
}

/**
 * 단계 합의 게이트의 반려 판정을 같은 패킷으로 읽는다.
 * 사유 = 무엇을, 판정에 붙은 첫 핀 = 어디를. 레퍼런스는 판정 구조에
 * 없어 비워 둔다(없다고 지어내지 않는다) — 그래서 게이트 반려의
 * 평가는 항상 reference 안내를 포함할 수 있다.
 */
export function pinFeedbackPacketFromGateDecision(decision: StageGateDecision): PinFeedbackPacket {
  return {
    body: decision.reason,
    pinThreadId: decision.pinThreadIds[0] ?? null,
    referenceAssetIds: [],
  };
}

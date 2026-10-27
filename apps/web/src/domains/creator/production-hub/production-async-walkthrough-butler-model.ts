/**
 * Loom (`_next/static/chunks/1099-dbd630713de58a43.js`, `4322-d8a744eca483ca65.js` — 비동기 캔버스·음성 타임스탬프 워크스루 & 액션 핀) +
 * Trello (`ev_3aaa6e525b67b1208fd87971a1f3d1a070a2108d15f6969d18080f257ed64fcf` — Butler 규칙 기반 공정 카드 자동 이동 및 체크리스트 게이트)
 * 역공학 내재화 순수 도메인 모델.
 */

export type WalkthroughPinSeverity = "blocker" | "polish" | "praise";

export type ButlerRuleTriggerMode =
  | "auto-advance-on-zero-blocker"
  | "strict-all-pins-resolved"
  | "manual-pd-gate";

export interface AsyncWalkthroughClipPin {
  readonly pinId: string;
  readonly timestampLabel: string;
  readonly timestampSec: number;
  readonly cutNumber: number;
  readonly targetLayerKo: string;
  readonly targetLayerEn: string;
  readonly authorRoleKo: string;
  readonly authorRoleEn: string;
  readonly noteKo: string;
  readonly noteEn: string;
  readonly severity: WalkthroughPinSeverity;
  readonly resolved: boolean;
}

export interface AsyncWalkthroughButlerInput {
  readonly clipCode: string;
  readonly fromStageKo: string;
  readonly toStageKo: string;
  readonly butlerMode: ButlerRuleTriggerMode;
  readonly autoNotifyNextAssignee: boolean;
  readonly autoUnlockMilestoneHold: boolean;
  readonly pins: readonly AsyncWalkthroughClipPin[];
}

export type ButlerTriggerExecutionState =
  | "triggered_card_moved"
  | "waiting_on_blockers"
  | "waiting_on_polish_pins"
  | "manual_pd_hold";

export interface AsyncWalkthroughButlerEvaluation {
  readonly clipCode: string;
  readonly totalPins: number;
  readonly resolvedPins: number;
  readonly unresolvedBlockerCount: number;
  readonly unresolvedPolishCount: number;
  readonly completionRatioPct: number;
  readonly butlerTriggerState: ButlerTriggerExecutionState;
  readonly cardMovedToNextStage: boolean;
  readonly assigneePinged: boolean;
  readonly milestoneTrancheUnlocked: boolean;
  readonly summaryBannerKo: string;
  readonly summaryBannerEn: string;
}

export const DEFAULT_WALKTHROUGH_PINS: readonly AsyncWalkthroughClipPin[] = Object.freeze([
  {
    pinId: "loom-pin-01",
    timestampLabel: "00:18",
    timestampSec: 18,
    cutNumber: 14,
    targetLayerKo: "선화·외곽 펜선 (layer:p1:ink)",
    targetLayerEn: "Line Art (layer:p1:ink)",
    authorRoleKo: "총괄 연출 PD",
    authorRoleEn: "Chief Director PD",
    noteKo: "14컷 주인공 역광 클로즈업 턱선 펜선 두께를 12px→7px로 줄여 채색 림라이트가 먹히게 조정",
    noteEn: "Slim chin contour ink from 12px to 7px on Cut 14 backlit closeup for rim light",
    severity: "blocker",
    resolved: false,
  },
  {
    pinId: "loom-pin-02",
    timestampLabel: "00:47",
    timestampSec: 47,
    cutNumber: 22,
    targetLayerKo: "명암·림라이트 (layer:p1:shade)",
    targetLayerEn: "Shading & Rim Light (layer:p1:shade)",
    authorRoleKo: "메인 채색 팀장",
    authorRoleEn: "Lead Colorist",
    noteKo: "22컷 마법진 반사광(Color Dodge 35%) 색온도를 배경 3D 라이팅(#38BDF8)과 일치시킬 것",
    noteEn: "Match Cut 22 magic circle bounce light (Color Dodge 35%) with 3D bg light (#38BDF8)",
    severity: "polish",
    resolved: false,
  },
  {
    pinId: "loom-pin-03",
    timestampLabel: "01:19",
    timestampSec: 79,
    cutNumber: 29,
    targetLayerKo: "식자·말풍선 (layer:p1:lettering)",
    targetLayerEn: "Lettering & Balloons (layer:p1:lettering)",
    authorRoleKo: "수석 식자 디자이너",
    authorRoleEn: "Lead Letterer",
    noteKo: "29컷 독백 나레이션 박스 여백 및 캐릭터 시선 유도 배치 완벽함 (그대로 유지)",
    noteEn: "Cut 29 monologue box margin and eye-tracking flow are spot-on (keep as is)",
    severity: "praise",
    resolved: true,
  },
]);

export function evaluateAsyncWalkthroughButler(
  input: AsyncWalkthroughButlerInput,
): AsyncWalkthroughButlerEvaluation {
  const safeClipCode = input.clipCode.trim() || "LOOM-EP12-REV3";
  const totalPins = input.pins.length;
  const resolvedPins = input.pins.filter((pin) => pin.resolved).length;
  const unresolvedBlockerCount = input.pins.filter(
    (pin) => pin.severity === "blocker" && !pin.resolved,
  ).length;
  const unresolvedPolishCount = input.pins.filter(
    (pin) => pin.severity === "polish" && !pin.resolved,
  ).length;

  const completionRatioPct =
    totalPins === 0 ? 100 : Math.round((resolvedPins / totalPins) * 100);

  let butlerTriggerState: ButlerTriggerExecutionState;
  if (unresolvedBlockerCount > 0) {
    butlerTriggerState = "waiting_on_blockers";
  } else if (
    input.butlerMode === "strict-all-pins-resolved" &&
    unresolvedPolishCount > 0
  ) {
    butlerTriggerState = "waiting_on_polish_pins";
  } else if (input.butlerMode === "manual-pd-gate") {
    butlerTriggerState = "manual_pd_hold";
  } else {
    butlerTriggerState = "triggered_card_moved";
  }

  const cardMovedToNextStage = butlerTriggerState === "triggered_card_moved";
  const assigneePinged = cardMovedToNextStage && input.autoNotifyNextAssignee;
  const milestoneTrancheUnlocked =
    cardMovedToNextStage && input.autoUnlockMilestoneHold;

  let summaryBannerKo: string;
  let summaryBannerEn: string;

  if (butlerTriggerState === "waiting_on_blockers") {
    summaryBannerKo = `Trello Butler 대기: Loom 워크스루(${safeClipCode}) 내 미해결 블로커 핀 ${unresolvedBlockerCount}건이 남아 있어 [${input.fromStageKo} → ${input.toStageKo}] 자동 카드 이동이 차단되었습니다.`;
    summaryBannerEn = `Trello Butler Hold: ${unresolvedBlockerCount} unresolved blocker pin(s) in Loom clip (${safeClipCode}) block automatic [${input.fromStageKo} → ${input.toStageKo}] card transition.`;
  } else if (butlerTriggerState === "waiting_on_polish_pins") {
    summaryBannerKo = `Trello Butler 대기(엄격 모드): 블로커는 해소되었으나 세부 보정(Polish) 핀 ${unresolvedPolishCount}건이 남아 있어 전량 체크 완료 시 다음 공정으로 이동합니다.`;
    summaryBannerEn = `Trello Butler Hold (Strict Mode): Blockers cleared, waiting on ${unresolvedPolishCount} polish pin(s) before stage transition.`;
  } else if (butlerTriggerState === "manual_pd_hold") {
    summaryBannerKo = `수동 PD 게이트 대기: 모든 타임스탬프 핀 조건이 충족되었으며(${completionRatioPct}%), PD 최종 승인 시 [${input.toStageKo}] 보드로 이동합니다.`;
    summaryBannerEn = `Manual PD Gate Hold: Timestamp pins satisfied (${completionRatioPct}%); awaiting manual PD sign-off to move to [${input.toStageKo}].`;
  } else {
    summaryBannerKo = `Trello Butler 자동 실행 완료: [${input.fromStageKo} → ${input.toStageKo}] 공정 카드 자동 이동됨 · ${assigneePinged ? "후행 담당자 슬랙/앱 멘션 발송" : "멘션 생략"} · ${milestoneTrancheUnlocked ? "에스크로 단계 정산금 해금 승인" : "정산 수동 유지"}`;
    summaryBannerEn = `Trello Butler Executed: Card moved [${input.fromStageKo} → ${input.toStageKo}] · ${assigneePinged ? "Next assignee pinged" : "No ping"} · ${milestoneTrancheUnlocked ? "Milestone tranche unlocked" : "Manual escrow"}`;
  }

  return Object.freeze({
    clipCode: safeClipCode,
    totalPins,
    resolvedPins,
    unresolvedBlockerCount,
    unresolvedPolishCount,
    completionRatioPct,
    butlerTriggerState,
    cardMovedToNextStage,
    assigneePinged,
    milestoneTrancheUnlocked,
    summaryBannerKo,
    summaryBannerEn,
  });
}

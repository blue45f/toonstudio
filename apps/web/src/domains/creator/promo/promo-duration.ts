import { directPromo, PROMO_DURATIONS, PROMO_SHORT_SECONDS, promoMaxPanels } from "./promo-model";
import { syncPromoVoiceStudio } from "./promo-voice-studio";
import { parsePromoVoiceStudio } from "./promo-voice-studio-model";

import type { PromoProject, PromoSeconds } from "./promo-model";

/** 전체 길이 선택지 — 지금 컷 수로 고를 수 있는지와 못 고르는 이유를 함께 돌려준다. */
export interface PromoSecondsOption {
  readonly seconds: PromoSeconds;
  readonly maxPanels: number;
  readonly allowed: boolean;
  readonly reason: string | null;
}

export type PromoSecondsChange =
  | { readonly ok: true; readonly project: PromoProject }
  | { readonly ok: false; readonly message: string };

function overflowMessage(seconds: PromoSeconds, panelCount: number): string {
  const cap = promoMaxPanels(seconds);
  return `${seconds}초 영상은 컷을 ${cap}개까지만 담을 수 있어요. 지금은 ${panelCount}개라서 ${panelCount - cap}개를 줄인 뒤 바꿔 주세요. 컷은 지우지 않았어요.`;
}

export function promoSecondsOptions(panelCount: number): PromoSecondsOption[] {
  return PROMO_DURATIONS.map((seconds) => {
    const maxPanels = promoMaxPanels(seconds);
    const allowed = panelCount <= maxPanels;
    return { seconds, maxPanels, allowed, reason: allowed ? null : overflowMessage(seconds, panelCount) };
  });
}

/**
 * 전체 길이를 바꾼다. 컷 수가 새 상한을 넘으면 컷을 지우지 않고 거절하며,
 * 음성 스튜디오 대사는 새 타임라인에 맞춰 다시 맞춘다(영상 길이를 벗어난 대사는 초안 저장 자체를 막는다).
 */
export function changePromoSeconds(project: PromoProject, seconds: PromoSeconds): PromoSecondsChange {
  if (project.seconds === seconds) return { ok: true, project };
  if (project.panels.length > promoMaxPanels(seconds)) return { ok: false, message: overflowMessage(seconds, project.panels.length) };
  const next: PromoProject = { ...project, seconds };
  if (!project.voiceStudio) return { ok: true, project: next };
  const voiceStudio = syncPromoVoiceStudio(next, project.voiceStudio);
  try {
    parsePromoVoiceStudio(voiceStudio, seconds);
  } catch {
    return { ok: false, message: `음성 스튜디오의 대사 시간이 ${seconds}초 안에 들어가지 않아요. 대사 시간을 줄이거나 지운 뒤 다시 바꿔 주세요.` };
  }
  return { ok: true, project: { ...next, voiceStudio } };
}

/**
 * 10초 쇼츠 프리셋 — 길이 10초, 세로 9:16, "10초 쇼츠 트레일러" 연출(하드 컷·집중선·박스 자막)과
 * 숏폼 가중치를 한 번에 적용한다. 컷 순서와 입력한 자막은 바꾸지 않는다.
 */
export function applyPromoShortPreset(project: PromoProject): PromoSecondsChange {
  const changed = changePromoSeconds(project, PROMO_SHORT_SECONDS);
  if (!changed.ok) return changed;
  return { ok: true, project: directPromo({ ...changed.project, ratio: "9:16" }, "short10") };
}

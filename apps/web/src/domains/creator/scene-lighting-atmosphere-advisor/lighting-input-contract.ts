import type { LightingRigTweakPatch, SceneLightingAnalysisInput, SceneLightingProposal, SceneLightingProposalBundle, SceneLightingRig, SceneLightingSession } from "./scene-lighting-advisor-engine";

export const MAX_LIGHTING_DIALOGUE_CHARACTERS = 4096;

function isLightingRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isLightingRecord(value)) throw new TypeError("조명 예제의 객체가 필요합니다.");
  return value;
}
function number(source: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new RangeError("조명 수치가 유한한 예제 범위를 벗어났습니다.");
  return value;
}
function text(value: unknown, limit = 256): string {
  if (typeof value !== "string" || value.length > limit) throw new RangeError("조명 설명이 지원 범위를 벗어났습니다.");
  return value;
}
function identifier(value: unknown): string {
  const id = text(value, 1024);
  if (!id.trim()) throw new RangeError("조명 제안 ID가 비어 있습니다.");
  return id;
}
function color(value: unknown) {
  const source = record(value);
  return { l: number(source, "l", 0, 1), c: number(source, "c", 0, 0.4), h: number(source, "h", -36000, 36000) };
}

/** 입력을 자르거나 대체하지 않고, 큰 문자열은 정규식 탐색 전에 거부한다. */
export function assertLightingInput(input: SceneLightingAnalysisInput): void {
  const dialogue = input.dialogue;
  if (typeof dialogue !== "string" || dialogue.length > MAX_LIGHTING_DIALOGUE_CHARACTERS * 2) throw new RangeError("대사가 조명 계산 예제의 지원 한도를 넘었습니다. 원문은 유지됩니다.");
  if (Array.from(dialogue).length > MAX_LIGHTING_DIALOGUE_CHARACTERS) throw new RangeError("대사가 조명 계산 예제의 지원 한도를 넘었습니다. 원문은 유지됩니다.");
  if (input.scenePresetId !== undefined && !["rooftop-rain", "chase-alley", "sunset-classroom", "dawn-bedroom", "snow-duel", "royal-hall"].includes(input.scenePresetId)) throw new RangeError("지원하지 않는 장소 예제입니다.");
  if (input.timeOfDay !== undefined && !["dawn", "day", "golden-hour", "rainy-dusk", "night-neon", "snow-overcast"].includes(input.timeOfDay)) throw new RangeError("지원하지 않는 시간대 예제입니다.");
}

/** 외부 릭은 알려진 필드만 복사하며 원본과 미지원 메타데이터를 수정하지 않는다. */
export function validateLightingRig(value: unknown): SceneLightingRig {
  const rig = record(value);
  const key = record(rig.keyLight); const fill = record(rig.fillLight);
  const rim = record(rig.rimLight); const atmosphere = record(rig.atmosphere);
  return {
    labelKo: text(rig.labelKo), labelEn: text(rig.labelEn),
    keyLight: { azimuthDeg: number(key, "azimuthDeg", -180, 180), elevationDeg: number(key, "elevationDeg", 5, 85),
      kelvin: number(key, "kelvin", 2200, 9500), intensity: number(key, "intensity", 0.2, 3), colorOklch: color(key.colorOklch) },
    fillLight: { azimuthDeg: number(fill, "azimuthDeg", -180, 180), kelvin: number(fill, "kelvin", 2400, 9500),
      fillRatio: number(fill, "fillRatio", 0.1, 1), intensity: number(fill, "intensity", 0, 3), colorOklch: color(fill.colorOklch) },
    rimLight: { angleDeg: number(rim, "angleDeg", -180, 180), intensity: number(rim, "intensity", 0, 2.5),
      pigmentOklch: color(rim.pigmentOklch), pigmentNameKo: text(rim.pigmentNameKo), pigmentNameEn: text(rim.pigmentNameEn) },
    atmosphere: { fogDensity: number(atmosphere, "fogDensity", 0, 1), volumetricStrength: number(atmosphere, "volumetricStrength", 0, 1),
      shadowContrastRatio: number(atmosphere, "shadowContrastRatio", 1.4, 12), colorTempBalance: number(atmosphere, "colorTempBalance", -1, 1),
      ambientLuminance: number(atmosphere, "ambientLuminance", 0.1, 0.9), backdropOklch: color(atmosphere.backdropOklch) },
  };
}

export function assertLightingProposal(proposal: SceneLightingProposal): void {
  identifier(proposal.id);
  text(proposal.titleKo); text(proposal.titleEn);
  if (![1, 2, 3].includes(proposal.rank) || !["cinematic-key", "dramatic-rim", "readable-soft"].includes(proposal.variant)
    || proposal.requiresAuthorApproval !== true) throw new RangeError("조명 제안의 종류·승인 계약이 잘못되었습니다.");
  validateLightingRig(proposal.rig);
}

export function assertLightingSession(session: SceneLightingSession): void {
  validateLightingRig(session.baselineRig); validateLightingRig(session.currentRig); validateLightingRig(session.previousCutRig);
  if (session.previewRig !== null) validateLightingRig(session.previewRig);
  for (const id of [session.previewingProposalId, session.appliedProposalId]) if (id !== null) identifier(id);
  if (!["idle", "previewing", "applied", "tweaked", "reverted"].includes(session.status)
    || typeof session.isTweaked !== "boolean" || typeof session.canRevert !== "boolean"
    || !Array.isArray(session.history) || session.history.length > 20) throw new RangeError("조명 세션 상태·기록이 지원 범위를 벗어났습니다.");
  for (const entry of session.history) {
    if (!Number.isSafeInteger(entry.step) || entry.step < 1 || !["apply", "revert", "tweak"].includes(entry.action)) throw new RangeError("조명 기록이 유효하지 않습니다.");
    if (entry.proposalId !== null) identifier(entry.proposalId);
    text(entry.labelKo);
  }
}

export function assertLightingPatch(patch: LightingRigTweakPatch): void {
  if (Object.values(patch).some(value => value !== undefined && !Number.isFinite(value))) throw new RangeError("미세 조정은 유한 수치여야 합니다.");
}

export function assertLightingBundle(bundle: SceneLightingProposalBundle): void {
  assertLightingInput(bundle.analysis);
  if (!Array.isArray(bundle.proposals) || bundle.proposals.length !== 3) throw new RangeError("조명 제안은 3개여야 합니다.");
  const ids = new Set<string>();
  for (const proposal of bundle.proposals) {
    assertLightingProposal(proposal);
    if (ids.has(proposal.id)) throw new RangeError("조명 제안 ID가 중복됩니다.");
    ids.add(proposal.id);
  }
  const analysis = record(bundle.analysis);
  number(analysis, "confidence", 0, 1);
  const emotions = ["tension", "flutter", "anger", "solitude", "elation", "suspense"];
  if (!emotions.includes(bundle.analysis.primaryEmotion) || !emotions.includes(bundle.analysis.secondaryEmotion)) throw new RangeError("지원하지 않는 감정입니다.");
  for (const emotion of emotions) number(record(bundle.analysis.emotionVector), emotion, 0, 1);
}

/** 미리보기의 발췌문은 빈 대사를 바꾸거나 Unicode 결합 문자를 중간에서 자르지 않는다. */
export function lightingDialogueSnippet(dialogue: string): string {
  return Array.from(new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(dialogue.replace(/\([^()]*\)/gu, "").trim()), part => part.segment).slice(0, 18).join("");
}

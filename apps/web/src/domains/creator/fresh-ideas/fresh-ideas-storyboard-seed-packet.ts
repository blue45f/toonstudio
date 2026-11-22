/**
 * Fresh Ideas v3 — 5렌즈 → 결정론 3컷 스토리보드 시드 패킷 변환기 (#076–#080).
 *
 * 순수 TypeScript 도메인 모듈 (React/DOM/Konva/외부 네트워크/브라우저 KV 무의존).
 * 5대 핵심 렌즈(`역발상·현장 공감·실측 근거·실전 플레이북·히든 디테일`) 및 확장 렌즈(06~14)에서
 * 선택한 각도를 결정론 3컷 콘티 시드 패킷(컷별 구도·대사 초안·조명 힌트)으로 즉시 변환한다.
 * 빈 새 문서(0컷)에서는 `첫 1화 오프닝 3컷 설계 모드`로 안전 폴백하고 미측정 항목에 `[측정 필요]`를 유지한다.
 */

import type { AnyLensId, CoreLensId, KoreanSpeechRegister } from "./fresh-ideas-contracts";
import type { FreshIdeaLensCardV2 } from "./fresh-ideas-lenses-engine";
import { formatKoreanRegisterSentence } from "./fresh-ideas-story-seed-bridge";
import {
  EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG,
  FIRST_EPISODE_OPENING_3CUT_MODE_LABEL_KO,
  countEpisodeDialogueChars,
  extractEpisodeTelemetryForFreshIdeas,
  type EpisodeTelemetryMode,
  type EpisodeTelemetrySourceInput,
  type FreshIdeasEpisodeTelemetrySnapshot,
} from "./fresh-ideas-episode-telemetry-adapter";
import {
  parseWebtoonScript,
  seedPanelsFromScript,
  type ParsedScriptDocument,
  type ScriptDialogueKind,
  type SeededScriptCanvasResult,
} from "../lettering/studio-script-to-panels-seed";

export type StoryboardCameraShotCode = "EWS" | "WS" | "MS" | "MCU" | "CU" | "ECU" | "OTS" | "LOW" | "HIGH";

export const V3_FIVE_LENS_ANGLE_LABELS_KO: Readonly<Record<CoreLensId, string>> = Object.freeze({
  "contrarian-take": "역발상",
  "personal-story-hook": "현장 공감",
  "data-evidence-angle": "실측 근거",
  "practical-playbook": "실전 플레이북",
  "what-they-missed": "히든 디테일",
});

export interface StoryboardSeedCutV3 {
  readonly cutNumber: 1 | 2 | 3;
  readonly beatRoleKo: string;
  readonly cameraShotCode: StoryboardCameraShotCode;
  readonly compositionKo: string;
  readonly speakerKo: string | null;
  readonly dialogueKind: ScriptDialogueKind;
  readonly dialogueDraftKo: string;
  readonly dialogueCharacterCount: number;
  readonly dialogueBudgetNoteKo: string;
  readonly lightingHintKo: string;
  readonly bg3dGuidanceKo: string;
  readonly actionDirectionKo: string;
}

export interface FreshIdeasThreeCutStoryboardPacket {
  readonly schemaVersion: 3;
  readonly packetId: string;
  readonly sourceTitleKo: string;
  readonly lensId: AnyLensId;
  readonly lensIndexTag: string;
  readonly lensLabelKo: string;
  readonly v3LensAngleKo: string;
  readonly register: KoreanSpeechRegister;
  readonly generationMode: EpisodeTelemetryMode;
  readonly generationModeLabelKo: string;
  readonly telemetry: FreshIdeasEpisodeTelemetrySnapshot;
  readonly telemetryBasisKo: string;
  readonly cuts: readonly [StoryboardSeedCutV3, StoryboardSeedCutV3, StoryboardSeedCutV3];
  readonly scriptText: string;
  readonly parsedScript: ParsedScriptDocument;
  readonly canvasSeed: SeededScriptCanvasResult;
  readonly preservedUrls: readonly string[];
  readonly clipboardMarkdownKo: string;
  readonly summaryKo: string;
}

export interface BuildThreeCutStoryboardSeedInput {
  readonly lens: FreshIdeaLensCardV2;
  readonly telemetry?: FreshIdeasEpisodeTelemetrySnapshot;
  readonly telemetrySource?: EpisodeTelemetrySourceInput | null;
  readonly sourceTitle?: string;
  readonly register?: KoreanSpeechRegister;
  readonly preservedUrls?: readonly string[];
}

interface CutBlueprintTemplate {
  readonly beatRoleKo: string;
  readonly openingBeatRoleKo: string;
  readonly cameraShotCode: StoryboardCameraShotCode;
  readonly compositionKo: string;
  readonly lightingHintKo: string;
  readonly speakerKo: string | null;
  readonly dialogueKind: ScriptDialogueKind;
  readonly actionDirectionKo: string;
}

type ThreeCutBlueprint = readonly [CutBlueprintTemplate, CutBlueprintTemplate, CutBlueprintTemplate];

function tpl(
  beatRoleKo: string, openingBeatRoleKo: string, cameraShotCode: StoryboardCameraShotCode,
  compositionKo: string, lightingHintKo: string, speakerKo: string | null,
  dialogueKind: ScriptDialogueKind, actionDirectionKo: string,
): CutBlueprintTemplate {
  return Object.freeze({ beatRoleKo, openingBeatRoleKo, cameraShotCode, compositionKo, lightingHintKo, speakerKo, dialogueKind, actionDirectionKo });
}

const CORE_LENS_BLUEPRINTS: Readonly<Record<CoreLensId, ThreeCutBlueprint>> = Object.freeze({
  "contrarian-take": [
    tpl("통념 제시 컷", "1화 오프닝 · 익숙한 질서 제시", "WS",
      "아이레벨 미디엄 와이드 샷 · 공간 질서와 기존 규칙을 정면 구도로 고정",
      "균일한 중립 주광(5200K) · 명암 대비를 낮춰 평온한 전제 상태 표현",
      null, "narration", "모두가 당연하게 따르는 기존 작업 흐름과 공간 전경 제시"),
    tpl("균열·반전 컷", "1화 오프닝 · 통념 균열 포착", "CU",
      "12도 더치 앵글 클로즈업 · 인물 눈선과 문제 대상을 대각선으로 충돌 배치",
      "측면 하드 키라이트(6200K) + 깊은 그림자 대비로 균열 순간 강조",
      "주인공", "speech", "기존 전제가 어긋나는 결정적 장면에서 인물 표정이 굳는 순간"),
    tpl("역전 선언 컷", "1화 오프닝 · 반전 훅 정지점", "LOW",
      "로우앵글 오버더숄더(OTS) · 전경 실루엣 너머 새 기준선을 향해 시선 확장",
      "강한 역광 림라이트(5600K) + 차가운 전경 섀도로 세로 스크롤 정지점 형성",
      "주인공", "speech", "우선순위를 뒤집는 선언과 함께 다음 장면으로 넘어가는 결정적 자세"),
  ],
  "personal-story-hook": [
    tpl("현장 마찰 도입", "1화 오프닝 · 주인공의 현장 마찰", "MCU",
      "어깨 너머 미디엄 클로즈업(MCU) · 손끝 동작과 작업 현장을 1인칭 시선으로 밀착",
      "창가 자연광(4300K) + 책상 보조등의 따뜻한 색온도 대비로 현장감 조성",
      "주인공", "thought", "마감 직전 반복 마찰에 멈춰 선 주인공의 손과 시선 포착"),
    tpl("감정 정지·전환", "1화 오프닝 · 시선이 멈춘 찰나", "ECU",
      "정면 익스트림 클로즈업(ECU) · 눈동자 반사와 소품 단서만 화면 중앙에 고립",
      "정면 반사광(5800K) 단일 광원 + 주변부 비네팅으로 내면 집중 유도",
      "주인공", "speech", "숨을 고르며 기존 방식의 허점을 처음으로 알아차리는 찰나"),
    tpl("현장 공감 여운", "1화 오프닝 · 첫 결단과 여운", "MS",
      "3/4 미디엄 샷 + 상단 여백 40% · 인물 뒤 공간 깊이를 열어 호흡 정리",
      "사선 노을빛 웜 키라이트(3400K) + 부드러운 쿨 필라이트로 전환감 표현",
      null, "narration", "불필요한 단계를 내려놓고 새 리듬으로 첫 발을 내딛는 뒷모습"),
  ],
  "data-evidence-angle": [
    tpl("실측 단면 설정", "1화 오프닝 · 현장 구조 조감", "HIGH",
      "하이앵글 부감 와이드 샷 · 공간 동선과 병목 지점을 한눈에 읽히게 배치",
      "명료한 스튜디오 디퓨즈 조명(5000K) · 형태와 동선 가독성 최우선",
      null, "narration", "감각적 추측 대신 실제 현장 상태와 수치 단서가 놓인 공간 전개"),
    tpl("결정적 증거 인서트", "1화 오프닝 · 핵심 단서 인서트", "CU",
      "인서트 클로즈업 · 기록지·계기·소품의 실제 흔적을 화면 삼분할 교점에 고정",
      "국부 스포트 키라이트(5400K) + 배경 30% 감광으로 단서 집중도 극대화",
      "주인공", "thought", "실제 기록과 현장 행동 패턴이 교차하는 구체적 단서 확대"),
    tpl("전후 대조 결론", "1화 오프닝 · 대조 훅 결론", "MS",
      "좌우 2분할 대비 미디엄 샷 · 이전 상태와 바뀐 선택의 경계를 수직선으로 분할",
      "좌측 쿨 섀도(6000K)와 우측 웜 키라이트(4000K)의 색온도 분리 조명",
      "주인공", "speech", "검증된 사실 위에서 다음 국면을 여는 단호한 대조 포즈"),
  ],
  "practical-playbook": [
    tpl("1단계 진단 구도", "1화 오프닝 · 첫 문제 지점 포착", "HIGH",
      "오버헤드 탑다운 미디엄 샷 · 작업대·지도·소품을 평면 전개해 시작점 명시",
      "그림자가 얕은 균일 작업등(4800K) · 체크 대상 경계를 또렷하게 확보",
      null, "narration", "가장 먼저 손대야 할 핵심 병목 1곳을 짚어내는 시작 장면"),
    tpl("2단계 기준선 실행", "1화 오프닝 · 규칙 잠금 액션", "CU",
      "손동작·도구 중심 클로즈업 · 대각선 액션 라인으로 실행 결단 속도감 부여",
      "45도 렘브란트 키라이트(4500K) · 소품 질감과 윤곽선 입체감 강조",
      "주인공", "speech", "기준선 파라미터를 잠그고 즉각 첫 동작을 실행하는 클로즈업"),
    tpl("3단계 검증 완료", "1화 오프닝 · 다음 화 실행 예고", "WS",
      "개방형 아이레벨 미디엄 와이드 샷 · 정리된 공간과 인물의 시선 전방 배치",
      "전면 소프트 필라이트(5200K) + 배경 약한 글로우로 실행 완료 리듬 마감",
      "주인공", "speech", "첫 검증 결과를 확인하고 다음 회차 선택지를 열어 두는 정지 컷"),
  ],
  "what-they-missed": [
    tpl("표면 질서 컷", "1화 오프닝 · 평온한 표면 위장", "EWS",
      "완전 대칭 프레이밍 익스트림 와이드 샷 · 정돈된 표면 뒤에 위화감 여백 확보",
      "평탄한 전면 확산광(5400K) · 겉보기에 문제없는 표면 분위기 조성",
      null, "narration", "누구나 지나치는 평범한 배경 구석에 숨은 단서를 미묘하게 배치"),
    tpl("히든 디테일 줌인", "1화 오프닝 · 사각지대 단서 점등", "ECU",
      "프레임 모서리 크롭 클로즈업 · 주 인물 뒤 사각지대 디테일을 강제 포커스",
      "좁은 슬릿 광원(3200K)으로 숨겨진 단서만 점등하고 외곽은 깊은 암부 처리",
      "주인공", "thought", "아무도 확인하지 않은 사각지대 흔적이 빛 속에 드러나는 순간"),
    tpl("2차 파급 예고 컷", "1화 오프닝 · 파급 클리프행어", "OTS",
      "딥 포커스 롱 샷 · 전경의 숨은 단서와 원경 인물을 동일 초점 축에 겹쳐 배치",
      "차가운 청회색 역광(6500K) + 전경 단서 미세 하이라이트로 긴장 유지",
      null, "narration", "지금 놓친 작은 디테일이 다음 회차 사건으로 번질 것을 암시하는 여운 컷"),
  ],
});

function isCoreLensId(id: AnyLensId): id is CoreLensId {
  return id in V3_FIVE_LENS_ANGLE_LABELS_KO;
}

export function resolveV3LensAngleLabelKo(lens: Pick<FreshIdeaLensCardV2, "id" | "labelKo">): string {
  return isCoreLensId(lens.id) ? V3_FIVE_LENS_ANGLE_LABELS_KO[lens.id] : lens.labelKo;
}

function fnv1aHex32(seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stripLeadingTag(text: string): string {
  return text.replace(/^\[[^\]]+\]\s*/u, "").trim();
}

function resolveDialogueBudgetNoteKo(telemetry: FreshIdeasEpisodeTelemetrySnapshot, cutNumber: 1 | 2 | 3): string {
  if (telemetry.isEmptyDocument || telemetry.averageDialogueCharsPerCut === null) {
    return `원고 평균 대사 ${EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG} · 첫 1화 오프닝 기준 컷 ${cutNumber} 대사 20자 안팎 권장`;
  }
  const avg = telemetry.averageDialogueCharsPerCut;
  if (avg >= 28) return `실측 평균 ${avg}자/컷(고밀도) · 컷 ${cutNumber}은 말풍선 호흡을 22자 이내로 압축 권장`;
  if (avg <= 10) return `실측 평균 ${avg}자/컷(간결형) · 현재 짧은 호흡을 유지해 시각 리듬 보존`;
  return `실측 평균 ${avg}자/컷 리듬 유지 · 컷 ${cutNumber} 대사 밀도 균형`;
}

function resolveBg3dGuidanceKo(telemetry: FreshIdeasEpisodeTelemetrySnapshot, cutNumber: 1 | 2 | 3): string {
  if (telemetry.isEmptyDocument || telemetry.bg3dCutPercent === null) {
    return cutNumber === 1
      ? `3D 배경 컷 비율 ${EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG} · 오프닝 1컷 설정 샷에 기준 공간 톤 먼저 고정`
      : `3D 배경 컷 비율 ${EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG} · 첫 3컷 배치 후 실측 비율 자동 집계`;
  }
  const pct = telemetry.bg3dCutPercent;
  if (pct >= 50) return `실측 3D 배경 ${pct}% (${telemetry.bg3dCutCount}/${telemetry.cutCount}컷) · 배경 LT 외곽선과 인물 선굵기 정합 유지`;
  if (pct === 0) return `실측 3D 배경 0% (2D 중심) · 원경 설정 컷에만 선택적 3D 가이드 투시 활용`;
  return `실측 3D 배경 ${pct}% (${telemetry.bg3dCutCount}/${telemetry.cutCount}컷) · 설정 컷은 3D 투시, 감정 컷은 2D 집중선 배합`;
}

function buildCutDialogueRawTexts(
  lens: FreshIdeaLensCardV2,
  sourceTitleKo: string,
  telemetry: FreshIdeasEpisodeTelemetrySnapshot,
): readonly [string, string, string] {
  const headline = stripLeadingTag(lens.headlineKo) || `${sourceTitleKo}의 핵심 국면을 여는 첫 장면`;
  const angle = stripLeadingTag(lens.angleKo) || `${sourceTitleKo}의 전제를 다시 짚는다`;
  const openingLead = telemetry.isEmptyDocument ? `1화 첫 장면에서 ${headline}` : headline;

  if (lens.id === "personal-story-hook" && lens.fourBeatArcKo) {
    return [
      stripLeadingTag(lens.fourBeatArcKo[0]),
      stripLeadingTag(lens.fourBeatArcKo[1]),
      `${stripLeadingTag(lens.fourBeatArcKo[2])} ${stripLeadingTag(lens.fourBeatArcKo[3])}`.trim(),
    ];
  }
  if (lens.id === "practical-playbook" && lens.playbookStepsKo && lens.playbookStepsKo.length >= 3) {
    return [
      stripLeadingTag(lens.playbookStepsKo[0]!.actionKo),
      stripLeadingTag(lens.playbookStepsKo[1]!.actionKo),
      stripLeadingTag(lens.playbookStepsKo[2]!.actionKo),
    ];
  }
  if (lens.id === "data-evidence-angle") {
    const evidenceLine = telemetry.isEmptyDocument
      ? `${sourceTitleKo}의 첫 3컷 지표는 아직 ${EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG} 상태이므로 현장 관찰 기준부터 세운다.`
      : `현재 열린 원고 ${telemetry.cutCount}컷(평균 대사 ${telemetry.averageDialogueCharsPerCut}자, 3D 배경 ${telemetry.bg3dCutPercent}%)의 실측 리듬을 먼저 대조한다.`;
    return [openingLead, evidenceLine, angle];
  }
  if (lens.id === "what-they-missed") {
    return [
      openingLead,
      lens.falsifiableBoundaryKo ? stripLeadingTag(lens.falsifiableBoundaryKo) : `표면 뒤 사각지대에서 ${angle}`,
      `${sourceTitleKo}에서 놓친 작은 디테일이 다음 회차 갈등의 방아쇠로 이어진다.`,
    ];
  }
  return [
    openingLead,
    lens.falsifiableBoundaryKo ? stripLeadingTag(lens.falsifiableBoundaryKo) : angle,
    `${sourceTitleKo}의 기존 순서를 뒤집어 다음 컷에서 새 기준선을 확정한다.`,
  ];
}

function formatCutForScript(cut: StoryboardSeedCutV3): string {
  const header = `[컷 ${cut.cutNumber} - ${cut.beatRoleKo} · ${cut.cameraShotCode} · ${cut.compositionKo}]`;
  const action = `${cut.actionDirectionKo} / 조명 · ${cut.lightingHintKo}`.replace(/[:：]/gu, " · ");
  const speaker = cut.speakerKo ?? "주인공";
  const dialogue =
    cut.dialogueKind === "narration" ? `나레이션: ${cut.dialogueDraftKo}`
      : cut.dialogueKind === "thought" ? `${speaker}(생각): ${cut.dialogueDraftKo}`
        : cut.dialogueKind === "shout" ? `${speaker}(외침): ${cut.dialogueDraftKo}`
          : `${speaker}: ${cut.dialogueDraftKo}`;
  return [header, action, dialogue].join("\n");
}

/**
 * 선택한 5렌즈(또는 확장 렌즈)와 열린 원고 실측 텔레메트리를 결합해
 * 결정론 3컷 스토리보드 시드 패킷(구도·대사 초안·조명 힌트)을 즉시 생성한다.
 */
export function buildThreeCutStoryboardSeedPacket(
  input: BuildThreeCutStoryboardSeedInput,
): FreshIdeasThreeCutStoryboardPacket {
  const telemetry =
    input.telemetry ??
    extractEpisodeTelemetryForFreshIdeas(input.telemetrySource ?? { episodeTitleKo: input.sourceTitle });
  const sourceTitleKo = input.sourceTitle?.trim() || telemetry.episodeTitleKo || "현재 열린 원고";
  const register: KoreanSpeechRegister = input.register ?? "haeyo";
  const v3LensAngleKo = resolveV3LensAngleLabelKo(input.lens);
  const blueprint = isCoreLensId(input.lens.id)
    ? CORE_LENS_BLUEPRINTS[input.lens.id]
    : CORE_LENS_BLUEPRINTS["contrarian-take"];
  const rawDialogues = buildCutDialogueRawTexts(input.lens, sourceTitleKo, telemetry);

  const builtCuts = ([0, 1, 2] as const).map((idx): StoryboardSeedCutV3 => {
    const cutNumber = (idx + 1) as 1 | 2 | 3;
    const item = blueprint[idx];
    const dialogueDraftKo = formatKoreanRegisterSentence(rawDialogues[idx], register);
    const compositionKo = telemetry.isEmptyDocument
      ? cutNumber === 1 ? `${item.compositionKo} (오프닝 1컷 공간 앵커)` : item.compositionKo
      : cutNumber === 2 && telemetry.silentActionCutPercent !== null && telemetry.silentActionCutPercent >= 45
        ? `${item.compositionKo} · 실측 무대사 비중(${telemetry.silentActionCutPercent}%) 반영 액션 여백 확보`
        : item.compositionKo;
    return Object.freeze({
      cutNumber, beatRoleKo: telemetry.isEmptyDocument ? item.openingBeatRoleKo : item.beatRoleKo,
      cameraShotCode: item.cameraShotCode, compositionKo, speakerKo: item.speakerKo,
      dialogueKind: item.dialogueKind, dialogueDraftKo,
      dialogueCharacterCount: countEpisodeDialogueChars(dialogueDraftKo),
      dialogueBudgetNoteKo: resolveDialogueBudgetNoteKo(telemetry, cutNumber),
      lightingHintKo: item.lightingHintKo,
      bg3dGuidanceKo: resolveBg3dGuidanceKo(telemetry, cutNumber),
      actionDirectionKo: item.actionDirectionKo,
    });
  });

  const cuts: readonly [StoryboardSeedCutV3, StoryboardSeedCutV3, StoryboardSeedCutV3] = Object.freeze([
    builtCuts[0]!, builtCuts[1]!, builtCuts[2]!,
  ]);
  const scriptText = cuts.map(formatCutForScript).join("\n\n");
  const parsedScript = parseWebtoonScript(scriptText);
  const canvasSeed = seedPanelsFromScript(scriptText, {
    pageIdPrefix: `fresh-ideas-v3-ep${telemetry.episodeNumber}-${input.lens.indexTag}`,
  });

  const urlSet = new Set<string>();
  for (const candidate of [...input.lens.preservedUrls, ...(input.preservedUrls ?? [])]) {
    const cleaned = candidate.trim().replace(/[.,;)]+$/u, "");
    if (/^https?:\/\//iu.test(cleaned)) urlSet.add(cleaned);
  }
  const preservedUrls = Object.freeze([...urlSet]);
  const generationMode = telemetry.mode;
  const generationModeLabelKo = telemetry.isEmptyDocument
    ? FIRST_EPISODE_OPENING_3CUT_MODE_LABEL_KO
    : "열린 원고 실측 기반 3컷 보강";
  const need = EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG;
  const telemetryBasisKo = telemetry.isEmptyDocument
    ? `0컷 빈 문서 폴백 · 평균 대사 ${need} · 3D 배경 비율 ${need} · 무대사 액션 비율 ${need}`
    : telemetry.badgeSummaryKo;

  const packetId = `sb3-${input.lens.indexTag}-${fnv1aHex32(
    [
      sourceTitleKo, input.lens.id, input.lens.indexTag, input.lens.headlineKo, register,
      generationMode, String(telemetry.cutCount), String(telemetry.totalDialogueChars),
      String(telemetry.bg3dCutCount), String(telemetry.silentActionCutCount),
    ].join("|"),
  )}`;

  const markdownLines = [
    `# ${sourceTitleKo} — 3컷 콘티 초안 패킷 (${input.lens.indexTag} · ${v3LensAngleKo})`,
    `- 패킷 ID: ${packetId}`,
    `- 생성 모드: ${generationModeLabelKo}`,
    `- 원고 실측 근거: ${telemetryBasisKo}`,
    "",
    ...cuts.flatMap((cut) => [
      `## 컷 ${cut.cutNumber} · ${cut.beatRoleKo} (${cut.cameraShotCode})`,
      `- 구도: ${cut.compositionKo}`,
      `- 대사 초안: ${cut.dialogueDraftKo}`,
      `- 조명 힌트: ${cut.lightingHintKo}`,
      `- 3D 배경·선화 가이드: ${cut.bg3dGuidanceKo}`,
      "",
    ]),
    ...(preservedUrls.length > 0 ? ["## 출처 링크", ...preservedUrls.map((url, idx) => `- [출처 ${idx + 1}](${url})`)] : []),
  ];

  return Object.freeze({
    schemaVersion: 3, packetId, sourceTitleKo, lensId: input.lens.id,
    lensIndexTag: input.lens.indexTag, lensLabelKo: input.lens.labelKo, v3LensAngleKo,
    register, generationMode, generationModeLabelKo, telemetry, telemetryBasisKo,
    cuts, scriptText, parsedScript, canvasSeed, preservedUrls,
    clipboardMarkdownKo: markdownLines.join("\n").trim(),
    summaryKo: `3컷 콘티 초안 패킷 생성 완료 (${input.lens.indexTag} · ${v3LensAngleKo} · ${generationModeLabelKo})`,
  });
}

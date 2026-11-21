/**
 * Fresh Ideas v2.2 <-> 스토리 대본·컷 시드 & Story Living Spec 양방향 브리지.
 *
 * - 순수 TypeScript 도메인 모듈 (React/DOM/Konva 무의존).
 * - `FreshIdeaLensCardV2` 또는 `ModeCEcosystemBundle`을 `[컷 N]` 대본·컷 시드와
 *   Story Living Spec 패치·제안 계약으로 변환하며 출처 URL·한국어 종결어미를 보존한다.
 */

import { localizeKoreanEditorialCopy } from "./fresh-ideas-channels-localization";
import type { AnyLensId, KoreanSpeechRegister } from "./fresh-ideas-contracts";
import type { FreshIdeaLensCardV2 } from "./fresh-ideas-lenses-engine";
import type { ModeCEcosystemBundle } from "./fresh-ideas-quality-ecosystem";
import { parseWebtoonScript, seedPanelsFromScript, type ParsedScriptDocument, type ScriptDialogueKind, type SeededScriptCanvasResult } from "../lettering/studio-script-to-panels-seed";
import { createEmptyCutReadinessSlots, createStoryNodeId, formatStoryNodeKey, type CreateAiProposalInput, type ProposalEvidenceCitation, type StoryNodeSnapshot, type StoryRightsAssetTag } from "../planning/studio-story-living-spec-store";

export interface FreshIdeasStorySeedOptions {
  readonly sourceTitle?: string;
  readonly targetPersonaKo?: string;
  readonly register?: KoreanSpeechRegister;
  readonly episodeNumber?: number;
  readonly projectId?: string;
  readonly targetNodeKey?: string;
  readonly preservedUrls?: readonly string[];
  readonly createdAt?: string;
}

export interface FreshIdeasStorySeedInput extends FreshIdeasStorySeedOptions {
  readonly lens?: FreshIdeaLensCardV2;
  readonly modeC?: ModeCEcosystemBundle;
  readonly lenses?: readonly FreshIdeaLensCardV2[];
}

export type FreshIdeasStorySeedSource = FreshIdeaLensCardV2 | ModeCEcosystemBundle | FreshIdeasStorySeedInput;

export interface StoryCutSeedEntry {
  readonly cutNumber: number;
  readonly beatLabelKo: string;
  readonly directionNoteKo: string;
  readonly speakerKo: string | null;
  readonly dialogueKind: ScriptDialogueKind;
  readonly dialogueLineKo: string;
  readonly actionLineKo: string;
}

export interface StoryCutSeedDraft {
  readonly sourceTitle: string;
  readonly lensId: AnyLensId;
  readonly lensLabelKo: string;
  readonly register: KoreanSpeechRegister;
  readonly cuts: readonly StoryCutSeedEntry[];
  readonly scriptText: string;
  readonly parsedScript: ParsedScriptDocument;
  readonly canvasSeed: SeededScriptCanvasResult;
  readonly preservedUrls: readonly string[];
  readonly clipboardMarkdownKo: string;
}

export interface LivingSpecChecklistItem {
  readonly id: string;
  readonly labelKo: string;
  readonly doneCriteriaKo: string;
  readonly completed: boolean;
}

export interface LivingSpecSourceLink {
  readonly labelKo: string;
  readonly url: string;
}

export interface StoryLivingSpecSeedPatch {
  readonly targetNodeKey: string;
  readonly episodeTitleKo: string;
  readonly goalKo: string;
  readonly coreConflictKo: string;
  readonly checklist: readonly LivingSpecChecklistItem[];
  readonly sourceLinks: readonly LivingSpecSourceLink[];
  readonly preservedUrls: readonly string[];
  readonly nodeSnapshot: StoryNodeSnapshot;
  readonly proposalInput: CreateAiProposalInput;
  readonly cutNodeSnapshots: readonly StoryNodeSnapshot[];
  readonly episodePlanPatch: {
    readonly goal: string;
    readonly coreConflict: string;
    readonly logline: string;
    readonly turningPoints: readonly string[];
  };
}

export interface FreshIdeasStorySeedPayload {
  readonly sourceTitle: string;
  readonly register: KoreanSpeechRegister;
  readonly lensId: AnyLensId;
  readonly lensLabelKo: string;
  readonly cutSeed: StoryCutSeedDraft;
  readonly livingSpecSeed: StoryLivingSpecSeedPatch;
  readonly clipboardTextKo: string;
  readonly summaryKo: string;
}

const URL_EXTRACT_RE = /https?:\/\/[^\s)>"']+/giu;

/** [haera, haeyo, hapsyo] 대칭 종결어미 표 */
const REGISTER_TRIPLES: readonly (readonly [string, string, string])[] = [
  ["한다.", "해요.", "합니다."], ["된다.", "돼요.", "됩니다."],
  ["이다.", "이에요.", "입니다."], ["이다.", "예요.", "입니다."],
  ["있다.", "있어요.", "있습니다."], ["없다.", "없어요.", "없습니다."],
  ["보라.", "보세요.", "보십시오."], ["멈춘다.", "멈춰요.", "멈춥니다."],
  ["둔다.", "둬요.", "둡니다."], ["늘어난다.", "늘어나요.", "늘어납니다."],
  ["줄어든다.", "줄어들어요.", "줄어듭니다."], ["줄인다.", "줄여요.", "줄입니다."],
  ["남긴다.", "남겨요.", "남깁니다."], ["바꾼다.", "바꿔요.", "바꿉니다."],
  ["준다.", "줘요.", "줍니다."], ["잠근다.", "잠가요.", "잠급니다."],
];

const REGISTER_IDX: Readonly<Record<KoreanSpeechRegister, 0 | 1 | 2>> = { haera: 0, haeyo: 1, hapsyo: 2 };

function normalizeSource(source: FreshIdeasStorySeedSource, options?: FreshIdeasStorySeedOptions): FreshIdeasStorySeedInput {
  if ("indexTag" in source && "headlineKo" in source && "angleKo" in source) return { ...options, lens: source };
  if ("osmuPackage" in source && "hybridFusion" in source && "serializedSeries" in source) return { ...options, modeC: source };
  return { ...source, ...options };
}

function cleanSentence(raw: string): string {
  const text = raw.replace(/\s+/gu, " ").replace(/!+/gu, ".").trim();
  return !text ? "" : /[.?]$/u.test(text) ? text : `${text}.`;
}

function stripLeadingTag(raw: string): string {
  return raw.replace(/^\[[^\]]+\]\s*/u, "").trim();
}

/** 한국어 종결어미(`haeyo`/`haera`/`hapsyo`)를 문장 전체에 일관되게 적용한다. */
export function formatKoreanRegisterSentence(rawText: string, register: KoreanSpeechRegister): string {
  let text = localizeKoreanEditorialCopy(cleanSentence(rawText), { register });
  if (!text) return "";
  const targetIdx = REGISTER_IDX[register];
  for (const triple of REGISTER_TRIPLES) {
    const target = triple[targetIdx];
    for (let i = 0; i < 3; i += 1) {
      if (i === targetIdx) continue;
      const from = triple[i]!;
      if (from !== target && text.includes(from)) text = text.split(from).join(target);
    }
  }
  return text;
}

function collectPreservedUrls(input: FreshIdeasStorySeedInput): readonly string[] {
  const seen = new Set<string>();
  const add = (candidate: string | undefined) => {
    if (!candidate) return;
    const cleaned = candidate.trim().replace(/[.,;)]+$/u, "");
    if (/^https?:\/\//iu.test(cleaned)) seen.add(cleaned);
  };
  input.preservedUrls?.forEach(add);
  input.lens?.preservedUrls.forEach(add);
  input.lenses?.forEach((lens) => lens.preservedUrls.forEach(add));
  if (input.modeC) {
    const { osmuPackage, ideaBankRows } = input.modeC;
    osmuPackage.linkedInFeedCut.preservedUrls.forEach(add);
    osmuPackage.longFormNewsletter.preservedUrls.forEach(add);
    osmuPackage.shortFormThreadsOrShorts.preservedUrls.forEach(add);
    for (const row of ideaBankRows) (row.sourceTitleAndUrl.match(URL_EXTRACT_RE) ?? []).forEach(add);
  }
  return Object.freeze([...seen]);
}

function resolvePrimaryMeta(input: FreshIdeasStorySeedInput) {
  const register: KoreanSpeechRegister = input.register ?? input.modeC?.osmuPackage.linkedInFeedCut.register ?? "haeyo";
  const lens = input.lens ?? input.lenses?.[0];
  const modeC = input.modeC;
  const fallbackTitle =
    modeC?.googleDocExportPayload.titleKo.replace(/^\[Fresh Ideas v2\]\s*/u, "").split(" — ")[0]?.trim() ||
    lens?.headlineKo.slice(0, 36) ||
    "에피소드 스토리 시드";
  const sourceTitle = input.sourceTitle?.trim() || fallbackTitle;
  const lensId: AnyLensId = lens?.id ?? modeC?.recommendedLensId ?? "contrarian-take";
  const lensLabelKo = lens ? `${lens.indexTag} · ${lens.labelKo}` : modeC?.hybridFusion.combinedLabelKo || "통합 에디토리얼 시드";
  const headlineKo = lens?.headlineKo || modeC?.osmuPackage.linkedInFeedCut.headlineVariants.directThesisKo || `${sourceTitle}의 숨은 갈등을 여는 첫 장면`;
  const angleKo = lens?.angleKo || stripLeadingTag(modeC?.hybridFusion.bottom60ProofResolutionKo ?? "") || `${sourceTitle}의 핵심 기준선과 갈등 축을 장면 단위로 풀어냅니다.`;
  return { sourceTitle, lensId, lensLabelKo, headlineKo, angleKo, register };
}

function formatCutScriptLine(cut: StoryCutSeedEntry): string {
  const header = `[컷 ${cut.cutNumber} - ${cut.beatLabelKo} · ${cut.directionNoteKo}]`;
  const action = cut.actionLineKo.replace(/\s+/gu, " ").replace(/[:：]/gu, " · ").trim();
  const speaker = cut.speakerKo ?? "주인공";
  const dialogue =
    cut.dialogueKind === "narration" ? `나레이션: ${cut.dialogueLineKo}`
      : cut.dialogueKind === "thought" ? `${speaker}(생각): ${cut.dialogueLineKo}`
        : cut.dialogueKind === "shout" ? `${speaker}(외침): ${cut.dialogueLineKo}`
          : cut.dialogueKind === "sfx" ? `효과음: ${cut.dialogueLineKo}`
            : `${speaker}: ${cut.dialogueLineKo}`;
  return [header, action, dialogue].filter(Boolean).join("\n");
}

/** 선택된 렌즈 또는 Mode C 번들을 `[컷 N]` 표준 웹툰 대본·컷 시드 초안으로 변환한다. */
export function buildStoryCutSeedFromFreshIdeas(
  source: FreshIdeasStorySeedSource,
  options?: FreshIdeasStorySeedOptions,
): StoryCutSeedDraft {
  const input = normalizeSource(source, options);
  const meta = resolvePrimaryMeta(input);
  const preservedUrls = collectPreservedUrls(input);
  const { lens, modeC } = input;
  const fmt = (text: string) => formatKoreanRegisterSentence(text, meta.register);

  const cutSpecs: [string, string, string | null, ScriptDialogueKind, string, string][] = [
    ["도입 훅", "와이드 설정 샷 · 시선 고정 도입", null, "narration", fmt(lens?.fourBeatArcKo?.[0] ?? (modeC ? stripLeadingTag(modeC.hybridFusion.top40HookFrameKo) : meta.headlineKo)), `${meta.sourceTitle} 첫 공간과 긴장 계기 제시`],
    ["갈등·전환", "미디엄 투샷 · 표정 대비 강조", "주인공", "speech", fmt(lens?.fourBeatArcKo?.[1] ?? lens?.falsifiableBoundaryKo ?? (modeC ? stripLeadingTag(modeC.hybridFusion.bottom60ProofResolutionKo) : meta.angleKo)), "기존 전제가 흔들리는 인물 시선 교차"],
    ["현장 근거", "클로즈업 · 소품 및 행동 단서", "주인공", "thought", fmt(lens?.fourBeatArcKo?.[2] ?? lens?.playbookStepsKo?.[0]?.actionKo ?? lens?.experienceSlotPromptKo ?? modeC?.serializedSeries[1]?.episodeTitleKo ?? `${meta.sourceTitle} 현장에서 기존 방식이 멈추는 구체적 단서를 대조한다.`), "구체적 단서와 작업 기록 클로즈업"],
    ["결단·다음 화 훅", "로우앵글 여운 컷 · 세로 스크롤 정지점", null, "narration", fmt(lens?.fourBeatArcKo?.[3] ?? lens?.playbookStepsKo?.[1]?.actionKo ?? modeC?.serializedSeries[0]?.cliffhangerBridgeKo ?? `${meta.sourceTitle}의 새 기준선을 확정하고 다음 화의 선택지를 열어 둔다.`), "새 선택의 대가를 암시하는 여운 컷"],
  ];

  if (modeC && modeC.serializedSeries.length >= 3 && !lens) {
    const fifth = modeC.serializedSeries[modeC.serializedSeries.length - 1]!;
    cutSpecs.push(["연재 브리지", "에필로그 롱샷 · 차기 회차 연결", null, "narration", fmt(fifth.cliffhangerBridgeKo), `${fifth.episodeTitleKo} 마무리 및 다음 회차 예고 컷`]);
  }

  const cuts: readonly StoryCutSeedEntry[] = Object.freeze(
    cutSpecs.map(([beatLabelKo, directionNoteKo, speakerKo, dialogueKind, dialogueLineKo, actionLineKo], idx) => ({
      cutNumber: idx + 1, beatLabelKo, directionNoteKo, speakerKo, dialogueKind, dialogueLineKo, actionLineKo,
    })),
  );
  const scriptText = cuts.map(formatCutScriptLine).join("\n\n");
  const parsedScript = parseWebtoonScript(scriptText);
  const canvasSeed = seedPanelsFromScript(scriptText, { pageIdPrefix: `fresh-ideas-ep${input.episodeNumber ?? 1}` });
  const sourceSection = preservedUrls.length > 0 ? `\n\n## 출처 링크\n${preservedUrls.map((url, idx) => `- [출처 ${idx + 1}](${url})`).join("\n")}` : "";

  return Object.freeze({
    sourceTitle: meta.sourceTitle,
    lensId: meta.lensId,
    lensLabelKo: meta.lensLabelKo,
    register: meta.register,
    cuts,
    scriptText,
    parsedScript,
    canvasSeed,
    preservedUrls,
    clipboardMarkdownKo: `# ${meta.sourceTitle} — 스토리 컷 시드 (${meta.lensLabelKo})\n\n${scriptText}${sourceSection}`,
  });
}

/** 선택된 렌즈 또는 Mode C 번들을 Story Living Spec 패치(목표·핵심 갈등·체크리스트·출처 링크·제안 계약)로 변환한다. */
export function buildLivingSpecSeedFromFreshIdeas(
  source: FreshIdeasStorySeedSource,
  options?: FreshIdeasStorySeedOptions,
): StoryLivingSpecSeedPatch {
  const input = normalizeSource(source, options);
  const meta = resolvePrimaryMeta(input);
  const cutSeed = buildStoryCutSeedFromFreshIdeas(input);
  const { preservedUrls } = cutSeed;
  const episodeNumber = input.episodeNumber ?? 1;
  const episodeNodeId = createStoryNodeId("EP", `EP-${String(episodeNumber).padStart(2, "0")}`);
  const targetNodeKey = input.targetNodeKey?.trim() || formatStoryNodeKey(episodeNodeId);

  const goalKo = formatKoreanRegisterSentence(
    input.lens?.headlineKo ?? input.modeC?.osmuPackage.linkedInFeedCut.headlineVariants.directThesisKo ?? `${meta.sourceTitle}의 핵심 관점을 컷 흐름으로 완성한다.`,
    meta.register,
  );
  const coreConflictKo = formatKoreanRegisterSentence(
    input.lens?.falsifiableBoundaryKo ?? input.lens?.angleKo ?? stripLeadingTag(input.modeC?.hybridFusion.bottom60ProofResolutionKo ?? meta.angleKo),
    meta.register,
  );

  const checklistItems: LivingSpecChecklistItem[] = input.lens?.playbookStepsKo?.length
    ? input.lens.playbookStepsKo.map((step, idx) => ({ id: `check-playbook-${idx + 1}`, labelKo: formatKoreanRegisterSentence(step.actionKo, meta.register), doneCriteriaKo: step.doneCriteriaKo, completed: false }))
    : input.modeC?.serializedSeries.length
      ? input.modeC.serializedSeries.slice(0, 3).map((ep, idx) => ({ id: `check-series-${idx + 1}`, labelKo: ep.episodeTitleKo, doneCriteriaKo: formatKoreanRegisterSentence(ep.cliffhangerBridgeKo, meta.register), completed: false }))
      : cutSeed.cuts.slice(0, 3).map((cut, idx) => ({ id: `check-cut-${idx + 1}`, labelKo: `컷 ${cut.cutNumber} · ${cut.beatLabelKo}`, doneCriteriaKo: cut.directionNoteKo, completed: false }));
  if (preservedUrls.length > 0) {
    checklistItems.push({ id: "check-source-citations", labelKo: `원문 출처 ${preservedUrls.length}건 권리·인용 대조`, doneCriteriaKo: "모든 참고 출처 URL이 명세와 콘티 노트에 유지됨", completed: false });
  }

  const sourceLinks: readonly LivingSpecSourceLink[] = Object.freeze(preservedUrls.map((url, idx) => ({ labelKo: `원문 출처 ${idx + 1}`, url })));
  const rightsAssets: readonly StoryRightsAssetTag[] = Object.freeze(
    sourceLinks.map(
      (link, idx): StoryRightsAssetTag => ({
        id: `fresh-ideas-ref-${idx + 1}`,
        name: link.labelKo,
        license: "reference-only",
        sourceRef: link.url,
      }),
    ),
  );
  const evidenceCitations: readonly ProposalEvidenceCitation[] = Object.freeze(
    sourceLinks.length > 0 ? sourceLinks.map((link) => ({ sourceDocId: link.url, quote: meta.headlineKo })) : [{ sourceDocId: `fresh-ideas:${meta.lensId}`, quote: meta.headlineKo }],
  );

  const nodeSnapshot: StoryNodeSnapshot = Object.freeze({
    id: episodeNodeId,
    title: `${meta.sourceTitle} (${meta.lensLabelKo})`,
    summary: [`목표: ${goalKo}`, `핵심 갈등: ${coreConflictKo}`, `체크리스트: ${checklistItems.map((item) => item.labelKo).join(" / ")}`, ...(sourceLinks.length > 0 ? [`출처: ${sourceLinks.map((link) => link.url).join(", ")}`] : [])].join("\n"),
    dialogueLines: Object.freeze(cutSeed.cuts.map((c) => c.dialogueLineKo)),
    rightsAssets: rightsAssets.length > 0 ? rightsAssets : undefined,
  });

  const cutNodeSnapshots: readonly StoryNodeSnapshot[] = Object.freeze(
    cutSeed.cuts.map((cut) => ({
      id: createStoryNodeId("CUT", `CUT-${episodeNumber}-${cut.cutNumber}`),
      title: `컷 ${cut.cutNumber} · ${cut.beatLabelKo}`,
      summary: cut.actionLineKo,
      parentKey: targetNodeKey,
      order: cut.cutNumber,
      dialogueLines: [cut.dialogueLineKo],
      cutSlots: createEmptyCutReadinessSlots({
        emotionalBeat: cut.beatLabelKo,
        cameraAngleLens: cut.directionNoteKo,
        keyAction: cut.actionLineKo,
        keyDialogue: cut.dialogueLineKo,
        actors: cut.speakerKo ? [cut.speakerKo] : undefined,
      }),
    })),
  );

  return Object.freeze({
    targetNodeKey,
    episodeTitleKo: meta.sourceTitle,
    goalKo,
    coreConflictKo,
    checklist: Object.freeze(checklistItems),
    sourceLinks,
    preservedUrls,
    nodeSnapshot,
    proposalInput: Object.freeze({
      targetEntityId: targetNodeKey,
      op: "update",
      source: "cross_doc_sync",
      title: `아이디어 리믹스 시드 반영 · ${meta.lensLabelKo}`,
      rationale: `${meta.sourceTitle}의 ${meta.lensLabelKo} 관점에서 도출한 목표·핵심 갈등·${cutSeed.cuts.length}컷 초안을 회차 명세에 연결합니다.`,
      proposedSnapshot: nodeSnapshot,
      evidenceCitations,
      createdAt: input.createdAt,
    }),
    cutNodeSnapshots,
    episodePlanPatch: Object.freeze({
      goal: goalKo,
      coreConflict: coreConflictKo,
      logline: goalKo,
      turningPoints: Object.freeze(cutSeed.cuts.map((cut) => `${cut.beatLabelKo}: ${cut.dialogueLineKo}`)),
    }),
  });
}

/** 컷 시드 초안과 Story Living Spec 패치를 한 번에 생성해 UI 콜백·클립보드로 전달한다. */
export function buildFreshIdeasStorySeedPayload(
  source: FreshIdeasStorySeedSource,
  options?: FreshIdeasStorySeedOptions,
): FreshIdeasStorySeedPayload {
  const input = normalizeSource(source, options);
  const cutSeed = buildStoryCutSeedFromFreshIdeas(input);
  const livingSpecSeed = buildLivingSpecSeedFromFreshIdeas(input);
  const specSummaryBlock = [
    "## 스토리 기획 명세 초안",
    `- 목표: ${livingSpecSeed.goalKo}`,
    `- 핵심 갈등: ${livingSpecSeed.coreConflictKo}`,
    ...livingSpecSeed.checklist.map((item) => `- [ ] ${item.labelKo} (${item.doneCriteriaKo})`),
  ].join("\n");

  return Object.freeze({
    sourceTitle: cutSeed.sourceTitle,
    register: cutSeed.register,
    lensId: cutSeed.lensId,
    lensLabelKo: cutSeed.lensLabelKo,
    cutSeed,
    livingSpecSeed,
    clipboardTextKo: `${cutSeed.clipboardMarkdownKo}\n\n${specSummaryBlock}`,
    summaryKo: `스토리 컷 시드 ${cutSeed.cuts.length}컷 · 기획 명세 체크리스트 ${livingSpecSeed.checklist.length}건 준비 완료 (${cutSeed.lensLabelKo})`,
  });
}

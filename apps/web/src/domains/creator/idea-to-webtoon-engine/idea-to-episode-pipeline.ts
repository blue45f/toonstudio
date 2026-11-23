/**
 * 아이디어 → 완성 웹툰 6단계 멀티모달 에이전트 결정론적 자동화 파이프라인.
 *
 * Stage 1: 서사 비트 아키텍트 (기·승·전·결·엔딩 클리프행어 비트 시트)
 * Stage 2: 캐릭터 바이블 & 장기 일관성 DNA 락 (외형·팔레트·말투·소품·관계망)
 * Stage 3: 스크롤 호흡 & 컷별 연출 시트 (카메라 샷·높이/여백 px·대사·SFX·3D 배경)
 * Stage 4: 장기 연재 연속성·모순 감사기 + 원클릭 자동 교정
 * Stage 5: 감정 곡선 연동 적응형 OST & 사운드 큐 편성기
 * Stage 6: ToonStudio 프로젝트 블루프린트 JSON 컴파일러 & 검증기
 */

import {
  WEBTOON_GENRE_CATALOG,
  type WebtoonGenreSpec,
} from "./idea-to-episode-catalog";
import {
  auditEpisodeContinuity,
  injectDemoContinuityFaults,
  repairContinuityCore,
} from "./idea-to-episode-continuity";
import {
  STUDIO_STANDARD_LAYERS,
  compileToonStudioBlueprintJson,
  computeTotalStripHeightPx,
  generateAdaptiveOstCues,
  serializeEpisodeBlueprintJson,
  validateToonStudioBlueprintJson,
} from "./idea-to-episode-output";
import {
  EPISODE_LENGTH_SPECS,
  WEBTOON_STRIP_WIDTH_PX,
  type AdaptiveOstEmotionCue,
  type BilingualLine,
  type CameraShotType,
  type CharacterDnaLock,
  type CompiledWebtoonEpisodePlan,
  type ContinuityAuditReport,
  type EpisodeLengthId,
  type GeneratedPanelBlueprint,
  type IdeaPipelineLocale,
  type IdeaToWebtoonInput,
  type PanelDialogueBubble,
  type PipelineAgentStep,
  type ScrollTempoId,
  type StoryActId,
  type StoryBeatNode,
  type TimeOfDayId,
  type WebtoonGenreId,
} from "./idea-to-episode-types";

export {
  auditEpisodeContinuity,
  compileToonStudioBlueprintJson,
  generateAdaptiveOstCues,
  injectDemoContinuityFaults,
  serializeEpisodeBlueprintJson,
  validateToonStudioBlueprintJson,
};

const HANGUL_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ]/u;

const ACT_SEQUENCE: readonly StoryActId[] = [
  "setup",
  "development",
  "turn",
  "climax",
  "cliffhanger",
] as const;

const SHOT_PATTERNS_BY_ACT: Readonly<Record<StoryActId, readonly CameraShotType[]>> = {
  setup: ["WS", "BirdEye", "MS", "CU", "WS"],
  development: ["MS", "CU", "WS", "MS", "CU", "Dutch"],
  turn: ["Dutch", "ECU", "WS", "CU", "Dutch"],
  climax: ["WS", "ECU", "Dutch", "CU", "BirdEye", "ECU"],
  cliffhanger: ["ECU", "BirdEye"],
};

/** 결정론적 32-bit FNV-1a 해시. */
export function fnv1aHash32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function formatHexHash(input: string): string {
  return fnv1aHash32(input).toString(16).padStart(8, "0").toUpperCase();
}

function resolvePanelCount(lengthId: EpisodeLengthId): 4 | 12 | 24 {
  return EPISODE_LENGTH_SPECS.find((spec) => spec.id === lengthId)?.panelCount ?? 12;
}

function extractMotif(logline: string, maxLen: number): string {
  const cleaned = logline.trim().replace(/\s+/g, " ");
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1).trimEnd()}…`;
}

function buildEpisodeTitle(
  spec: WebtoonGenreSpec,
  logline: string,
  lengthId: EpisodeLengthId,
): BilingualLine {
  const motif = extractMotif(logline, 18);
  const hasHangul = HANGUL_RE.test(motif);
  const suffixKo = lengthId === "shorts-4" ? "쇼츠" : lengthId === "prologue-12" ? "프롤로그" : "제1화";
  const suffixEn = lengthId === "shorts-4" ? "Shorts" : lengthId === "prologue-12" ? "Prologue" : "Episode 1";
  return {
    ko: hasHangul && motif.length >= 4
      ? `${spec.titlePrefix.ko} · ${suffixKo} (${motif})`
      : `${spec.titlePrefix.ko} · ${suffixKo}`,
    en: !hasHangul && motif.length >= 4
      ? `${spec.titlePrefix.en} — ${suffixEn} (${motif})`
      : `${spec.titlePrefix.en} — ${suffixEn}`,
  };
}

function computeActPanelMap(lengthId: EpisodeLengthId): Readonly<Record<StoryActId, readonly number[]>> {
  if (lengthId === "shorts-4") {
    return { setup: [1], development: [2], turn: [3], climax: [4], cliffhanger: [4] };
  }
  if (lengthId === "prologue-12") {
    return {
      setup: [1, 2, 3],
      development: [4, 5, 6],
      turn: [7, 8],
      climax: [9, 10, 11],
      cliffhanger: [12],
    };
  }
  return {
    setup: [1, 2, 3, 4, 5],
    development: [6, 7, 8, 9, 10, 11],
    turn: [12, 13, 14, 15, 16],
    climax: [17, 18, 19, 20, 21, 22],
    cliffhanger: [23, 24],
  };
}

/** Stage 1: 서사 비트 아키텍트 — 기·승·전·결·엔딩 클리프행어 5비트 시트 생성. */
export function generateStoryBeats(
  logline: string,
  genre: WebtoonGenreId,
  lengthId: EpisodeLengthId,
  deterministicSeed: string,
): readonly StoryBeatNode[] {
  const spec = WEBTOON_GENRE_CATALOG[genre];
  const actPanelMap = computeActPanelMap(lengthId);
  const seedShift = fnv1aHash32(`${deterministicSeed}:beats`) % 7;
  const trimmed = logline.trim();
  const hasHangul = HANGUL_RE.test(trimmed);
  const koContext = hasHangul && trimmed.length > 0 ? extractMotif(trimmed, 34) : spec.defaultLogline.ko;
  const enContext = !hasHangul && trimmed.length > 0 ? extractMotif(trimmed, 44) : spec.defaultLogline.en;

  const baseTension: Readonly<Record<StoryActId, number>> = {
    setup: 30 + seedShift,
    development: 52 + seedShift,
    turn: 74 + Math.floor(seedShift / 2),
    climax: 88 + Math.floor(seedShift / 2),
    cliffhanger: 94 + Math.min(4, seedShift),
  };

  return ACT_SEQUENCE.map((act, index) => {
    const panels = actPanelMap[act];
    const isCliff = act === "cliffhanger";
    const summary: BilingualLine =
      act === "setup"
        ? { ko: `핵심 로그라인("${koContext}")을 첫 화면에 각인하고 세계관 규칙을 제시한다.`, en: `Anchor the premise ("${enContext}") in the opening strip and establish world rules.` }
        : act === "development"
          ? { ko: `주연·조연의 이해관계와 말투·소품 복선을 교차 배치해 갈등을 키운다.`, en: `Interleave protagonist goals, ally chemistry, and prop clues to raise stakes.` }
          : act === "turn"
            ? { ko: `대립 세력의 함정과 예기치 못한 단서로 기존 가정을 뒤집는다.`, en: `Flip reader assumptions with an antagonist ambush and a disruptive clue.` }
            : act === "climax"
              ? { ko: `압축 여백과 대비 앵글 연타로 감정·액션 에너지를 최고점으로 몰아붙인다.`, en: `Compress vertical gutters and slam contrast angles to peak emotional impact.` }
              : { ko: `확장 여백 뒤 마지막 1컷 반전과 질문으로 다음 화 클릭을 유도한다.`, en: `Expand scroll silence into a final twist frame that compels the next episode.` };

    return {
      beatId: `beat-${index + 1}-${act}`,
      act,
      order: index + 1,
      title: spec.beatTitles[act],
      summary,
      tensionScore: Math.min(99, baseTension[act]),
      panelIndices: panels,
      isCliffhanger: isCliff,
      ...(isCliff ? { hookQuestion: spec.hookQuestion } : {}),
    };
  });
}

/** Stage 2: 캐릭터 바이블 & 장기 일관성 DNA 락 생성. */
export function generateCharacterDnaLocks(
  genre: WebtoonGenreId,
  deterministicSeed: string,
): readonly CharacterDnaLock[] {
  const spec = WEBTOON_GENRE_CATALOG[genre];
  const ids = spec.characters.map((seed) => `char-${genre}-${seed.idSuffix}`);

  return spec.characters.map((seed, idx) => {
    const charId = ids[idx];
    const relationships = seed.relationToIndex.map((rel) => {
      const targetSeed = spec.characters[rel.targetIdx];
      return {
        targetCharacterId: ids[rel.targetIdx],
        targetName: targetSeed.name,
        relationType: rel.relationType,
        summary: rel.summary,
      };
    });

    const dnaMaterial = [
      deterministicSeed,
      charId,
      seed.lockedOutfitId,
      seed.speechRegister,
      seed.appearanceAnchors.map((a) => a.en).join("|"),
    ].join("::");

    return {
      id: charId,
      role: seed.role,
      name: seed.name,
      appearanceAnchors: seed.appearanceAnchors,
      lockedOutfitId: seed.lockedOutfitId,
      lockedOutfitLabel: seed.lockedOutfitLabel,
      signaturePaletteTokens: seed.signaturePaletteTokens,
      speechRegister: seed.speechRegister,
      speechRegisterRule: seed.speechRegisterRule,
      propsInventory: seed.propsInventory,
      relationships,
      consistencyHash: `DNA-${formatHexHash(dnaMaterial)}`,
    };
  });
}

function resolvePanelAct(panelIndex: number, lengthId: EpisodeLengthId): StoryActId {
  if (lengthId === "shorts-4") {
    if (panelIndex === 1) return "setup";
    if (panelIndex === 2) return "development";
    if (panelIndex === 3) return "turn";
    return "cliffhanger";
  }
  if (lengthId === "prologue-12") {
    if (panelIndex <= 3) return "setup";
    if (panelIndex <= 6) return "development";
    if (panelIndex <= 8) return "turn";
    if (panelIndex <= 11) return "climax";
    return "cliffhanger";
  }
  if (panelIndex <= 5) return "setup";
  if (panelIndex <= 11) return "development";
  if (panelIndex <= 16) return "turn";
  if (panelIndex <= 22) return "climax";
  return "cliffhanger";
}

function resolveScrollPacing(
  act: StoryActId,
  panelIndex: number,
  tensionScore: number,
  seedNum: number,
): { readonly panelHeightPx: number; readonly gutterBeforePx: number; readonly scrollTempo: ScrollTempoId } {
  const jitter = (seedNum + panelIndex * 17) % 45;
  if (act === "cliffhanger") {
    return {
      panelHeightPx: 1320 + jitter,
      gutterBeforePx: 420 + (jitter % 60),
      scrollTempo: "cliffhanger-drop",
    };
  }
  if (act === "climax") {
    return {
      panelHeightPx: 1080 + jitter * 2,
      gutterBeforePx: 64 + (jitter % 28),
      scrollTempo: "compressed-action",
    };
  }
  if (act === "turn" || tensionScore >= 72) {
    return {
      panelHeightPx: 1020 + jitter,
      gutterBeforePx: 290 + (jitter % 70),
      scrollTempo: "expanded-tension",
    };
  }
  return {
    panelHeightPx: 820 + jitter * 2,
    gutterBeforePx: panelIndex === 1 ? 0 : 150 + (jitter % 44),
    scrollTempo: "steady-dialogue",
  };
}

/** Stage 3: 스크롤 호흡 & 컷별 연출 시트 생성. */
export function generatePanelBlueprints(
  genre: WebtoonGenreId,
  lengthId: EpisodeLengthId,
  storyBeats: readonly StoryBeatNode[],
  characters: readonly CharacterDnaLock[],
  deterministicSeed: string,
): readonly GeneratedPanelBlueprint[] {
  const spec = WEBTOON_GENRE_CATALOG[genre];
  const panelCount = resolvePanelCount(lengthId);
  const seedNum = fnv1aHash32(`${deterministicSeed}:panels`);
  const beatByAct = new Map<StoryActId, StoryBeatNode>(
    storyBeats.map((beat) => [beat.act, beat]),
  );

  const panels: GeneratedPanelBlueprint[] = [];

  for (let i = 0; i < panelCount; i += 1) {
    const panelIndex = i + 1;
    const act = resolvePanelAct(panelIndex, lengthId);
    const beat = beatByAct.get(act) ?? storyBeats[0];
    const isLast = panelIndex === panelCount;

    const pool = SHOT_PATTERNS_BY_ACT[act];
    let cameraShot = pool[(i + (seedNum % pool.length)) % pool.length];
    const prev1 = panels[i - 1]?.cameraShot;
    const prev2 = panels[i - 2]?.cameraShot;
    if (prev1 && prev2 && cameraShot === prev1 && prev1 === prev2) {
      cameraShot = pool[(pool.indexOf(cameraShot) + 1) % pool.length];
    }

    const actProgress = i / Math.max(1, panelCount - 1);
    const waveDelta = Math.round(Math.sin(panelIndex * 1.15) * 6);
    const rawTension = isLast
      ? Math.max(93, beat.tensionScore)
      : Math.max(18, Math.min(96, beat.tensionScore + waveDelta));

    const { panelHeightPx, gutterBeforePx, scrollTempo } = resolveScrollPacing(
      act,
      panelIndex,
      rawTension,
      seedNum,
    );

    const timeIdx = Math.min(
      spec.timeProgression.length - 1,
      Math.floor(actProgress * spec.timeProgression.length),
    );
    const timeOfDay: TimeOfDayId = spec.timeProgression[timeIdx];
    const timeSlotOrder = timeIdx;

    const lead = characters[0];
    const ally = characters[1];
    const rival = characters[2];
    const activeChars: readonly CharacterDnaLock[] =
      act === "setup"
        ? [lead]
        : act === "development"
          ? [lead, ally]
          : act === "turn" || act === "climax"
            ? [lead, rival]
            : [lead, ally];

    const outfitAssignments: Record<string, string> = {};
    for (const ch of activeChars) {
      outfitAssignments[ch.id] = ch.lockedOutfitId;
    }

    const dialogueBank = spec.actDialogues[act];
    const primaryLine = dialogueBank[i % dialogueBank.length];
    const primarySpeaker = activeChars[i % activeChars.length];
    const dialogues: PanelDialogueBubble[] = [
      {
        id: `p${panelIndex}-dlg-1`,
        speakerId: primarySpeaker.id,
        speakerName: primarySpeaker.name,
        speechRegister: primarySpeaker.speechRegister,
        kind: isLast ? "narration" : act === "climax" ? "shout" : "speech",
        text: primaryLine,
      },
    ];

    if (!isLast && activeChars.length > 1 && dialogueBank.length > 1 && i % 2 === 1) {
      const secondarySpeaker = activeChars[(i + 1) % activeChars.length];
      const secondaryLine = dialogueBank[(i + 1) % dialogueBank.length];
      dialogues.push({
        id: `p${panelIndex}-dlg-2`,
        speakerId: secondarySpeaker.id,
        speakerName: secondarySpeaker.name,
        speechRegister: secondarySpeaker.speechRegister,
        kind: act === "turn" ? "thought" : "speech",
        text: secondaryLine,
      });
    }

    const sfxList = spec.sfxPool[act];
    const sfx = sfxList[i % sfxList.length];
    const bgPreset =
      spec.bg3dPresets[
        Math.min(spec.bg3dPresets.length - 1, Math.floor(actProgress * spec.bg3dPresets.length))
      ];

    panels.push({
      panelIndex,
      panelId: `panel-${String(panelIndex).padStart(2, "0")}`,
      beatId: beat.beatId,
      act,
      cameraShot,
      panelWidthPx: WEBTOON_STRIP_WIDTH_PX,
      panelHeightPx,
      gutterBeforePx,
      scrollTempo,
      tensionScore: rawTension,
      timeOfDay,
      timeSlotOrder,
      isFlashback: false,
      featuredCharacterIds: activeChars.map((ch) => ch.id),
      outfitAssignments,
      dialogues,
      sfx,
      bg3dPresetId: bgPreset.presetId,
      bg3dPresetLabel: bgPreset.label,
      lightingMood: bgPreset.lightingMood,
      visualDirection: {
        ko: `${cameraShot} 앵글 · ${bgPreset.label.ko} 배경 위 ${primarySpeaker.name.ko} 중심 구도 (${bgPreset.lightingMood.ko})`,
        en: `${cameraShot} framing on ${primarySpeaker.name.en} inside ${bgPreset.label.en} (${bgPreset.lightingMood.en})`,
      },
      isCliffhangerPanel: isLast,
    });
  }

  return panels;
}

function buildPipelineStages(params: {
  readonly storyBeats: readonly StoryBeatNode[];
  readonly characters: readonly CharacterDnaLock[];
  readonly panels: readonly GeneratedPanelBlueprint[];
  readonly continuityAudit: ContinuityAuditReport;
  readonly ostCues: readonly AdaptiveOstEmotionCue[];
  readonly repairCount: number;
}): readonly PipelineAgentStep[] {
  const auditStatus = params.continuityAudit.passed
    ? params.repairCount > 0
      ? "repaired"
      : "completed"
    : "warning";

  return [
    {
      stageNumber: 1,
      stageId: "story-beats",
      agentName: { ko: "서사 아키텍트", en: "Story Architect" },
      title: { ko: "기·승·전·결 비트 시트", en: "5-Act Beat Sheet" },
      summary: {
        ko: `${params.storyBeats.length}단계 서사 비트 · 클리프행어 훅 고정`,
        en: `${params.storyBeats.length} story beats with locked cliffhanger hook`,
      },
      artifactCount: params.storyBeats.length,
      status: "completed",
    },
    {
      stageNumber: 2,
      stageId: "character-dna",
      agentName: { ko: "캐릭터 바이블 에이전트", en: "Character Bible Agent" },
      title: { ko: "캐릭터 DNA 락", en: "Character DNA Lock" },
      summary: {
        ko: `주연·조연 ${params.characters.length}인 외형·팔레트·말투 잠금`,
        en: `${params.characters.length} cast DNA locks (outfit, register, props)`,
      },
      artifactCount: params.characters.length,
      status: "completed",
    },
    {
      stageNumber: 3,
      stageId: "scroll-panels",
      agentName: { ko: "스크롤 연출 디렉터", en: "Scroll Pacing Director" },
      title: { ko: "컷 분할·호흡 연출", en: "Scroll & Panel Sheet" },
      summary: {
        ko: `${params.panels.length}컷 샷·여백(px)·대사·3D 배경 배정`,
        en: `${params.panels.length} panels with shots, gutters, SFX, and 3D sets`,
      },
      artifactCount: params.panels.length,
      status: "completed",
    },
    {
      stageNumber: 4,
      stageId: "continuity-audit",
      agentName: { ko: "장기 연속성 감사관", en: "Continuity Auditor" },
      title: { ko: "연속성·모순 감사", en: "Continuity Audit" },
      summary: params.continuityAudit.passed
        ? {
            ko: `5대 규칙 검증 통과 · 연속성 ${params.continuityAudit.score}점`,
            en: `All 5 rules passed · ${params.continuityAudit.score}/100 health`,
          }
        : {
            ko: `모순 ${params.continuityAudit.findings.length}건 검출 · 자동 교정 대기`,
            en: `${params.continuityAudit.findings.length} issues flagged · auto-repair ready`,
          },
      artifactCount: params.continuityAudit.findings.length,
      status: auditStatus,
    },
    {
      stageNumber: 5,
      stageId: "adaptive-ost",
      agentName: { ko: "적응형 사운드 디렉터", en: "Adaptive OST Director" },
      title: { ko: "감정 곡선 OST 큐", en: "Adaptive OST Cues" },
      summary: {
        ko: `${params.ostCues.length}개 악장 · BPM/조성·크로스페이드 편성`,
        en: `${params.ostCues.length} dynamic music cues synced to tension curve`,
      },
      artifactCount: params.ostCues.length,
      status: "completed",
    },
    {
      stageNumber: 6,
      stageId: "studio-blueprint",
      agentName: { ko: "블루프린트 컴파일러", en: "Studio Compiler" },
      title: { ko: "프로젝트 JSON 컴파일", en: "Project JSON Output" },
      summary: {
        ko: "ToonStudio v2 규격 · 8레이어 캔버스 좌표 확정",
        en: "ToonStudio v2 blueprint · 8 studio layers compiled",
      },
      artifactCount: STUDIO_STANDARD_LAYERS.length,
      status: "completed",
    },
  ];
}

/** 1줄 아이디어 → 6단계 전체 웹툰 에피소드 플랜 결정론 컴파일. */
export function compileIdeaToWebtoonEpisode(
  input: IdeaToWebtoonInput,
): CompiledWebtoonEpisodePlan {
  const locale: IdeaPipelineLocale = input.locale ?? "ko";
  const spec = WEBTOON_GENRE_CATALOG[input.genre];
  const effectiveLogline = input.logline.trim() || spec.defaultLogline[locale];
  const seedHex = formatHexHash(
    `${input.genre}|${input.lengthId}|${effectiveLogline.toLowerCase()}`,
  );
  const deterministicSeed = `IDEA-${input.genre.toUpperCase()}-${seedHex}`;
  const episodeTitle = buildEpisodeTitle(spec, effectiveLogline, input.lengthId);

  const storyBeats = generateStoryBeats(
    effectiveLogline,
    input.genre,
    input.lengthId,
    deterministicSeed,
  );
  const characters = generateCharacterDnaLocks(input.genre, deterministicSeed);
  const panels = generatePanelBlueprints(
    input.genre,
    input.lengthId,
    storyBeats,
    characters,
    deterministicSeed,
  );
  const continuityAudit = auditEpisodeContinuity({
    deterministicSeed,
    characters,
    storyBeats,
    panels,
  });
  const ostCues = generateAdaptiveOstCues(input.genre, panels);
  const studioBlueprint = compileToonStudioBlueprintJson({
    deterministicSeed,
    locale,
    episodeTitle,
    logline: effectiveLogline,
    genre: input.genre,
    lengthId: input.lengthId,
    characters,
    storyBeats,
    panels,
    ostCues,
    continuityAudit,
  });
  const totalStripHeightPx = computeTotalStripHeightPx(panels);
  const stages = buildPipelineStages({
    storyBeats,
    characters,
    panels,
    continuityAudit,
    ostCues,
    repairCount: 0,
  });

  return {
    planId: `plan-${seedHex.toLowerCase()}`,
    deterministicSeed,
    logline: effectiveLogline,
    locale,
    episodeTitle,
    genre: input.genre,
    lengthId: input.lengthId,
    stages,
    storyBeats,
    characters,
    panels,
    continuityAudit,
    ostCues,
    studioBlueprint,
    totalStripHeightPx,
    repairCount: 0,
  };
}

/** Stage 4 원클릭 자동 교정: 모든 연속성 모순을 0건으로 해소하고 Stage 5·6을 재동기화한다. */
export function autoRepairEpisodeContinuity(
  plan: CompiledWebtoonEpisodePlan,
): CompiledWebtoonEpisodePlan {
  const { storyBeats, panels } = repairContinuityCore(plan);
  const continuityAudit = auditEpisodeContinuity({
    deterministicSeed: plan.deterministicSeed,
    characters: plan.characters,
    storyBeats,
    panels,
  });
  const ostCues = generateAdaptiveOstCues(plan.genre, panels);
  const studioBlueprint = compileToonStudioBlueprintJson({
    deterministicSeed: plan.deterministicSeed,
    locale: plan.locale,
    episodeTitle: plan.episodeTitle,
    logline: plan.logline,
    genre: plan.genre,
    lengthId: plan.lengthId,
    characters: plan.characters,
    storyBeats,
    panels,
    ostCues,
    continuityAudit,
  });
  const nextRepairCount = plan.repairCount + 1;
  const stages = buildPipelineStages({
    storyBeats,
    characters: plan.characters,
    panels,
    continuityAudit,
    ostCues,
    repairCount: nextRepairCount,
  });

  return {
    ...plan,
    storyBeats,
    panels,
    continuityAudit,
    ostCues,
    studioBlueprint,
    totalStripHeightPx: computeTotalStripHeightPx(panels),
    stages,
    repairCount: nextRepairCount,
  };
}

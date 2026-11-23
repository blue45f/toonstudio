/**
 * Stage 5 (적응형 감정 곡선 OST & 사운드 큐 생성기) 및
 * Stage 6 (ToonStudio 프로젝트 블루프린트 JSON 컴파일러·직렬화·검증기).
 */

import { WEBTOON_GENRE_CATALOG } from "./idea-to-episode-catalog";
import {
  WEBTOON_EXPORT_SLICE_HEIGHT_PX,
  WEBTOON_STRIP_WIDTH_PX,
  type AdaptiveOstEmotionCue,
  type BilingualLine,
  type BlueprintValidationResult,
  type CharacterDnaLock,
  type CompiledWebtoonEpisodePlan,
  type ContinuityAuditReport,
  type EpisodeLengthId,
  type GeneratedPanelBlueprint,
  type IdeaPipelineLocale,
  type StoryActId,
  type StoryBeatNode,
  type StudioBlueprintLayerSpec,
  type StudioBlueprintPanelNode,
  type ToonStudioBlueprintJsonDocument,
  type WebtoonGenreId,
} from "./idea-to-episode-types";

const HANGUL_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ]/u;

interface BilingualLayerTemplate {
  readonly layerId: string;
  readonly kind: StudioBlueprintLayerSpec["kind"];
  readonly label: BilingualLine;
  readonly locked: boolean;
  readonly visible: boolean;
}

export const STUDIO_STANDARD_LAYERS: readonly BilingualLayerTemplate[] = [
  { layerId: "layer-bg3d-ref", kind: "bg3d", label: { ko: "3D 배경 참조", en: "3D Background Reference" }, locked: true, visible: true },
  { layerId: "layer-rough-layout", kind: "sketch", label: { ko: "콘티 러프", en: "Rough Storyboard" }, locked: false, visible: true },
  { layerId: "layer-character-ink", kind: "ink", label: { ko: "캐릭터 펜선", en: "Character Ink" }, locked: false, visible: true },
  { layerId: "layer-flat-color", kind: "color", label: { ko: "DNA 팔레트 채색", en: "DNA Palette Flat Color" }, locked: false, visible: true },
  { layerId: "layer-lighting-fx", kind: "lighting", label: { ko: "조명·효과 레이어", en: "Lighting & Rim FX" }, locked: false, visible: true },
  { layerId: "layer-speech-lettering", kind: "lettering", label: { ko: "말풍선·식자", en: "Speech Lettering" }, locked: false, visible: true },
  { layerId: "layer-sfx-vector", kind: "sfx", label: { ko: "효과음(SFX) 벡터", en: "Vector SFX" }, locked: false, visible: true },
  { layerId: "layer-ost-markers", kind: "audio-cue", label: { ko: "적응형 OST 큐 마커", en: "Adaptive OST Cue Markers" }, locked: true, visible: true },
] as const;

export function computeTotalStripHeightPx(
  panels: readonly GeneratedPanelBlueprint[],
): number {
  return panels.reduce((sum, panel) => sum + panel.gutterBeforePx + panel.panelHeightPx, 0);
}

/** Stage 5: 감정 곡선 연동 적응형 OST & 사운드 큐 생성기. */
export function generateAdaptiveOstCues(
  genre: WebtoonGenreId,
  panels: readonly GeneratedPanelBlueprint[],
): readonly AdaptiveOstEmotionCue[] {
  const spec = WEBTOON_GENRE_CATALOG[genre];
  if (panels.length === 0) return [];

  const grouped: { readonly act: StoryActId; readonly items: GeneratedPanelBlueprint[] }[] = [];
  for (const panel of panels) {
    const tail = grouped[grouped.length - 1];
    if (tail && tail.act === panel.act) {
      tail.items.push(panel);
    } else {
      grouped.push({ act: panel.act, items: [panel] });
    }
  }

  const emotionByAct: Readonly<Record<StoryActId, BilingualLine>> = {
    setup: { ko: "세계관 도입 · 잔잔한 몰입", en: "World Entry · Calm Immersion" },
    development: { ko: "관계 긴장 · 리듬 상승", en: "Rising Intrigue · Building Pulse" },
    turn: { ko: "서스펜스 전환 · 불협 긴박", en: "Twist Suspense · Sharp Tension" },
    climax: { ko: "최고조 충돌 · 폭발 타격", en: "Peak Collision · Full Impact" },
    cliffhanger: { ko: "정적 드롭 · 여운 클리프행어", en: "Silence Drop · Haunting Hook" },
  };

  return grouped.map((group, idx) => {
    const avgTension = Math.round(
      group.items.reduce((acc, item) => acc + item.tensionScore, 0) / group.items.length,
    );
    const bpmOffset = Math.round((avgTension - 45) * 0.65);
    const bpm = Math.max(66, Math.min(172, spec.ost.baseBpm + bpmOffset));
    const instruments =
      avgTension >= 82
        ? spec.ost.climaxInstruments
        : avgTension >= 55
          ? spec.ost.tensionInstruments
          : spec.ost.calmInstruments;
    const crossfadeDurationSec =
      group.act === "climax" || group.act === "turn"
        ? 0.8
        : group.act === "cliffhanger"
          ? 1.4
          : 2.6;

    return {
      cueId: `ost-cue-${idx + 1}-${group.act}`,
      startPanelIndex: group.items[0].panelIndex,
      endPanelIndex: group.items[group.items.length - 1].panelIndex,
      act: group.act,
      emotionTag: emotionByAct[group.act],
      averageTension: avgTension,
      bpm,
      musicalKey: spec.ost.keysByAct[group.act],
      instrumentLayers: instruments,
      crossfadeDurationSec,
      crossfadeEntryPanel: group.items[0].panelIndex,
      intensityCurve: group.items.map((item) => item.tensionScore),
    };
  });
}

/** Stage 6: ToonStudio 프로젝트 블루프린트 JSON 컴파일러. */
export function compileToonStudioBlueprintJson(params: {
  readonly deterministicSeed: string;
  readonly locale: IdeaPipelineLocale;
  readonly episodeTitle: BilingualLine;
  readonly logline: string;
  readonly genre: WebtoonGenreId;
  readonly lengthId: EpisodeLengthId;
  readonly characters: readonly CharacterDnaLock[];
  readonly storyBeats: readonly StoryBeatNode[];
  readonly panels: readonly GeneratedPanelBlueprint[];
  readonly ostCues: readonly AdaptiveOstEmotionCue[];
  readonly continuityAudit: ContinuityAuditReport;
}): ToonStudioBlueprintJsonDocument {
  const { locale } = params;
  let runningY = 0;
  const blueprintPanels: StudioBlueprintPanelNode[] = params.panels.map((panel) => {
    runningY += panel.gutterBeforePx;
    const yOffsetPx = runningY;
    runningY += panel.panelHeightPx;
    return {
      panelId: panel.panelId,
      panelIndex: panel.panelIndex,
      act: panel.act,
      yOffsetPx,
      widthPx: panel.panelWidthPx,
      heightPx: panel.panelHeightPx,
      gutterBeforePx: panel.gutterBeforePx,
      cameraShot: panel.cameraShot,
      tensionScore: panel.tensionScore,
      bg3dPresetId: panel.bg3dPresetId,
      sfxText: panel.sfx[locale],
      dialogueCount: panel.dialogues.length,
      dialogues: panel.dialogues.map((dlg) => ({
        id: dlg.id,
        speakerId: dlg.speakerId,
        kind: dlg.kind,
        text: dlg.text[locale],
      })),
      isCliffhangerPanel: panel.isCliffhangerPanel,
    };
  });

  const totalStripHeightPx = runningY;
  const safeLogline =
    locale === "en" && HANGUL_RE.test(params.logline)
      ? WEBTOON_GENRE_CATALOG[params.genre].defaultLogline.en
      : params.logline;

  return {
    schemaVersion: "toonstudio.episode-blueprint.v2",
    generator: "toonstudio-idea-to-webtoon-6stage",
    deterministicSeed: params.deterministicSeed,
    locale,
    episodeMeta: {
      title: params.episodeTitle[locale],
      logline: safeLogline,
      genre: params.genre,
      lengthId: params.lengthId,
      panelCount: blueprintPanels.length,
      stripWidthPx: WEBTOON_STRIP_WIDTH_PX,
      totalStripHeightPx,
      continuityScore: params.continuityAudit.score,
    },
    canvas: {
      widthPx: WEBTOON_STRIP_WIDTH_PX,
      totalHeightPx: totalStripHeightPx,
      readingDirection: "ttb",
      exportSliceHeightPx: WEBTOON_EXPORT_SLICE_HEIGHT_PX,
      colorSpace: "oklch-srgb-managed",
    },
    characterBible: params.characters.map((character) => ({
      id: character.id,
      role: character.role,
      name: character.name[locale],
      lockedOutfitId: character.lockedOutfitId,
      speechRegister: character.speechRegister,
      paletteCssVars: character.signaturePaletteTokens.map((token) => token.cssVar),
      consistencyHash: character.consistencyHash,
    })),
    storyBeats: params.storyBeats.map((beat) => ({
      beatId: beat.beatId,
      act: beat.act,
      title: beat.title[locale],
      tensionScore: beat.tensionScore,
      panelIndices: beat.panelIndices,
      isCliffhanger: beat.isCliffhanger,
    })),
    layers: STUDIO_STANDARD_LAYERS.map((layer) => ({
      layerId: layer.layerId,
      kind: layer.kind,
      label: layer.label[locale],
      locked: layer.locked,
      visible: layer.visible,
    })),
    panels: blueprintPanels,
    audioTrackCues: params.ostCues.map((cue) => ({
      cueId: cue.cueId,
      startPanelIndex: cue.startPanelIndex,
      endPanelIndex: cue.endPanelIndex,
      bpm: cue.bpm,
      musicalKey: cue.musicalKey,
      crossfadeDurationSec: cue.crossfadeDurationSec,
      averageTension: cue.averageTension,
    })),
    auditSummary: {
      score: params.continuityAudit.score,
      passed: params.continuityAudit.passed,
      findingCount: params.continuityAudit.findings.length,
    },
  };
}

/** Stage 6 블루프린트 JSON 결정론 직렬화. */
export function serializeEpisodeBlueprintJson(plan: CompiledWebtoonEpisodePlan): string {
  return JSON.stringify(plan.studioBlueprint, null, 2);
}

/** Stage 6 블루프린트 JSON 스키마·좌표·무결성 검증기. */
export function validateToonStudioBlueprintJson(rawJson: string): BlueprintValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { valid: false, errors: ["Invalid JSON syntax"], document: null };
  }
  if (!parsed || typeof parsed !== "object") {
    return { valid: false, errors: ["Blueprint root must be an object"], document: null };
  }

  const candidate = parsed as Partial<ToonStudioBlueprintJsonDocument>;
  const errors: string[] = [];

  if (candidate.schemaVersion !== "toonstudio.episode-blueprint.v2") {
    errors.push("Unexpected schemaVersion");
  }
  if (candidate.generator !== "toonstudio-idea-to-webtoon-6stage") {
    errors.push("Unexpected generator signature");
  }
  if (!candidate.canvas || candidate.canvas.widthPx !== WEBTOON_STRIP_WIDTH_PX || candidate.canvas.totalHeightPx <= 0) {
    errors.push("Invalid canvas dimensions");
  }
  if (!Array.isArray(candidate.panels) || candidate.panels.length === 0) {
    errors.push("Panels array must be non-empty");
  } else {
    let prevBottom = 0;
    for (const panel of candidate.panels) {
      if (panel.yOffsetPx < prevBottom || panel.heightPx <= 0) {
        errors.push(`Panel ${panel.panelIndex} has overlapping or invalid vertical bounds`);
        break;
      }
      prevBottom = panel.yOffsetPx + panel.heightPx;
    }
    if (candidate.episodeMeta && candidate.episodeMeta.panelCount !== candidate.panels.length) {
      errors.push("episodeMeta.panelCount does not match panels.length");
    }
  }
  if (!Array.isArray(candidate.characterBible) || candidate.characterBible.length === 0) {
    errors.push("characterBible must include at least one locked character");
  }
  if (!Array.isArray(candidate.layers) || candidate.layers.length < 6) {
    errors.push("Standard ToonStudio layer stack is incomplete");
  }
  if (!Array.isArray(candidate.audioTrackCues) || candidate.audioTrackCues.length === 0) {
    errors.push("audioTrackCues must include at least one OST cue");
  }

  return errors.length === 0
    ? { valid: true, errors: [], document: candidate as ToonStudioBlueprintJsonDocument }
    : { valid: false, errors, document: null };
}

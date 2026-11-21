/**
 * Plotr 1문장 아이디어 → 4컷 비주얼 웹툰 결정론 생성기 및
 * 컷별 구도(클로즈업·바스트·풀샷·하이앵글)·조명 무드(맑음·노을·비·네온밤) 추론·전환 엔진.
 */
import type {
  CodexEntityEntry,
  ScriptSceneCard,
} from "../../writer-room/studio-scrivenings-snapshot-codex";
import { PLOTR_CHARACTER_PALETTE_PRESETS } from "./plotr-character-sheet-model";
import { createEmptyPlotrDocument } from "./plotr-device-store";
import type {
  PlotrCameraFramingId,
  PlotrConsistencyAsset,
  PlotrCutCard,
  PlotrDocumentState,
  PlotrLightingMoodId,
  PlotrOutputFormat,
} from "./plotr-types";

export interface PlotrCameraFramingMeta {
  readonly id: PlotrCameraFramingId;
  readonly labelKo: string;
  readonly cameraShotKo: string;
  readonly lensTag: string;
  readonly hintKo: string;
}

export const PLOTR_CAMERA_FRAMING_ORDER: readonly PlotrCameraFramingId[] =
  Object.freeze(["closeup", "bust", "full", "high-angle"]);

export const PLOTR_CAMERA_FRAMING_PRESETS: Readonly<
  Record<PlotrCameraFramingId, PlotrCameraFramingMeta>
> = Object.freeze({
  closeup: Object.freeze({
    id: "closeup",
    labelKo: "클로즈업",
    cameraShotKo: "익스트림 클로즈업 85mm",
    lensTag: "85mm ECU",
    hintKo: "눈빛과 감정 폭발을 꽉 채워 강조",
  }),
  bust: Object.freeze({
    id: "bust",
    labelKo: "바스트",
    cameraShotKo: "바스트샷 50mm",
    lensTag: "50mm BUST",
    hintKo: "어깨선 위 대화와 표정 호흡 전달",
  }),
  full: Object.freeze({
    id: "full",
    labelKo: "풀샷",
    cameraShotKo: "와이드 풀샷 24mm",
    lensTag: "24mm FULL",
    hintKo: "인물 전신과 공간 분위기를 함께 설정",
  }),
  "high-angle": Object.freeze({
    id: "high-angle",
    labelKo: "하이앵글",
    cameraShotKo: "하이앵글 35mm",
    lensTag: "35mm HIGH",
    hintKo: "위에서 내려다보며 고립감·여운 극대화",
  }),
});

export interface PlotrLightingMoodMeta {
  readonly id: PlotrLightingMoodId;
  readonly labelKo: string;
  readonly skyTopOklch: string;
  readonly skyBottomOklch: string;
  readonly groundOklch: string;
  readonly accentOklch: string;
  readonly rimLightOklch: string;
  readonly inkOklch: string;
  readonly bubbleFillOklch: string;
  readonly bubbleInkOklch: string;
  readonly atmosphereKo: string;
}

export const PLOTR_LIGHTING_MOOD_ORDER: readonly PlotrLightingMoodId[] =
  Object.freeze(["sunny", "sunset", "rain", "neon-night"]);

export const PLOTR_LIGHTING_MOOD_PRESETS: Readonly<
  Record<PlotrLightingMoodId, PlotrLightingMoodMeta>
> = Object.freeze({
  sunny: Object.freeze({
    id: "sunny",
    labelKo: "맑음",
    skyTopOklch: "oklch(0.84 0.09 225)",
    skyBottomOklch: "oklch(0.94 0.05 95)",
    groundOklch: "oklch(0.76 0.06 145)",
    accentOklch: "oklch(0.78 0.16 82)",
    rimLightOklch: "oklch(0.97 0.04 92)",
    inkOklch: "oklch(0.24 0.03 255)",
    bubbleFillOklch: "oklch(0.98 0.01 95)",
    bubbleInkOklch: "oklch(0.2 0.02 255)",
    atmosphereKo: "투명한 주광과 선명한 햇살 역광",
  }),
  sunset: Object.freeze({
    id: "sunset",
    labelKo: "노을",
    skyTopOklch: "oklch(0.56 0.16 325)",
    skyBottomOklch: "oklch(0.79 0.17 55)",
    groundOklch: "oklch(0.38 0.08 305)",
    accentOklch: "oklch(0.82 0.18 62)",
    rimLightOklch: "oklch(0.91 0.13 70)",
    inkOklch: "oklch(0.95 0.02 80)",
    bubbleFillOklch: "oklch(0.97 0.02 75)",
    bubbleInkOklch: "oklch(0.22 0.04 20)",
    atmosphereKo: "붉은 황혼빛과 긴 실루엣 그림자",
  }),
  rain: Object.freeze({
    id: "rain",
    labelKo: "비",
    skyTopOklch: "oklch(0.39 0.06 242)",
    skyBottomOklch: "oklch(0.6 0.07 222)",
    groundOklch: "oklch(0.3 0.05 245)",
    accentOklch: "oklch(0.76 0.11 215)",
    rimLightOklch: "oklch(0.86 0.06 218)",
    inkOklch: "oklch(0.94 0.02 225)",
    bubbleFillOklch: "oklch(0.96 0.01 230)",
    bubbleInkOklch: "oklch(0.21 0.03 245)",
    atmosphereKo: "빗줄기 사선과 젖은 바닥 반사광",
  }),
  "neon-night": Object.freeze({
    id: "neon-night",
    labelKo: "네온밤",
    skyTopOklch: "oklch(0.2 0.06 272)",
    skyBottomOklch: "oklch(0.31 0.12 318)",
    groundOklch: "oklch(0.17 0.05 268)",
    accentOklch: "oklch(0.74 0.21 340)",
    rimLightOklch: "oklch(0.78 0.17 195)",
    inkOklch: "oklch(0.95 0.02 250)",
    bubbleFillOklch: "oklch(0.96 0.01 260)",
    bubbleInkOklch: "oklch(0.18 0.04 275)",
    atmosphereKo: "심야 네온 대비와 강렬한 사이안 림라이트",
  }),
});

export interface PlotrIdeaQuickPreset {
  readonly id: string;
  readonly labelKo: string;
  readonly idea: string;
  readonly genreKo: string;
  readonly moodId: PlotrLightingMoodId;
}

export const PLOTR_IDEA_QUICK_PRESETS: readonly PlotrIdeaQuickPreset[] =
  Object.freeze([
    Object.freeze({
      id: "rain-rooftop",
      labelKo: "비 오는 옥상 재회",
      idea: "비 오는 옥상에서 옛 연인과 다시 마주쳤다",
      genreKo: "감성 드라마",
      moodId: "rain",
    }),
    Object.freeze({
      id: "midnight-subway",
      labelKo: "자정 막차 도플갱어",
      idea: "자정 지하철 마지막 칸에 어제의 내가 앉아 있었다",
      genreKo: "미스터리 스릴러",
      moodId: "neon-night",
    }),
    Object.freeze({
      id: "sunset-watch",
      labelKo: "노을 연회장 역행 시계",
      idea: "노을 진 연회장에서 은빛 회중시계가 거꾸로 돌기 시작했다",
      genreKo: "로판 회귀",
      moodId: "sunset",
    }),
    Object.freeze({
      id: "sunny-gate",
      labelKo: "폐역 0번 게이트 각성",
      idea: "맑은 아침 지하철 폐역 앞에서 F급 짐꾼 눈앞에 0번 문이 열렸다",
      genreKo: "회귀 액션",
      moodId: "sunny",
    }),
  ]);

export function inferCutCameraFraming(cut: PlotrCutCard): PlotrCameraFramingId {
  if (cut.framingPreset) return cut.framingPreset;
  const shot = cut.cameraShot;
  if (/하이앵글|부감|탑뷰|위에서/u.test(shot)) return "high-angle";
  if (/클로즈업|85mm|ECU|눈동자/u.test(shot)) return "closeup";
  if (/풀샷|와이드|전경|24mm|정방형/u.test(shot)) return "full";
  return "bust";
}

export function inferCutLightingMood(
  cut: PlotrCutCard,
  worldSettingNote = "",
  docMood = "",
): PlotrLightingMoodId {
  if (cut.lightingMood) return cut.lightingMood;
  const combined = `${cut.actionSummary} ${cut.locationName} ${cut.compositionBrief} ${worldSettingNote} ${docMood}`;
  if (/비\s*오는|소나기|빗물|빗방울|우산|장마|비에\s*젖/u.test(combined)) {
    return "rain";
  }
  if (/노을|석양|황혼|촛불|샹들리에|금빛|저녁/u.test(combined)) {
    return "sunset";
  }
  if (/네온|자정|심야|터널|0시|밤|야간|어둠|경고등|균열|폐역|어두운/u.test(combined)) {
    return "neon-night";
  }
  return "sunny";
}

export function applyCutFramingPreset(
  cuts: readonly PlotrCutCard[],
  cutId: string,
  framing: PlotrCameraFramingId,
): readonly PlotrCutCard[] {
  const preset = PLOTR_CAMERA_FRAMING_PRESETS[framing];
  return Object.freeze(
    cuts.map((cut) => {
      if (cut.id !== cutId) return cut;
      const mangaPrefix = /^(\d+쪽\s*\d+칸\s*·\s*)/u.exec(cut.cameraShot)?.[1] ?? "";
      return Object.freeze({
        ...cut,
        framingPreset: framing,
        cameraShot: `${mangaPrefix}${preset.cameraShotKo}`,
      });
    }),
  );
}

export function applyCutLightingMood(
  cuts: readonly PlotrCutCard[],
  cutId: string,
  mood: PlotrLightingMoodId,
): readonly PlotrCutCard[] {
  return Object.freeze(
    cuts.map((cut) =>
      cut.id === cutId ? Object.freeze({ ...cut, lightingMood: mood }) : cut,
    ),
  );
}

interface ExtractedIdeaBlueprint {
  readonly title: string;
  readonly genreKo: string;
  readonly moodKo: string;
  readonly lightingMood: PlotrLightingMoodId;
  readonly locationName: string;
  readonly locationVisualNote: string;
  readonly propName: string;
  readonly propVisualNote: string;
  readonly protagonistName: string;
  readonly counterpartName: string;
  readonly protagonistOpeningLine: string;
  readonly counterpartRevealLine: string;
  readonly protagonistClashLine: string;
  readonly endingHookLine: string;
  readonly sfxCut3: string;
  readonly sfxCut4: string;
}

function analyzeIdeaToBlueprint(rawIdea: string): ExtractedIdeaBlueprint {
  const idea = rawIdea.trim();
  const lightingMood: PlotrLightingMoodId =
    /비|우산|소나기|장마|빗물/u.test(idea)
      ? "rain"
      : /노을|석양|황혼|연회장|촛불/u.test(idea)
        ? "sunset"
        : /맑은|아침|햇살|한낮|정오/u.test(idea)
          ? "sunny"
          : /자정|밤|네온|심야|막차|터널|어둠|살인|비밀/u.test(idea)
            ? "neon-night"
            : "sunny";

  const locMatch =
    /((?:비\s*오는\s*|노을\s*진\s*|자정\s*|맑은\s*|폐쇄된\s*)?(?:옥상|지하철(?:\s*마지막\s*칸|\s*폐역)?|연회장|교실|도서관|카페|골목|바다|병원|숲|성채|승강장|미술실|현관|던전|편의점|다리))/u.exec(
      idea,
    );
  const locationName = locMatch?.[1]?.trim() ?? "안개 낀 도심 옥상";

  const propMatch =
    /((?:은빛\s*|검은\s*|낡은\s*|투명\s*|붉은\s*)?(?:회중시계|시계|우산|편지|반지|단검|열쇠|녹음기|카메라|스케치북|꽃다발|문|표지판))/u.exec(
      idea,
    );
  const propName =
    propMatch?.[1]?.trim() ??
    (lightingMood === "rain"
      ? "투명 비닐우산"
      : lightingMood === "neon-night"
        ? "점멸하는 손전등"
        : lightingMood === "sunset"
          ? "은빛 회중시계"
          : "낡은 가죽 수첩");

  const isRomanceReunion = /연인|사랑|고백|이별|짝사랑|선배|마주쳤|재회/u.test(idea);
  const isThriller = /어제의\s*나|도플갱어|막차|자정|사라진|녹음|범인|추격|비밀/u.test(idea);
  const isRofan = /파혼|공작|영애|회중시계|연회장|황태자|회귀/u.test(idea);
  const isAction = /던전|짐꾼|게이트|헌터|각성|F급|0번\s*문|단검|보스/u.test(idea);

  if (isRomanceReunion) {
    return {
      title: `${locationName}의 재회`,
      genreKo: "감성 드라마",
      moodKo: "애틋하고 긴장감 있게",
      lightingMood,
      locationName,
      locationVisualNote: `${PLOTR_LIGHTING_MOOD_PRESETS[lightingMood].atmosphereKo}, ${locationName} 난간과 흔들리는 시야`,
      propName,
      propVisualNote: `젖은 손끝에 쥔 ${propName}, 두 사람의 기억이 담긴 핵심 오브제`,
      protagonistName: "서윤",
      counterpartName: "도현",
      protagonistOpeningLine: `${idea}. 잊었다고 믿었던 시간이 한순간에 멈췄다.`,
      counterpartRevealLine: "오랜만이네. 이 날씨에 여기 올라오는 버릇, 아직 그대로구나.",
      protagonistClashLine: "우연이라고 하기엔 너무 정확하잖아. 왜 하필 오늘 나타난 거야?",
      endingHookLine: "그날 네가 남겨 두고 간 대답, 오늘 끝내려고 돌아왔어.",
      sfxCut3: "두근…",
      sfxCut4: "스윽",
    };
  }

  if (isThriller) {
    return {
      title: `${locationName}의 미지의 시선`,
      genreKo: "미스터리 스릴러",
      moodKo: "서늘하고 압박감 있게",
      lightingMood,
      locationName,
      locationVisualNote: `${PLOTR_LIGHTING_MOOD_PRESETS[lightingMood].atmosphereKo}, 차갑게 깜빡이는 ${locationName}`,
      propName,
      propVisualNote: `붉은 경고빛이 반사되는 ${propName}`,
      protagonistName: "지훈",
      counterpartName: "어제의 지훈",
      protagonistOpeningLine: `${idea}. 분명 혼자였는데 공기가 서늘하게 식어 갔다.`,
      counterpartRevealLine: "놀라지 마. 다음 정거장에 도착하기 전에 내 말을 들어야 해.",
      protagonistClashLine: "말도 안 돼… 너는 어젯밤 집으로 돌아간 내 모습이잖아!",
      endingHookLine: "지금 문이 열리면 절대 내리지 마. 진짜 함정은 플랫폼 바깥이야.",
      sfxCut3: "번쩍!",
      sfxCut4: "드드득",
    };
  }

  if (isRofan) {
    return {
      title: `${locationName}의 역행 계약`,
      genreKo: "로판 회귀",
      moodKo: "우아하고 치명적으로",
      lightingMood,
      locationName,
      locationVisualNote: `${PLOTR_LIGHTING_MOOD_PRESETS[lightingMood].atmosphereKo}, 샹들리에와 유리창이 빛나는 ${locationName}`,
      propName,
      propVisualNote: `푸른 태엽 빛이 번지는 ${propName}`,
      protagonistName: "세레나",
      counterpartName: "카시안",
      protagonistOpeningLine: `${idea}. 두 번째 생에서는 누구에게도 끌려가지 않겠다.`,
      counterpartRevealLine: "그 물건이 지금 움직였다면… 오늘 밤 판도가 완전히 뒤집히겠군.",
      protagonistClashLine: "먼저 손을 내밀겠어요. 1년만 제 편에 서 주시죠, 공작님.",
      endingHookLine: "흥미로운 거래로군. 대신 그 시계의 비밀은 내게만 밝혀야 할 거요.",
      sfxCut3: "번쩍!",
      sfxCut4: "챙—!",
    };
  }

  if (isAction) {
    return {
      title: `${locationName}의 0번 각성`,
      genreKo: "회귀 액션",
      moodKo: "속도감 있고 통쾌하게",
      lightingMood,
      locationName,
      locationVisualNote: `${PLOTR_LIGHTING_MOOD_PRESETS[lightingMood].atmosphereKo}, 균열 빛이 새어 나오는 ${locationName}`,
      propName,
      propVisualNote: `푸른 마력 룬이 켜진 ${propName}`,
      protagonistName: "강도윤",
      counterpartName: "길드 감시관",
      protagonistOpeningLine: `${idea}. 10년 동안 기다려 온 첫 번째 역전 기회다.`,
      counterpartRevealLine: "거기 F급 짐꾼, 통제 구역이다! 당장 뒤로 물러서!",
      protagonistClashLine: "규정보다 내가 30분 빨라. 이 히든 던전, 이번엔 내가 먼저 깬다.",
      endingHookLine: "숨겨진 0번 게이트가 각성자를 인식했습니다. 단독 공략을 시작합니다.",
      sfxCut3: "쾅!",
      sfxCut4: "콰앙!",
    };
  }

  const conciseTitle = idea.length > 18 ? `${idea.slice(0, 18).trim()}…` : idea || "한 줄 아이디어 웹툰";
  return {
    title: conciseTitle,
    genreKo: "오리지널 드라마",
    moodKo: "몰입감 있고 생동감 있게",
    lightingMood,
    locationName,
    locationVisualNote: `${PLOTR_LIGHTING_MOOD_PRESETS[lightingMood].atmosphereKo}, ${locationName} 전경`,
    propName,
    propVisualNote: `장면의 핵심 단서가 되는 ${propName}`,
    protagonistName: "하준",
    counterpartName: "수아",
    protagonistOpeningLine: `${idea}. 평범하던 하루가 그 순간 완전히 달라졌다.`,
    counterpartRevealLine: "지금 표정 보니까, 너도 같은 걸 눈치챈 모양이네.",
    protagonistClashLine: "숨기는 게 뭔지 정확히 말해 줘. 여기서 물러설 생각 없어.",
    endingHookLine: "좋아, 그럼 지금부터 진짜 이야기를 보여 줄게.",
    sfxCut3: "번쩍!",
    sfxCut4: "두근…",
  };
}

/**
 * 1문장 아이디어 → 외부 API 없이 결정론적으로 4컷 드라마틱 비주얼 웹툰 전체 문서 조립.
 */
export function generateFourCutWebtoonFromIdea(input: {
  readonly idea: string;
  readonly projectId: string;
  readonly format?: PlotrOutputFormat;
  readonly baseDocument?: PlotrDocumentState;
}): PlotrDocumentState {
  const cleanIdea = input.idea.trim();
  const base = input.baseDocument ?? createEmptyPlotrDocument(input.projectId);
  if (!cleanIdea) return base;

  const format = input.format ?? base.format ?? "webtoon";
  const bp = analyzeIdeaToBlueprint(cleanIdea);
  const p1Palette = PLOTR_CHARACTER_PALETTE_PRESETS[0]!;
  const p2Palette = PLOTR_CHARACTER_PALETTE_PRESETS[1]!;

  const protagonistAsset: PlotrConsistencyAsset = Object.freeze({
    id: "asset-idea-char-1",
    category: "character",
    name: bp.protagonistName,
    visualNote: `${p1Palette.presetLabelKo} · 긴장감 어린 눈빛, ${bp.propName} 소지`,
    swatchOklch: p1Palette.outfitOklch,
    costumeOrMaterial: p1Palette.presetLabelKo,
    characterBible: Object.freeze({
      palette: p1Palette,
      expressionLock: "tense",
      signatureProp: bp.propName,
      silhouetteRule: `${bp.protagonistName} 고정 헤어 라인 + 시그니처 상의 실루엣`,
    }),
  });

  const counterpartAsset: PlotrConsistencyAsset = Object.freeze({
    id: "asset-idea-char-2",
    category: "character",
    name: bp.counterpartName,
    visualNote: `${p2Palette.presetLabelKo} · 차분하지만 속내를 알 수 없는 인상`,
    swatchOklch: p2Palette.outfitOklch,
    costumeOrMaterial: p2Palette.presetLabelKo,
    characterBible: Object.freeze({
      palette: p2Palette,
      expressionLock: "calm",
      signatureProp: bp.propName,
      silhouetteRule: `${bp.counterpartName} 긴 코트·단정한 어깨선 실루엣`,
    }),
  });

  const locationAsset: PlotrConsistencyAsset = Object.freeze({
    id: "asset-idea-loc-1",
    category: "location",
    name: bp.locationName,
    visualNote: bp.locationVisualNote,
    swatchOklch: PLOTR_LIGHTING_MOOD_PRESETS[bp.lightingMood].accentOklch,
    costumeOrMaterial: PLOTR_LIGHTING_MOOD_PRESETS[bp.lightingMood].atmosphereKo,
  });

  const propAsset: PlotrConsistencyAsset = Object.freeze({
    id: "asset-idea-prop-1",
    category: "prop",
    name: bp.propName,
    visualNote: bp.propVisualNote,
    swatchOklch: PLOTR_LIGHTING_MOOD_PRESETS[bp.lightingMood].rimLightOklch,
    costumeOrMaterial: bp.propName,
  });

  const assets: readonly PlotrConsistencyAsset[] = Object.freeze([
    protagonistAsset,
    counterpartAsset,
    locationAsset,
    propAsset,
  ]);

  const cuts: readonly PlotrCutCard[] = Object.freeze([
    Object.freeze({
      id: "plotr-idea-cut-1",
      orderIndex: 0,
      sceneTitle: "1컷",
      actionSummary: `${bp.locationName}. ${bp.protagonistName}이 ${bp.propName}을 손에 쥔 채 멈춰 서서 낯익은 기척을 감지한다.`,
      dialogues: Object.freeze([
        Object.freeze({
          id: "dlg-idea-1",
          speaker: "",
          text: bp.protagonistOpeningLine,
          kind: "narration" as const,
        }),
      ]),
      cameraShot: PLOTR_CAMERA_FRAMING_PRESETS.full.cameraShotKo,
      framingPreset: "full" as const,
      lightingMood: bp.lightingMood,
      cameraSide: "center" as const,
      locationName: bp.locationName,
      emotionBeat: "도입 · 공간 설정",
      tensionScore: 54,
      effectLine: "none" as const,
      sfxText: "",
      referencedAssetIds: Object.freeze([
        protagonistAsset.id,
        locationAsset.id,
        propAsset.id,
      ]),
      bubblesApplied: true,
      panelBorderEnabled: base.panelBorderEnabled,
      panelBorderWidthPx: base.panelBorderWidthPx,
      renderReady: true,
      compositionBrief: `[${base.artStyle.labelKo}] 와이드 풀샷 · ${bp.locationName} 분위기 도입`,
      ...(format === "video-storyboard" ? { durationSec: 4 } : {}),
    }),
    Object.freeze({
      id: "plotr-idea-cut-2",
      orderIndex: 1,
      sceneTitle: "2컷",
      actionSummary: `시야 너머에서 ${bp.counterpartName}이 천천히 걸어 나와 ${bp.protagonistName}과 정면으로 시선을 맞춘다.`,
      dialogues: Object.freeze([
        Object.freeze({
          id: "dlg-idea-2",
          speaker: bp.counterpartName,
          text: bp.counterpartRevealLine,
          kind: "speech" as const,
        }),
      ]),
      cameraShot: PLOTR_CAMERA_FRAMING_PRESETS.bust.cameraShotKo,
      framingPreset: "bust" as const,
      lightingMood: bp.lightingMood,
      cameraSide: "right" as const,
      locationName: bp.locationName,
      emotionBeat: "대치 · 긴장 고조",
      tensionScore: 72,
      effectLine: "none" as const,
      sfxText: "",
      referencedAssetIds: Object.freeze([
        counterpartAsset.id,
        protagonistAsset.id,
        locationAsset.id,
      ]),
      bubblesApplied: true,
      panelBorderEnabled: base.panelBorderEnabled,
      panelBorderWidthPx: base.panelBorderWidthPx,
      renderReady: true,
      compositionBrief: `[${base.artStyle.labelKo}] 바스트샷 · ${bp.counterpartName} 등장과 첫 대사`,
      ...(format === "video-storyboard" ? { durationSec: 4 } : {}),
    }),
    Object.freeze({
      id: "plotr-idea-cut-3",
      orderIndex: 2,
      sceneTitle: "3컷",
      actionSummary: `${bp.protagonistName}의 흔들리는 눈동자와 꽉 쥔 ${bp.propName}을 익스트림 클로즈업으로 포착한다.`,
      dialogues: Object.freeze([
        Object.freeze({
          id: "dlg-idea-3",
          speaker: bp.protagonistName,
          text: bp.protagonistClashLine,
          kind: "speech" as const,
        }),
      ]),
      cameraShot: PLOTR_CAMERA_FRAMING_PRESETS.closeup.cameraShotKo,
      framingPreset: "closeup" as const,
      lightingMood: bp.lightingMood,
      cameraSide: "left" as const,
      locationName: bp.locationName,
      emotionBeat: "감정 폭발 · 핵심 갈등",
      tensionScore: 88,
      effectLine: "focus" as const,
      sfxText: bp.sfxCut3,
      referencedAssetIds: Object.freeze([
        protagonistAsset.id,
        propAsset.id,
      ]),
      bubblesApplied: true,
      panelBorderEnabled: base.panelBorderEnabled,
      panelBorderWidthPx: base.panelBorderWidthPx,
      renderReady: true,
      compositionBrief: `[${base.artStyle.labelKo}] 익스트림 클로즈업 · 감정 정점`,
      ...(format === "video-storyboard" ? { durationSec: 3 } : {}),
    }),
    Object.freeze({
      id: "plotr-idea-cut-4",
      orderIndex: 3,
      sceneTitle: "4컷",
      actionSummary: `하이앵글로 내려다본 ${bp.locationName}. ${bp.counterpartName}이 한 걸음 다가서며 두 사람 사이의 거리가 단숨에 좁혀진다.`,
      dialogues: Object.freeze([
        Object.freeze({
          id: "dlg-idea-4",
          speaker: bp.counterpartName,
          text: bp.endingHookLine,
          kind: "speech" as const,
        }),
      ]),
      cameraShot: PLOTR_CAMERA_FRAMING_PRESETS["high-angle"].cameraShotKo,
      framingPreset: "high-angle" as const,
      lightingMood: bp.lightingMood,
      cameraSide: "right" as const,
      locationName: bp.locationName,
      emotionBeat: "여운 · 클리프행어",
      tensionScore: 95,
      effectLine: "flash" as const,
      sfxText: bp.sfxCut4,
      referencedAssetIds: Object.freeze([
        protagonistAsset.id,
        counterpartAsset.id,
        locationAsset.id,
        propAsset.id,
      ]),
      bubblesApplied: true,
      panelBorderEnabled: base.panelBorderEnabled,
      panelBorderWidthPx: base.panelBorderWidthPx,
      renderReady: true,
      compositionBrief: `[${base.artStyle.labelKo}] 하이앵글 · 다음 화 클리프행어 엔딩`,
      ...(format === "video-storyboard" ? { durationSec: 5 } : {}),
      foreshadowTag: "다음 화 클리프행어",
    }),
  ]);

  const rawScript = cuts
    .map((cut) => {
      const dlgLines = cut.dialogues.map((d) =>
        d.kind === "narration"
          ? `${bp.protagonistName}: (나레이션) ${d.text}`
          : `${d.speaker}: "${d.text}"`,
      );
      return [`[컷 ${cut.orderIndex + 1}] ${cut.actionSummary}`, ...dlgLines].join("\n");
    })
    .join("\n");

  const scenes: readonly ScriptSceneCard[] = Object.freeze([
    Object.freeze({
      id: "scene-idea-1",
      episodeId: "ep-1",
      title: `${bp.locationName} 첫 조우`,
      body: `${cuts[0]!.actionSummary}\n${cuts[1]!.actionSummary}`,
      cutNotes: "1컷 풀샷 도입 → 2컷 바스트 시선 교차",
      orderIndex: 0,
    }),
    Object.freeze({
      id: "scene-idea-2",
      episodeId: "ep-1",
      title: "감정 충돌과 엔딩 훅",
      body: `${cuts[2]!.actionSummary}\n${cuts[3]!.actionSummary}`,
      cutNotes: "3컷 익스트림 클로즈업 → 4컷 하이앵글 여운",
      orderIndex: 1,
    }),
  ]);

  const codexEntries: readonly CodexEntityEntry[] = Object.freeze([
    Object.freeze({
      id: "codex-idea-p1",
      kind: "character" as const,
      canonical: bp.protagonistName,
      aliases: [],
      status: "confirmed" as const,
      summary: `${bp.title} 주인공 · ${bp.propName} 소지`,
    }),
    Object.freeze({
      id: "codex-idea-p2",
      kind: "character" as const,
      canonical: bp.counterpartName,
      aliases: [],
      status: "confirmed" as const,
      summary: `${bp.title} 핵심 상대역`,
    }),
    Object.freeze({
      id: "codex-idea-loc",
      kind: "location" as const,
      canonical: bp.locationName,
      aliases: [],
      status: "confirmed" as const,
      summary: bp.locationVisualNote,
    }),
  ]);

  return Object.freeze({
    ...base,
    schemaVersion: 1,
    projectId: input.projectId.trim() || base.projectId,
    title: bp.title,
    templateId: null,
    format,
    inputMode: "script",
    helper: Object.freeze({
      ...base.helper,
      genre: bp.genreKo,
      mood: bp.moodKo,
      length: "short",
      logline: cleanIdea,
      worldSettingNote: `${bp.locationName} · ${PLOTR_LIGHTING_MOOD_PRESETS[bp.lightingMood].atmosphereKo}`,
    }),
    rawScript,
    assets,
    cuts,
    scenes,
    codexEntries,
    updatedAtIso: new Date().toISOString(),
  });
}

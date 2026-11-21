/**
 * Wave 17A — 무과금(₩0) 로컬 결정론적 오디오 큐시트 · 숏폼 트레일러 · 다국어 문화 현지화 · 로컬 LoRA & 클린룸 엔진
 * 4. 오디오 웹툰/보이스 드라마 대본·성우 큐시트 변환기 + 9:16 숏폼 모션 트레일러 디렉터
 * 5. 다국어 문화 적응형 현지화 어시스트 (ko -> en / ja / vi / th / id, 관용구·세로쓰기·말풍선 자동 교정)
 * 6. 작가 화풍 전용 로컬 LoRA 데이터셋 패키저(ComfyUI/Kohya, ₩0) + 저작권 클린룸 유사도·출처 사전 검증기
 */

/* ---------------- 4A. 오디오 웹툰/보이스 드라마 대본·성우 큐시트 ---------------- */

export type VoiceEmotionTag = "긴장" | "분노" | "슬픔" | "환희" | "속삭임" | "담담";

export interface ManuscriptScriptLine {
  readonly id: string;
  readonly cutNumber: number;
  readonly speaker: string;
  readonly textKo: string;
  readonly emotionHint?: VoiceEmotionTag;
  readonly bgmCue?: string;
  readonly sfxHint?: string;
  readonly pauseAfterSec?: number;
}

export interface AudioCueRow {
  readonly cueNumber: number;
  readonly cutNumber: number;
  readonly speaker: string;
  readonly emotionTag: VoiceEmotionTag;
  readonly textKo: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly durationSec: number;
  readonly timecodeRange: string;
  readonly bgmTrack: string;
  readonly bgmDuckingDb: number;
  readonly sfxCue: string | null;
  readonly actorDirectionKo: string;
}

export interface SpeakerCueSummary {
  readonly speaker: string;
  readonly lineCount: number;
  readonly totalSec: number;
  readonly dominantEmotion: VoiceEmotionTag;
}

export interface AudioCueSheetResult {
  readonly episodeTitle: string;
  readonly totalDurationSec: number;
  readonly totalTimecode: string;
  readonly rows: readonly AudioCueRow[];
  readonly speakerStats: readonly SpeakerCueSummary[];
  readonly bgmTransitions: readonly { readonly atSec: number; readonly track: string }[];
  readonly exportScriptText: string;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatTimecodeSec(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const rem = safe - mins * 60;
  const whole = Math.floor(rem);
  const tenths = Math.floor((rem - whole) * 10 + 0.0001);
  return `${String(mins).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${tenths}`;
}

function detectEmotionTag(line: ManuscriptScriptLine): VoiceEmotionTag {
  if (line.emotionHint) return line.emotionHint;
  const text = line.textKo;
  if (/그만|당장|용서|배신|거짓말|멈춰/u.test(text) || text.includes("!!")) return "분노";
  if (/조용|속삭|쉿|들킬|비밀/u.test(text)) return "속삭임";
  if (/미안|눈물|떠나|잃었|혼자/u.test(text) || text.includes("...")) return "슬픔";
  if (/해냈|드디어|다행|웃|축하/u.test(text)) return "환희";
  if (text.includes("!") || text.includes("?") || /누구|경보|위험|발소리/u.test(text)) return "긴장";
  return "담담";
}

const EMOTION_SPEECH_RATE: Readonly<Record<VoiceEmotionTag, number>> = {
  긴장: 6.2,
  분노: 6.6,
  슬픔: 4.4,
  환희: 6.0,
  속삭임: 4.1,
  담담: 5.4,
};

const EMOTION_DIRECTION_KO: Readonly<Record<VoiceEmotionTag, string>> = {
  긴장: "호흡 짧게 끊고 어미를 낮춰 압박감 유지",
  분노: "흉성 강조, 첫 음절 어택 강하게 처리",
  슬픔: "끝음절 힘 빼고 0.3초 숨소리 여운 남김",
  환희: "밝은 톤으로 억양 상승, 리듬 경쾌하게",
  속삭임: "마이크 근접(근접효과), 치찰음 억제",
  담담: "내레이션 톤 유지, 일정한 호흡 간격",
};

export function generateAudioCueSheet(
  episodeTitle: string,
  lines: readonly ManuscriptScriptLine[],
): AudioCueSheetResult {
  let cursorSec = 0;
  let activeBgm = "메인 테마 · 정적 앰비언스";
  const rows: AudioCueRow[] = [];
  const bgmTransitions: { readonly atSec: number; readonly track: string }[] = [];
  const speakerBuckets = new Map<string, { count: number; totalSec: number; emotions: Map<VoiceEmotionTag, number> }>();

  lines.forEach((line, idx) => {
    if (line.bgmCue && line.bgmCue !== activeBgm) {
      activeBgm = line.bgmCue;
      bgmTransitions.push({ atSec: roundOne(cursorSec), track: activeBgm });
    }
    const emotionTag = detectEmotionTag(line);
    const charCount = Math.max(2, line.textKo.replace(/\s+/gu, "").length);
    const rate = EMOTION_SPEECH_RATE[emotionTag];
    const spokenSec = Math.max(1.2, roundOne(charCount / rate));
    const pauseSec = Math.max(0.2, roundOne(line.pauseAfterSec ?? (emotionTag === "슬픔" ? 0.7 : 0.4)));
    const startSec = roundOne(cursorSec);
    const endSec = roundOne(startSec + spokenSec);
    const bgmDuckingDb = line.speaker === "내레이션" ? -6 : -12;

    rows.push({
      cueNumber: idx + 1,
      cutNumber: line.cutNumber,
      speaker: line.speaker,
      emotionTag,
      textKo: line.textKo,
      startSec,
      endSec,
      durationSec: spokenSec,
      timecodeRange: `${formatTimecodeSec(startSec)} ~ ${formatTimecodeSec(endSec)}`,
      bgmTrack: activeBgm,
      bgmDuckingDb,
      sfxCue: line.sfxHint ?? null,
      actorDirectionKo: EMOTION_DIRECTION_KO[emotionTag],
    });

    const bucket = speakerBuckets.get(line.speaker) ?? { count: 0, totalSec: 0, emotions: new Map<VoiceEmotionTag, number>() };
    bucket.count += 1;
    bucket.totalSec = roundOne(bucket.totalSec + spokenSec);
    bucket.emotions.set(emotionTag, (bucket.emotions.get(emotionTag) ?? 0) + 1);
    speakerBuckets.set(line.speaker, bucket);

    cursorSec = roundOne(endSec + pauseSec);
  });

  const speakerStats: SpeakerCueSummary[] = [...speakerBuckets.entries()]
    .map(([speaker, stats]) => {
      let dominantEmotion: VoiceEmotionTag = "담담";
      let bestCount = -1;
      for (const [emo, count] of stats.emotions.entries()) {
        if (count > bestCount) {
          dominantEmotion = emo;
          bestCount = count;
        }
      }
      return { speaker, lineCount: stats.count, totalSec: stats.totalSec, dominantEmotion };
    })
    .sort((a, b) => b.totalSec - a.totalSec || a.speaker.localeCompare(b.speaker, "ko"));

  const exportScriptText = [
    `[오디오 큐시트] ${episodeTitle} (총 ${formatTimecodeSec(cursorSec)})`,
    ...rows.map(
      (row) =>
        `#${String(row.cueNumber).padStart(2, "0")} [${row.timecodeRange}] CUT ${row.cutNumber} | ${row.speaker} (${row.emotionTag}) | BGM:${row.bgmTrack} (${row.bgmDuckingDb}dB)${row.sfxCue ? ` | SFX:${row.sfxCue}` : ""} :: ${row.textKo}`,
    ),
  ].join("\n");

  return {
    episodeTitle,
    totalDurationSec: roundOne(cursorSec),
    totalTimecode: formatTimecodeSec(cursorSec),
    rows,
    speakerStats,
    bgmTransitions,
    exportScriptText,
  };
}

/* ---------------- 4B. 웹툰 숏폼(9:16) 모션 트레일러 디렉터 ---------------- */

export type ShortformPlatform = "youtube-shorts" | "instagram-reels" | "tiktok";
export type TrailerCameraMove = "zoom-in-punch" | "vertical-scroll-pan" | "diagonal-reveal" | "dramatic-hold" | "whip-cut";

export interface TrailerCutCandidate {
  readonly id: string;
  readonly cutNumber: number;
  readonly captionKo: string;
  readonly hookScore: number;
  readonly emotion: VoiceEmotionTag;
  readonly focalPoint: { readonly x: number; readonly y: number };
  readonly hasSpoiler: boolean;
}

export interface TrailerShotKeyframe {
  readonly sequenceIndex: number;
  readonly sourceCutId: string;
  readonly cutNumber: number;
  readonly subtitleOverlayKo: string;
  readonly cameraMove: TrailerCameraMove;
  readonly startSec: number;
  readonly endSec: number;
  readonly durationSec: number;
  readonly startScale: number;
  readonly endScale: number;
  readonly startX: number;
  readonly endX: number;
  readonly startY: number;
  readonly endY: number;
  readonly easing: "cubic-bezier(0.22, 1, 0.36, 1)" | "cubic-bezier(0.16, 1, 0.3, 1)" | "linear";
}

export interface ShortformTrailerPlan {
  readonly episodeTitle: string;
  readonly platform: ShortformPlatform;
  readonly canvasSpec: { readonly widthPx: 1080; readonly heightPx: 1920; readonly aspectLabel: "9:16" };
  readonly safeZoneInsetPx: { readonly top: number; readonly bottom: number; readonly right: number };
  readonly beatSyncBpm: number;
  readonly totalDurationSec: number;
  readonly excludedSpoilerCount: number;
  readonly shots: readonly TrailerShotKeyframe[];
}

const PLATFORM_SAFE_ZONES: Readonly<Record<ShortformPlatform, { readonly top: number; readonly bottom: number; readonly right: number }>> = {
  "youtube-shorts": { top: 210, bottom: 380, right: 150 },
  "instagram-reels": { top: 240, bottom: 420, right: 160 },
  tiktok: { top: 220, bottom: 440, right: 170 },
};

function selectCameraMove(emotion: VoiceEmotionTag, index: number): TrailerCameraMove {
  if (index === 0) return "zoom-in-punch";
  if (emotion === "분노" || emotion === "긴장") return "whip-cut";
  if (emotion === "슬픔" || emotion === "속삭임") return "dramatic-hold";
  if (emotion === "환희") return "diagonal-reveal";
  return "vertical-scroll-pan";
}

export function buildShortformTrailerPlan(input: {
  readonly episodeTitle: string;
  readonly platform: ShortformPlatform;
  readonly targetDurationSec?: number;
  readonly allowSpoilers?: boolean;
  readonly candidates: readonly TrailerCutCandidate[];
}): ShortformTrailerPlan {
  const allowSpoilers = input.allowSpoilers ?? false;
  const targetSec = Math.max(8, Math.min(45, input.targetDurationSec ?? 18));
  const nonSpoilers = allowSpoilers
    ? [...input.candidates]
    : input.candidates.filter((candidate) => !candidate.hasSpoiler);
  const excludedSpoilerCount = input.candidates.length - nonSpoilers.length;

  // 최고 훅 컷을 0번 오프닝 훅으로 뽑고, 나머지는 스토리 흐름순(cutNumber)으로 정렬해 긴장감을 쌓는다.
  const ranked = [...nonSpoilers].sort((a, b) => b.hookScore - a.hookScore || a.cutNumber - b.cutNumber);
  const maxShots = Math.max(1, Math.min(6, Math.round(targetSec / 3.2)));
  const openingHook = ranked[0];
  const restSelected = ranked
    .slice(1, maxShots)
    .sort((a, b) => a.cutNumber - b.cutNumber);
  const ordered = openingHook ? [openingHook, ...restSelected] : [];

  const shots: TrailerShotKeyframe[] = [];
  let cursor = 0;
  const shotCount = Math.max(1, ordered.length);
  const baseShotDuration = roundOne(targetSec / shotCount);

  ordered.forEach((candidate, idx) => {
    const durationSec = idx === 0 ? roundOne(Math.min(2.6, Math.max(1.8, baseShotDuration * 0.85))) : baseShotDuration;
    const cameraMove = selectCameraMove(candidate.emotion, idx);
    const fx = Math.max(0.15, Math.min(0.85, candidate.focalPoint.x));
    const fy = Math.max(0.15, Math.min(0.85, candidate.focalPoint.y));

    let startScale = 1.06;
    let endScale = 1.11;
    let startX = fx;
    let endX = fx;
    let startY = fy;
    let endY = fy;

    if (cameraMove === "zoom-in-punch") {
      startScale = 1.02;
      endScale = 1.28;
    } else if (cameraMove === "vertical-scroll-pan") {
      startScale = 1.08;
      endScale = 1.08;
      startY = Math.max(0.12, fy - 0.14);
      endY = Math.min(0.88, fy + 0.14);
    } else if (cameraMove === "diagonal-reveal") {
      startScale = 1.12;
      endScale = 1.04;
      startX = Math.max(0.12, fx - 0.1);
      endX = Math.min(0.88, fx + 0.08);
    } else if (cameraMove === "whip-cut") {
      startScale = 1.24;
      endScale = 1.08;
      startX = Math.min(0.9, fx + 0.12);
      endX = fx;
    }

    const startSec = roundOne(cursor);
    const endSec = roundOne(startSec + durationSec);
    shots.push({
      sequenceIndex: idx + 1,
      sourceCutId: candidate.id,
      cutNumber: candidate.cutNumber,
      subtitleOverlayKo: candidate.captionKo,
      cameraMove,
      startSec,
      endSec,
      durationSec,
      startScale,
      endScale,
      startX: roundOne(startX),
      endX: roundOne(endX),
      startY: roundOne(startY),
      endY: roundOne(endY),
      easing: cameraMove === "vertical-scroll-pan" ? "linear" : idx === 0 ? "cubic-bezier(0.16, 1, 0.3, 1)" : "cubic-bezier(0.22, 1, 0.36, 1)",
    });
    cursor = endSec;
  });

  const highTensionRatio = ordered.filter((item) => item.emotion === "분노" || item.emotion === "긴장").length / shotCount;
  const beatSyncBpm = highTensionRatio >= 0.5 ? 128 : 104;

  return {
    episodeTitle: input.episodeTitle,
    platform: input.platform,
    canvasSpec: { widthPx: 1080, heightPx: 1920, aspectLabel: "9:16" },
    safeZoneInsetPx: PLATFORM_SAFE_ZONES[input.platform],
    beatSyncBpm,
    totalDurationSec: roundOne(cursor),
    excludedSpoilerCount,
    shots,
  };
}

/* ---------------- 5. 다국어 문화 적응형 현지화 어시스트 ---------------- */

export type TargetLocale = "en" | "ja" | "vi" | "th" | "id";

export interface TargetLocaleSpec {
  readonly code: TargetLocale;
  readonly labelKo: string;
  readonly nativeLabel: string;
  readonly writingMode: "horizontal-tb" | "vertical-rl";
  readonly widthExpansionFactor: number;
  readonly recommendedLineHeight: number;
  readonly fontFamily: string;
}

export const TARGET_LOCALES: readonly TargetLocaleSpec[] = [
  { code: "en", labelKo: "영어 (북미·글로벌)", nativeLabel: "English", writingMode: "horizontal-tb", widthExpansionFactor: 1.28, recommendedLineHeight: 1.32, fontFamily: "Wild Words / Anime Ace / Noto Sans" },
  { code: "ja", labelKo: "일본어 (세로쓰기 최적화)", nativeLabel: "日本語", writingMode: "vertical-rl", widthExpansionFactor: 0.94, recommendedLineHeight: 1.48, fontFamily: "Source Han Sans JP / Noto Sans JP" },
  { code: "vi", labelKo: "베트남어 (성조 부호 보호)", nativeLabel: "Tiếng Việt", writingMode: "horizontal-tb", widthExpansionFactor: 1.32, recommendedLineHeight: 1.46, fontFamily: "Be Vietnam Pro / Noto Sans" },
  { code: "th", labelKo: "태국어 (상하 성조·모음 여유)", nativeLabel: "ไทย", writingMode: "horizontal-tb", widthExpansionFactor: 1.18, recommendedLineHeight: 1.64, fontFamily: "Noto Sans Thai / Sarabun" },
  { code: "id", labelKo: "인도네시아어 (장문 폭 보정)", nativeLabel: "Bahasa Indonesia", writingMode: "horizontal-tb", widthExpansionFactor: 1.36, recommendedLineHeight: 1.38, fontFamily: "Plus Jakarta Sans / Noto Sans" },
];

interface CulturalReplacementRule {
  readonly koreanPattern: string;
  readonly noteKo: string;
  readonly translations: Readonly<Record<TargetLocale, string>>;
}

const CULTURAL_IDIOM_RULES: readonly CulturalReplacementRule[] = [
  {
    koreanPattern: "두근두근",
    noteKo: "심장 박동 의성어를 각 언어권 만화 독자가 직관적으로 느끼는 효과음으로 치환했습니다.",
    translations: { en: "BA-DUMP", ja: "ドキドキ", vi: "THÌNH THỊCH", th: "ตึกตัก", id: "DEG-DEGAN" },
  },
  {
    koreanPattern: "식은 죽 먹기",
    noteKo: "한국어 관용구 '식은 죽 먹기'를 직역하지 않고 현지 구어 관용구로 바꿨습니다.",
    translations: { en: "a piece of cake", ja: "朝飯前だ", vi: "dễ như ăn kẹo", th: "เรื่องกล้วยๆ", id: "gampang banget" },
  },
  {
    koreanPattern: "식은땀이 뻘뻘",
    noteKo: "긴장 상황의 신체 묘사를 현지 웹툰 문체에 맞게 압축했습니다.",
    translations: { en: "breaking into a cold sweat", ja: "冷や汗が止まらない", vi: "toát mồ hôi lạnh", th: "เหงื่อเย็นไหลพลั่ก", id: "keringat dingin mengucur" },
  },
  {
    koreanPattern: "하늘이 무너져도",
    noteKo: "강한 결의 관용 표현을 현지 극적 대사 톤으로 현지화했습니다.",
    translations: { en: "come hell or high water", ja: "天地がひっくり返っても", vi: "dù trời có sập xuống", th: "ต่อให้ฟ้าถล่มลงมา", id: "walau langit runtuh" },
  },
  {
    koreanPattern: "발이 넓다",
    noteKo: "인맥이 넓다는 관용구를 오해 없는 현지 관용구로 바꿨습니다.",
    translations: { en: "well-connected everywhere", ja: "顔が広い", vi: "quan hệ rộng khắp", th: "รู้จักคนกว้างขวาง", id: "pergaulannya luas sekali" },
  },
  {
    koreanPattern: "쿠구궁",
    noteKo: "저음 붕괴 효과음을 현지 코믹 SFX 음가로 치환했습니다.",
    translations: { en: "RUMBLE!!", ja: "ゴゴゴッ", vi: "ẦM ẦM!!", th: "ครืนนน!!", id: "GUMURUH!!" },
  },
  {
    koreanPattern: "번쩍",
    noteKo: "섬광 효과음을 현지 만화 표기 관례에 맞췄습니다.",
    translations: { en: "FLASH!", ja: "ピカッ", vi: "LOÉ SÁNG!", th: "แวบ!", id: "KILAT!" },
  },
];

export interface LocalizeBalloonInput {
  readonly sourceTextKo: string;
  readonly targetLocale: TargetLocale;
  readonly originalBalloonWidthPx: number;
  readonly originalBalloonHeightPx: number;
  readonly baseFontSizePx: number;
}

export interface LocalizeBalloonResult {
  readonly targetLocale: TargetLocale;
  readonly localeSpec: TargetLocaleSpec;
  readonly localizedText: string;
  readonly matchedIdioms: readonly string[];
  readonly adaptationNotesKo: readonly string[];
  readonly overflowRiskBefore: "safe" | "tight" | "overflow";
  readonly overflowRiskAfter: "safe" | "tight" | "overflow";
  readonly adjustedBalloon: {
    readonly widthPx: number;
    readonly heightPx: number;
    readonly paddingXPx: number;
    readonly paddingYPx: number;
    readonly fontSizePx: number;
    readonly lineHeight: number;
    readonly writingMode: "horizontal-tb" | "vertical-rl";
    readonly fontFamily: string;
  };
}

const GENERIC_PHRASE_TEMPLATES: Readonly<Record<TargetLocale, (text: string) => string>> = {
  en: (text) => `[EN Adapted] ${text}`,
  ja: (text) => `「${text}」`,
  vi: (text) => `[VI] ${text}`,
  th: (text) => `[TH] ${text}`,
  id: (text) => `[ID] ${text}`,
};

export function localizeWebtoonDialogue(input: LocalizeBalloonInput): LocalizeBalloonResult {
  const localeSpec = TARGET_LOCALES.find((spec) => spec.code === input.targetLocale) ?? TARGET_LOCALES[0];
  let adapted = input.sourceTextKo.trim();
  const matchedIdioms: string[] = [];
  const adaptationNotesKo: string[] = [];

  for (const rule of CULTURAL_IDIOM_RULES) {
    if (adapted.includes(rule.koreanPattern)) {
      adapted = adapted.split(rule.koreanPattern).join(rule.translations[input.targetLocale]);
      matchedIdioms.push(rule.koreanPattern);
      adaptationNotesKo.push(rule.noteKo);
    }
  }

  if (matchedIdioms.length === 0) {
    adapted = GENERIC_PHRASE_TEMPLATES[input.targetLocale](adapted);
    adaptationNotesKo.push("사전 등록 관용구가 없어 원문 호흡을 유지한 기본 현지화 초안으로 변환했습니다.");
  }

  const baseWidth = Math.max(80, Math.round(input.originalBalloonWidthPx));
  const baseHeight = Math.max(60, Math.round(input.originalBalloonHeightPx));
  const baseFont = Math.max(12, Math.round(input.baseFontSizePx));
  const charUnits = Math.max(4, adapted.length);
  const beforeCapacity = Math.max(1, (baseWidth / (baseFont * 0.72)) * (baseHeight / (baseFont * 1.4)));
  const beforeRatio = (charUnits * localeSpec.widthExpansionFactor) / beforeCapacity;
  const overflowRiskBefore: LocalizeBalloonResult["overflowRiskBefore"] =
    beforeRatio > 1.05 ? "overflow" : beforeRatio > 0.8 ? "tight" : "safe";

  let widthPx = Math.round(baseWidth * localeSpec.widthExpansionFactor);
  let heightPx = baseHeight;
  let paddingXPx = 16;
  let paddingYPx = 14;
  let fontSizePx = baseFont;

  if (localeSpec.writingMode === "vertical-rl") {
    // 일본어 세로쓰기: 가로형 말풍선을 세로 캡슐형으로 자동 재배치
    widthPx = Math.max(96, Math.round(Math.min(baseWidth, baseHeight) * 0.92));
    heightPx = Math.max(180, Math.round(Math.max(baseWidth, baseHeight) * 1.24));
    paddingXPx = 14;
    paddingYPx = 20;
    adaptationNotesKo.push("일본어 세로쓰기(vertical-rl) 규격에 맞춰 말풍선 비율을 세로 캡슐형으로 회전 보정했습니다.");
  } else if (input.targetLocale === "th") {
    heightPx = Math.round(baseHeight * 1.26);
    paddingYPx = 20;
    adaptationNotesKo.push("태국어 상·하 성조 부호가 잘리지 않도록 줄간격 1.64와 상하 여백을 26% 확장했습니다.");
  } else if (input.targetLocale === "vi") {
    heightPx = Math.round(baseHeight * 1.14);
    paddingYPx = 17;
    adaptationNotesKo.push("베트남어 이중 성조 부호 가독성을 위해 줄간격과 말풍선 가로 폭을 함께 확장했습니다.");
  } else if (overflowRiskBefore === "overflow") {
    heightPx = Math.round(baseHeight * 1.18);
    fontSizePx = Math.max(13, baseFont - 1);
  }

  const afterCapacity = Math.max(
    1,
    ((widthPx - paddingXPx * 2) / (fontSizePx * 0.62)) * ((heightPx - paddingYPx * 2) / (fontSizePx * localeSpec.recommendedLineHeight)),
  );
  const afterRatio = charUnits / afterCapacity;
  const overflowRiskAfter: LocalizeBalloonResult["overflowRiskAfter"] =
    afterRatio > 1.15 ? "overflow" : afterRatio > 0.9 ? "tight" : "safe";

  return {
    targetLocale: input.targetLocale,
    localeSpec,
    localizedText: adapted,
    matchedIdioms,
    adaptationNotesKo,
    overflowRiskBefore,
    overflowRiskAfter,
    adjustedBalloon: {
      widthPx,
      heightPx,
      paddingXPx,
      paddingYPx,
      fontSizePx,
      lineHeight: localeSpec.recommendedLineHeight,
      writingMode: localeSpec.writingMode,
      fontFamily: localeSpec.fontFamily,
    },
  };
}

export {
  packageLocalLoraDataset,
  runCopyrightCleanroomAudit,
  type CleanroomAssetKind,
  type CleanroomAssetRecord,
  type CleanroomAuditFinding,
  type CleanroomLicenseKind,
  type CopyrightCleanroomReport,
  type LocalLoraPackageManifest,
  type LoraAcceptedSample,
  type LoraCutSample,
  type LoraExcludedSample,
  type LoraExclusionReason,
} from "./lora-cleanroom-engine";

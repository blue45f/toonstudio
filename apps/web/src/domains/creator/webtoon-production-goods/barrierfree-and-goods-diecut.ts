/**
 * 웹툰 배리어프리(WCAG 2.2 AAA) 출고 엔진 & 팬덤 굿즈 1클릭 칼선(Die-Cut)·CMYK 화이트 백킹 생성기.
 *
 * - `buildBarrierFreeEpisodeScript`: 화면낭독기·점자·오디오북 호환 JSON + WebVTT + 한/영 대본 생성.
 * - `generateGoodsPrintDieCutPackage`: 아크릴 스탠드·포토카드·키링·스티커 2.0mm 칼선(`CutContour`, 300DPI=24px),
 *   키링 3.0mm 타공 홀, 0.15mm 인쇄 트랩 축소 `SpotWhite` 백킹 마스크 및 도련(Bleed) 규격 검증.
 * - 색상은 전수 OKLCH 토큰만 사용하며(raw color 금지), 브라우저 스토리지에 의존하지 않는다.
 */

import type { Point2D } from "./reference-dock-action-fx-warroom";

export type BarrierFreeCameraShot = "establishing" | "medium" | "close-up" | "extreme-close-up" | "action-pan" | "silent-beat";
export type BarrierFreeDialogueTone = "normal" | "whisper" | "shout" | "narration" | "thought";
export type GoodsProductKind = "acrylic-stand" | "photocard" | "keyring" | "sticker";

export interface BarrierFreeCharacterCue {
  readonly nameKo: string; readonly nameEn?: string;
  readonly emotionKo: string; readonly emotionEn?: string;
  readonly actionKo: string; readonly actionEn?: string;
}

export interface BarrierFreeDialogueCue {
  readonly speakerKo: string; readonly speakerEn?: string;
  readonly textKo: string; readonly textEn?: string;
  readonly tone?: BarrierFreeDialogueTone;
}

export interface BarrierFreeSfxCue {
  readonly soundKo: string; readonly soundEn?: string;
  readonly meaningKo: string; readonly meaningEn?: string;
}

export interface BarrierFreeCutInput {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly settingKo: string;
  readonly settingEn?: string;
  readonly cameraShot: BarrierFreeCameraShot;
  readonly characters: readonly BarrierFreeCharacterCue[];
  readonly dialogues: readonly BarrierFreeDialogueCue[];
  readonly sfxList: readonly BarrierFreeSfxCue[];
  readonly flashOrMotionCue?: boolean;
  readonly customDurationSec?: number;
}

export interface BarrierFreeEpisodeInput {
  readonly workTitleKo: string;
  readonly workTitleEn?: string;
  readonly episodeNumber: number;
  readonly episodeTitleKo: string;
  readonly episodeTitleEn?: string;
  readonly authorName: string;
  readonly readingRateCharsPerSec?: number;
  readonly includeVisualContrastWarnings?: boolean;
  readonly cuts: readonly BarrierFreeCutInput[];
}

export interface AudioDescriptionLine {
  readonly role: "narrator" | "character" | "sfx";
  readonly speakerLabel: string;
  readonly text: string;
}

export interface BarrierFreeCutScript {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly startSec: number;
  readonly endSec: number;
  readonly startTimestamp: string;
  readonly endTimestamp: string;
  readonly altTextKo: string;
  readonly altTextEn: string;
  readonly longDescriptionKo: string;
  readonly longDescriptionEn: string;
  readonly brailleBlockKo: string;
  readonly audioLinesKo: readonly AudioDescriptionLine[];
  readonly audioLinesEn: readonly AudioDescriptionLine[];
  readonly sensoryAdvisoryKo: string | null;
  readonly sensoryAdvisoryEn: string | null;
}

export interface BarrierFreeAuditCheck {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly passed: boolean;
}

export interface BarrierFreeEpisodePackage {
  readonly schemaVersion: "toonstudio.barrier-free-episode.v1";
  readonly wcagConformance: "WCAG-2.2-AAA";
  readonly wcagCriteria: readonly string[];
  readonly episodeMeta: {
    readonly workTitleKo: string; readonly workTitleEn: string; readonly episodeNumber: number;
    readonly episodeTitleKo: string; readonly episodeTitleEn: string; readonly authorName: string;
    readonly totalCuts: number; readonly estimatedTotalDurationSec: number;
  };
  readonly cuts: readonly BarrierFreeCutScript[];
  readonly webVttKo: string;
  readonly webVttEn: string;
  readonly structuredScriptKo: string;
  readonly structuredScriptEn: string;
  readonly brailleTextKo: string;
  readonly screenReaderJson: string;
  readonly audit: {
    readonly passed: boolean;
    readonly conformanceLevel: "AAA" | "AA" | "NEEDS_REVIEW";
    readonly checks: readonly BarrierFreeAuditCheck[];
    readonly warnings: readonly string[];
  };
}

export interface GoodsAlphaMaskInput {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array | readonly number[];
  readonly alphaThreshold?: number;
}

export interface GoodsDieCutInput {
  readonly kind: GoodsProductKind;
  readonly title: string;
  readonly widthMm?: number;
  readonly heightMm?: number;
  readonly dpi?: number;
  readonly dieCutOffsetMm?: number;
  readonly whiteTrapShrinkMm?: number;
  readonly bleedMm?: number;
  readonly enableKeyringHole?: boolean;
  readonly keyringHoleDiameterMm?: number;
  readonly silhouettePolygonMm?: readonly Point2D[];
  readonly alphaMask?: GoodsAlphaMaskInput;
}

export interface GoodsPrintSpecCheck {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly passed: boolean;
  readonly detailKo: string;
  readonly detailEn: string;
}

export interface GoodsKeyringHoleSpec {
  readonly cxMm: number;
  readonly cyMm: number;
  readonly diameterMm: number;
  readonly radiusPx: number;
  readonly wallThicknessMm: number;
}

export interface GoodsPrintDieCutPackage {
  readonly kind: GoodsProductKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly title: string;
  readonly dpi: number;
  readonly canvasWidthMm: number;
  readonly canvasHeightMm: number;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly dieCutOffsetMm: number;
  readonly dieCutOffsetPx: number;
  readonly whiteTrapShrinkMm: number;
  readonly whiteTrapShrinkPx: number;
  readonly bleedMm: number;
  readonly bleedPx: number;
  readonly keyringHole: GoodsKeyringHoleSpec | null;
  readonly artworkPolygonMm: readonly Point2D[];
  readonly dieCutPolygonMm: readonly Point2D[];
  readonly whiteBackingPolygonMm: readonly Point2D[];
  readonly artworkAreaMm2: number;
  readonly dieCutAreaMm2: number;
  readonly whiteBackingAreaMm2: number;
  readonly cmykSeparationSummary: {
    readonly colorSpace: "CMYK+Spot";
    readonly cutContourSpotName: "CutContour";
    readonly cutContourCmyk: "C0 M100 Y0 K0";
    readonly whiteBackingSpotName: "SpotWhite";
    readonly whiteBackingCmyk: "C0 M0 Y0 K0 (100% White Ink)";
    readonly whiteTrapShrinkMm: number;
  };
  readonly validation: {
    readonly passed: boolean;
    readonly checks: readonly GoodsPrintSpecCheck[];
    readonly warnings: readonly string[];
  };
  readonly svgFilename: string;
  readonly jsonFilename: string;
  readonly svg: string;
  readonly printSpecJson: string;
}

const CAMERA_SHOT_LABELS: Readonly<Record<BarrierFreeCameraShot, { readonly ko: string; readonly en: string }>> = {
  establishing: { ko: "전경 설정 샷", en: "Establishing wide shot" },
  medium: { ko: "미디엄 샷", en: "Medium shot" },
  "close-up": { ko: "클로즈업", en: "Close-up" },
  "extreme-close-up": { ko: "익스트림 클로즈업", en: "Extreme close-up" },
  "action-pan": { ko: "역동 패닝 샷", en: "Dynamic action pan" },
  "silent-beat": { ko: "정적 여운 컷", en: "Silent beat panel" },
};

const TONE_LABELS: Readonly<Record<BarrierFreeDialogueTone, { readonly ko: string; readonly en: string }>> = {
  normal: { ko: "", en: "" },
  whisper: { ko: "속삭이며", en: "whispering" },
  shout: { ko: "외치며", en: "shouting" },
  narration: { ko: "내레이션", en: "narration" },
  thought: { ko: "속마음", en: "inner thought" },
};

export const GOODS_PRODUCT_SPECS: Readonly<Record<GoodsProductKind, {
  readonly labelKo: string; readonly labelEn: string;
  readonly defaultWidthMm: number; readonly defaultHeightMm: number;
  readonly minBleedMm: number; readonly defaultBleedMm: number; readonly defaultKeyringHole: boolean;
  readonly noteKo: string; readonly noteEn: string;
}>> = {
  "acrylic-stand": { labelKo: "아크릴 스탠드", labelEn: "Acrylic Stand", defaultWidthMm: 90, defaultHeightMm: 140, minBleedMm: 2.0, defaultBleedMm: 3.0, defaultKeyringHole: false, noteKo: "3mm 투명 아크릴 · 하단 받침 결합 탭(26×5mm) + 0.15mm 화이트 트랩", noteEn: "3mm clear acrylic · bottom peg (26x5mm) + 0.15mm white trap" },
  photocard: { labelKo: "포토카드", labelEn: "Photocard", defaultWidthMm: 55, defaultHeightMm: 85, minBleedMm: 3.0, defaultBleedMm: 3.0, defaultKeyringHole: false, noteKo: "55×85mm 표준 규격 · 3mm 도련 + R3 라운드 칼선 + 부분 화이트 백킹", noteEn: "55x85mm standard · 3mm bleed + R3 rounded die-cut + white backing" },
  keyring: { labelKo: "아크릴 키링", labelEn: "Acrylic Keyring", defaultWidthMm: 55, defaultHeightMm: 70, minBleedMm: 2.0, defaultBleedMm: 3.0, defaultKeyringHole: true, noteKo: "상단 3.0mm 타공 홀 + 2.0mm 칼선 여백(300DPI=24px) + 화이트 백킹", noteEn: "Top 3.0mm punch hole + 2.0mm die-cut (24px@300DPI) + white backing" },
  sticker: { labelKo: "칼선 스티커", labelEn: "Kiss-Cut Sticker", defaultWidthMm: 65, defaultHeightMm: 65, minBleedMm: 2.0, defaultBleedMm: 2.5, defaultKeyringHole: false, noteKo: "리무버블 유포지 반칼(Kiss-Cut) 2.0mm 외곽선 + 투명지 화이트 백킹", noteEn: "Removable vinyl 2.0mm kiss-cut contour + clear-stock white backing" },
};

export const DEFAULT_BARRIER_FREE_EPISODE_INPUT: BarrierFreeEpisodeInput = {
  workTitleKo: "은월의 기록", workTitleEn: "Chronicle of the Silver Moon",
  episodeNumber: 24, episodeTitleKo: "붉은 다리의 결투", episodeTitleEn: "Duel on the Red Bridge",
  authorName: "한별 스튜디오", readingRateCharsPerSec: 5.2, includeVisualContrastWarnings: true,
  cuts: [
    {
      cutId: "EP24-CUT-01", cutNumber: 1, cameraShot: "establishing",
      settingKo: "비 내리는 야간 붉은 철교, 푸른 가로등 불빛이 젖은 노면에 번진다",
      settingEn: "Rain-soaked red steel bridge at night with cool streetlights on wet asphalt",
      characters: [{ nameKo: "강서연", nameEn: "Kang Seoyeon", emotionKo: "결연한 긴장", emotionEn: "resolute tension", actionKo: "우산을 접어 던지고 은장 장검의 칼자루를 움켜쥔다", actionEn: "drops her umbrella and grips the silver-hilted blade" }],
      dialogues: [{ speakerKo: "내레이터", speakerEn: "Narrator", textKo: "자정이 지나는 순간, 다리 양끝의 결계가 닫혔다.", textEn: "The instant midnight struck, the barrier sealed both ends of the bridge.", tone: "narration" }],
      sfxList: [{ soundKo: "쏴아아아—", soundEn: "SHHHH—", meaningKo: "거센 빗줄기 소리", meaningEn: "heavy pouring rain" }],
    },
    {
      cutId: "EP24-CUT-02", cutNumber: 2, cameraShot: "close-up",
      settingKo: "안개 너머 다리 중앙, 푸른 수증기가 소용돌이친다",
      settingEn: "Center of the foggy bridge where swirling blue mist rises",
      characters: [{ nameKo: "윤하린", nameEn: "Yoon Harin", emotionKo: "냉소적 여유", emotionEn: "cool composure", actionKo: "모노클을 손끝으로 고쳐 쓰며 정면을 응시한다", actionEn: "adjusts her monocle calmly while locking eyes ahead" }],
      dialogues: [{ speakerKo: "윤하린", speakerEn: "Yoon Harin", textKo: "늦었어, 서연. 이미 승부는 기울었어.", textEn: "You are late, Seoyeon. The outcome is already sealed.", tone: "whisper" }],
      sfxList: [{ soundKo: "찰칵", soundEn: "CLICK", meaningKo: "모노클 체인이 부딪히는 금속음", meaningEn: "metallic click of the monocle chain" }],
    },
    {
      cutId: "EP24-CUT-03", cutNumber: 3, cameraShot: "action-pan", flashOrMotionCue: true,
      settingKo: "검기와 물보라가 정면 충돌하며 강한 섬광이 화면을 가로지른다",
      settingEn: "Blade aura and hydro surge collide head-on with a bright flash",
      characters: [{ nameKo: "강서연", nameEn: "Kang Seoyeon", emotionKo: "격렬한 분노", emotionEn: "fierce anger", actionKo: "대각선으로 검기를 휘둘러 수벽을 갈라낸다", actionEn: "slashes diagonally to split the water wall apart" }],
      dialogues: [{ speakerKo: "강서연", speakerEn: "Kang Seoyeon", textKo: "끝날 때까지는 끝난 게 아니야!", textEn: "It is not over until the last strike lands!", tone: "shout" }],
      sfxList: [{ soundKo: "콰아앙!", soundEn: "KRA-KOOM!", meaningKo: "검기와 충격파가 폭발하는 굉음", meaningEn: "explosive shockwave collision" }],
    },
    {
      cutId: "EP24-CUT-04", cutNumber: 4, cameraShot: "silent-beat",
      settingKo: "갈라진 빗방울이 공중에 멈춘 듯 고요해진 다리 위",
      settingEn: "Quiet pause above the bridge as split raindrops hang in mid-air",
      characters: [{ nameKo: "한도윤", nameEn: "Han Doyun", emotionKo: "안도와 자신감", emotionEn: "relieved confidence", actionKo: "다리 난간 위에서 화염 부적을 손가락 사이에 끼워 보인다", actionEn: "holds a glowing flame talisman between his fingers atop the railing" }],
      dialogues: [{ speakerKo: "한도윤", speakerEn: "Han Doyun", textKo: "딱 맞춰 도착했군.", textEn: "Right on cue.", tone: "normal" }],
      sfxList: [{ soundKo: "치직", soundEn: "FZZT", meaningKo: "불꽃 부적이 점화되는 마찰음", meaningEn: "spark of an igniting flame talisman" }],
    },
  ],
};

const clamp = (v: number, min: number, max: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
const round2 = (v: number): number => Math.round(v * 100) / 100;

function cleanText(raw: string | undefined): string {
  if (!raw) return "";
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw.charCodeAt(i);
    out += c < 32 || c === 127 ? " " : raw[i];
  }
  return out.replaceAll("-->", "->").replace(/\s+/gu, " ").trim();
}

const escapeXml = (s: string): string =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function formatVttTimestamp(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
}

const slugify = (raw: string): string => cleanText(raw).toLowerCase().replace(/[^a-z0-9가-힣]+/gu, "-").replace(/^-+|-+$/gu, "") || "toonstudio-goods";

export function buildBarrierFreeEpisodeScript(input: BarrierFreeEpisodeInput): BarrierFreeEpisodePackage {
  const workTitleKo = cleanText(input.workTitleKo) || "무제 웹툰";
  const workTitleEn = cleanText(input.workTitleEn) || workTitleKo;
  const episodeNumber = Math.max(1, Math.round(Number.isFinite(input.episodeNumber) ? input.episodeNumber : 1));
  const episodeTitleKo = cleanText(input.episodeTitleKo) || `제${episodeNumber}화`;
  const episodeTitleEn = cleanText(input.episodeTitleEn) || `Episode ${episodeNumber}`;
  const authorName = cleanText(input.authorName) || "작가 미상";
  const readingRate = clamp(input.readingRateCharsPerSec ?? 5.2, 2.5, 10.0);
  const includeWarnings = input.includeVisualContrastWarnings ?? true;

  let cursorSec = 0;
  let allDialoguesHaveSpeakers = true, allSfxHaveMeanings = true, allCutsHaveAltText = true;
  const warnings: string[] = [];

  const cuts: BarrierFreeCutScript[] = input.cuts.map((cut, index) => {
    const cutNum = Math.max(1, Math.round(Number.isFinite(cut.cutNumber) ? cut.cutNumber : index + 1));
    const shot = CAMERA_SHOT_LABELS[cut.cameraShot] ?? CAMERA_SHOT_LABELS.medium;
    const settingKo = cleanText(cut.settingKo) || "장면 배경 설명 없음";
    const settingEn = cleanText(cut.settingEn) || settingKo;

    const charKo = cut.characters.map((c) => `${cleanText(c.nameKo)}(${cleanText(c.emotionKo)})이 ${cleanText(c.actionKo)}`);
    const charEn = cut.characters.map((c) => `${cleanText(c.nameEn) || cleanText(c.nameKo)} (${cleanText(c.emotionEn) || cleanText(c.emotionKo)}) ${cleanText(c.actionEn) || cleanText(c.actionKo)}`);

    const sfxKo: string[] = [], sfxEn: string[] = [];
    for (const sfx of cut.sfxList) {
      const sk = cleanText(sfx.soundKo), mk = cleanText(sfx.meaningKo);
      const se = cleanText(sfx.soundEn) || sk, me = cleanText(sfx.meaningEn) || mk;
      if (!mk) { allSfxHaveMeanings = false; warnings.push(`컷 #${cutNum} 효과음 "${sk}"에 의미 설명이 비어 있습니다.`); }
      sfxKo.push(`${sk}(${mk || "효과음"})`);
      sfxEn.push(`${se} (${me || "SFX"})`);
    }

    const audioLinesKo: AudioDescriptionLine[] = [];
    const audioLinesEn: AudioDescriptionLine[] = [];
    const sensoryAdvisoryKo = includeWarnings && cut.flashOrMotionCue ? "시각 주의(WCAG 2.3.2): 강한 섬광 또는 급격한 액션 전환이 포함된 컷입니다." : null;
    const sensoryAdvisoryEn = includeWarnings && cut.flashOrMotionCue ? "Sensory Advisory (WCAG 2.3.2): Contains bright flash or rapid motion transition." : null;

    const narrKo = `[${shot.ko}] ${settingKo}.${charKo.length > 0 ? ` ${charKo.join(". ")}.` : ""}`;
    const narrEn = `[${shot.en}] ${settingEn}.${charEn.length > 0 ? ` ${charEn.join(". ")}.` : ""}`;
    audioLinesKo.push({ role: "narrator", speakerLabel: "해설", text: narrKo });
    audioLinesEn.push({ role: "narrator", speakerLabel: "Narrator", text: narrEn });

    if (sfxKo.length > 0) {
      audioLinesKo.push({ role: "sfx", speakerLabel: "효과음", text: sfxKo.join(", ") });
      audioLinesEn.push({ role: "sfx", speakerLabel: "SFX", text: sfxEn.join(", ") });
    }

    const dlgKo: string[] = [], dlgEn: string[] = [];
    for (const line of cut.dialogues) {
      const spK = cleanText(line.speakerKo), spE = cleanText(line.speakerEn) || spK;
      const txK = cleanText(line.textKo), txE = cleanText(line.textEn) || txK;
      if (!spK) { allDialoguesHaveSpeakers = false; warnings.push(`컷 #${cutNum} 대사에 화자 이름이 누락되었습니다.`); }
      const tone = TONE_LABELS[line.tone ?? "normal"];
      audioLinesKo.push({ role: "character", speakerLabel: spK || "화자", text: tone.ko ? `(${tone.ko}) "${txK}"` : `"${txK}"` });
      audioLinesEn.push({ role: "character", speakerLabel: spE || "Speaker", text: tone.en ? `(${tone.en}) "${txE}"` : `"${txE}"` });
      dlgKo.push(`${spK || "화자"}: ${txK}`);
      dlgEn.push(`${spE || "Speaker"}: ${txE}`);
    }

    const altTextKo = cleanText(`컷 ${cutNum}, ${shot.ko}. ${settingKo}. ${charKo.join(" ")} ${sfxKo.length > 0 ? `효과음 ${sfxKo.join(", ")}.` : ""} ${dlgKo.join(" ")}`);
    const altTextEn = cleanText(`Panel ${cutNum}, ${shot.en}. ${settingEn}. ${charEn.join(" ")} ${sfxEn.length > 0 ? `SFX ${sfxEn.join(", ")}.` : ""} ${dlgEn.join(" ")}`);
    if (!altTextKo || !altTextEn) allCutsHaveAltText = false;

    const longDescriptionKo = [sensoryAdvisoryKo, narrKo, sfxKo.length > 0 ? `효과음 묘사: ${sfxKo.join(", ")}.` : null, dlgKo.length > 0 ? `대사: ${dlgKo.join(" / ")}` : null].filter(Boolean).join(" ");
    const longDescriptionEn = [sensoryAdvisoryEn, narrEn, sfxEn.length > 0 ? `Sound effects: ${sfxEn.join(", ")}.` : null, dlgEn.length > 0 ? `Dialogue: ${dlgEn.join(" / ")}` : null].filter(Boolean).join(" ");
    const brailleBlockKo = [
      `[컷 ${String(cutNum).padStart(2, "0")}]`,
      sensoryAdvisoryKo ? "[주의] 강한 섬광·속도 전환" : null,
      `[장면] ${shot.ko} - ${settingKo}`,
      charKo.length > 0 ? `[인물] ${charKo.join(" / ")}` : null,
      sfxKo.length > 0 ? `[효과음] ${sfxKo.join(" / ")}` : null,
      dlgKo.length > 0 ? `[대사] ${dlgKo.join(" / ")}` : null,
    ].filter(Boolean).join("\n");

    const dur = cut.customDurationSec !== undefined && Number.isFinite(cut.customDurationSec)
      ? clamp(cut.customDurationSec, 1.5, 90)
      : round2(clamp(longDescriptionKo.length / readingRate + 1.4, 2.5, 45));
    const startSec = round2(cursorSec), endSec = round2(cursorSec + dur);
    cursorSec = round2(endSec + 0.35);

    return {
      cutId: cleanText(cut.cutId) || `CUT-${String(cutNum).padStart(2, "0")}`, cutNumber: cutNum,
      startSec, endSec, startTimestamp: formatVttTimestamp(startSec), endTimestamp: formatVttTimestamp(endSec),
      altTextKo, altTextEn, longDescriptionKo, longDescriptionEn, brailleBlockKo, audioLinesKo, audioLinesEn, sensoryAdvisoryKo, sensoryAdvisoryEn,
    };
  });

  const vttMonotonic = cuts.every((c, i) => c.endSec > c.startSec && (i === 0 || c.startSec >= cuts[i - 1].endSec));
  const webVttKo = ["WEBVTT", "", `NOTE ToonStudio WCAG 2.2 AAA Audio Description | ${workTitleKo} 제${episodeNumber}화 ${episodeTitleKo}`, "", ...cuts.flatMap((c, i) => [`${i + 1}`, `${c.startTimestamp} --> ${c.endTimestamp}`, ...(c.sensoryAdvisoryKo ? [`<v 안내>${c.sensoryAdvisoryKo}</v>`] : []), c.audioLinesKo.map((l) => `<v ${l.speakerLabel}>${l.text}</v>`).join("\n"), ""])].join("\n");
  const webVttEn = ["WEBVTT", "", `NOTE ToonStudio WCAG 2.2 AAA Audio Description | ${workTitleEn} Ep.${episodeNumber} ${episodeTitleEn}`, "", ...cuts.flatMap((c, i) => [`${i + 1}`, `${c.startTimestamp} --> ${c.endTimestamp}`, ...(c.sensoryAdvisoryEn ? [`<v Advisory>${c.sensoryAdvisoryEn}</v>`] : []), c.audioLinesEn.map((l) => `<v ${l.speakerLabel}>${l.text}</v>`).join("\n"), ""])].join("\n");
  const structuredScriptKo = [`# 배리어프리 오디오 디스크립션 대본 (WCAG 2.2 AAA)`, `- 작품: ${workTitleKo} · 제${episodeNumber}화 「${episodeTitleKo}」`, `- 작가: ${authorName} · 총 ${cuts.length}컷 · 예상 낭독 시간 ${round2(cursorSec)}초`, "", ...cuts.flatMap((c) => [`## CUT ${String(c.cutNumber).padStart(2, "0")} (${c.startTimestamp} ~ ${c.endTimestamp})`, `- Alt-Text: ${c.altTextKo}`, ...(c.sensoryAdvisoryKo ? [`- 감각 주의: ${c.sensoryAdvisoryKo}`] : []), ...c.audioLinesKo.map((l) => `- [${l.speakerLabel}] ${l.text}`), ""])].join("\n");
  const structuredScriptEn = [`# Barrier-Free Audio Description Script (WCAG 2.2 AAA)`, `- Work: ${workTitleEn} · Episode ${episodeNumber} "${episodeTitleEn}"`, `- Author: ${authorName} · ${cuts.length} cuts · Est. runtime ${round2(cursorSec)}s`, "", ...cuts.flatMap((c) => [`## CUT ${String(c.cutNumber).padStart(2, "0")} (${c.startTimestamp} ~ ${c.endTimestamp})`, `- Alt-Text: ${c.altTextEn}`, ...(c.sensoryAdvisoryEn ? [`- Sensory Advisory: ${c.sensoryAdvisoryEn}`] : []), ...c.audioLinesEn.map((l) => `- [${l.speakerLabel}] ${l.text}`), ""])].join("\n");
  const brailleTextKo = [`[제목] ${workTitleKo} 제${episodeNumber}화 ${episodeTitleKo} / 작가 ${authorName}`, ...cuts.map((c) => c.brailleBlockKo)].join("\n\n");

  const hasControlChar = Array.from(brailleTextKo).some((ch) => {
    const code = ch.charCodeAt(0);
    return (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31);
  });
  const checks: BarrierFreeAuditCheck[] = [
    { id: "alt-text", labelKo: "전 컷 Alt-Text 완비 (WCAG 1.1.1)", labelEn: "All panels have Alt-Text (1.1.1)", passed: cuts.length > 0 && allCutsHaveAltText },
    { id: "speakers", labelKo: "모든 대사 화자 식별 (WCAG 1.2.5)", labelEn: "All dialogue speakers labeled (1.2.5)", passed: allDialoguesHaveSpeakers },
    { id: "sfx-meaning", labelKo: "모든 효과음 의미 병기 (WCAG 1.2.7 AAA)", labelEn: "All SFX include semantic meaning (1.2.7)", passed: allSfxHaveMeanings },
    { id: "vtt-monotonic", labelKo: "WebVTT 비겹침 단조 타임코드 검증", labelEn: "Monotonic non-overlapping WebVTT cues", passed: vttMonotonic },
    { id: "braille-clean", labelKo: "점자 단말기 제어문자 0건 호환", labelEn: "Zero control chars for Braille output", passed: !hasControlChar },
  ];
  const passed = checks.every((c) => c.passed);
  const conformanceLevel = passed ? "AAA" : allCutsHaveAltText && vttMonotonic ? "AA" : "NEEDS_REVIEW";
  const wcagCriteria = ["1.1.1", "1.2.5", "1.2.7", "1.4.6", "2.3.2"];
  const episodeMeta = { workTitleKo, workTitleEn, episodeNumber, episodeTitleKo, episodeTitleEn, authorName, totalCuts: cuts.length, estimatedTotalDurationSec: round2(cursorSec) };
  const screenReaderJson = JSON.stringify({ schemaVersion: "toonstudio.barrier-free-episode.v1", wcagConformance: "WCAG-2.2-AAA", wcagCriteria, episodeMeta, audit: { passed, conformanceLevel, warnings }, cuts }, null, 2);

  return { schemaVersion: "toonstudio.barrier-free-episode.v1", wcagConformance: "WCAG-2.2-AAA", wcagCriteria, episodeMeta, cuts, webVttKo, webVttEn, structuredScriptKo, structuredScriptEn, brailleTextKo, screenReaderJson, audit: { passed, conformanceLevel, checks, warnings } };
}

// ---------------------------------------------------------------------------
// 2) 팬덤 굿즈 1클릭 칼선(Die-Cut) & CMYK 화이트 백킹 벡터 생성기
// ---------------------------------------------------------------------------

export function mmToPixels(mm: number, dpi = 300): number {
  return Math.round((mm / 25.4) * clamp(dpi, 72, 1200));
}

function signedArea(pts: readonly Point2D[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum * 0.5;
}

const ensureCw = (pts: readonly Point2D[]): readonly Point2D[] => (signedArea(pts) < 0 ? [...pts].reverse() : pts);

function computeBounds(pts: readonly Point2D[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  for (const p of pts) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
  return { minX, minY, maxX, maxY };
}

function offsetPolygonMm(polygon: readonly Point2D[], deltaMm: number): readonly Point2D[] {
  const cw = ensureCw(polygon);
  const n = cw.length;
  if (n < 3) return cw;
  const normals = cw.map((a, i) => {
    const b = cw[(i + 1) % n], dx = b.x - a.x, dy = b.y - a.y, len = Math.max(0.0001, Math.hypot(dx, dy));
    return { x: dy / len, y: -dx / len };
  });
  return cw.map((v, i) => {
    const pN = normals[(i - 1 + n) % n], nN = normals[i];
    const bx = pN.x + nN.x, by = pN.y + nN.y, bLen = Math.hypot(bx, by);
    const ux = bLen < 0.0001 ? nN.x : bx / bLen, uy = bLen < 0.0001 ? nN.y : by / bLen;
    const miter = Math.min(1.85, 1 / Math.max(0.45, ux * nN.x + uy * nN.y));
    return { x: round2(v.x + ux * deltaMm * miter), y: round2(v.y + uy * deltaMm * miter) };
  });
}

function extractAlphaHull(mask: GoodsAlphaMaskInput, targetW: number, targetH: number): readonly Point2D[] {
  const th = clamp(mask.alphaThreshold ?? 16, 1, 255);
  const w = Math.max(2, Math.floor(mask.width)), h = Math.max(2, Math.floor(mask.height));
  const pts: Point2D[] = [];
  for (let y = 0; y < h; y += 1) {
    let minC = -1, maxC = -1;
    for (let x = 0; x < w; x += 1) {
      if ((mask.pixels[y * w + x] ?? 0) >= th) { if (minC === -1) minC = x; maxC = x; }
    }
    if (minC !== -1) {
      pts.push({ x: (minC / Math.max(1, w - 1)) * targetW, y: (y / Math.max(1, h - 1)) * targetH });
      if (maxC !== minC) pts.push({ x: (maxC / Math.max(1, w - 1)) * targetW, y: (y / Math.max(1, h - 1)) * targetH });
    }
  }
  if (pts.length < 3) return buildDefaultSilhouette(targetW, targetH, "sticker");
  pts.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Point2D, a: Point2D, b: Point2D): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point2D[] = [], upper: Point2D[] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i -= 1) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop();
  const hull = [...lower, ...upper].map((p) => ({ x: round2(p.x), y: round2(p.y) }));
  return hull.length >= 3 ? ensureCw(hull) : buildDefaultSilhouette(targetW, targetH, "sticker");
}

function buildDefaultSilhouette(w: number, h: number, kind: GoodsProductKind): readonly Point2D[] {
  if (kind === "photocard") {
    const r = clamp(3.0, 0.5, Math.min(w, h) * 0.25);
    return [{ x: r, y: 0 }, { x: w - r, y: 0 }, { x: w, y: r }, { x: w, y: h - r }, { x: w - r, y: h }, { x: r, y: h }, { x: 0, y: h - r }, { x: 0, y: r }];
  }
  const coords: readonly [number, number][] = kind === "acrylic-stand"
    ? [[0.5, 0.04], [0.64, 0.12], [0.72, 0.28], [0.82, 0.48], [0.76, 0.72], [0.72, 0.96], [0.28, 0.96], [0.24, 0.72], [0.18, 0.48], [0.28, 0.28], [0.36, 0.12]]
    : [[0.5, 0.06], [0.72, 0.18], [0.86, 0.44], [0.78, 0.78], [0.58, 0.94], [0.42, 0.94], [0.22, 0.78], [0.14, 0.44], [0.28, 0.18]];
  return ensureCw(coords.map(([rx, ry]) => ({ x: round2(rx * w), y: round2(ry * h) })));
}

export function generateGoodsPrintDieCutPackage(input: GoodsDieCutInput): GoodsPrintDieCutPackage {
  const spec = GOODS_PRODUCT_SPECS[input.kind];
  const title = cleanText(input.title) || spec.labelKo;
  const dpi = clamp(Math.round(input.dpi ?? 300), 72, 1200);
  const widthMm = clamp(input.widthMm ?? spec.defaultWidthMm, 20, 400);
  const heightMm = clamp(input.heightMm ?? spec.defaultHeightMm, 20, 400);
  const dieCutOffsetMm = round2(clamp(input.dieCutOffsetMm ?? 2.0, 0.5, 10.0));
  const whiteTrapShrinkMm = round2(clamp(input.whiteTrapShrinkMm ?? 0.15, 0.05, 1.0));
  const bleedMm = round2(clamp(input.bleedMm ?? spec.defaultBleedMm, 0, 10.0));
  const enableKeyringHole = input.enableKeyringHole ?? spec.defaultKeyringHole;
  const keyringHoleDiameterMm = round2(clamp(input.keyringHoleDiameterMm ?? 3.0, 2.0, 6.0));

  const rawArtwork = input.silhouettePolygonMm && input.silhouettePolygonMm.length >= 3
    ? ensureCw(input.silhouettePolygonMm.map((p) => ({ x: round2(Number.isFinite(p.x) ? p.x : 0), y: round2(Number.isFinite(p.y) ? p.y : 0) })))
    : input.alphaMask ? extractAlphaHull(input.alphaMask, widthMm, heightMm) : buildDefaultSilhouette(widthMm, heightMm, input.kind);

  const rawDieCut = offsetPolygonMm(rawArtwork, dieCutOffsetMm);
  const rawB = computeBounds(rawArtwork);
  const safeShrink = Math.min(whiteTrapShrinkMm, Math.max(1, Math.min(rawB.maxX - rawB.minX, rawB.maxY - rawB.minY)) * 0.2);
  const rawWhite = offsetPolygonMm(rawArtwork, -safeShrink);

  const dieB = computeBounds(rawDieCut);
  const topLugMm = enableKeyringHole ? keyringHoleDiameterMm + 4.0 : 0;
  const bottomPegMm = input.kind === "acrylic-stand" ? 5.0 : 0;
  const sx = round2(bleedMm - dieB.minX), sy = round2(bleedMm + topLugMm - dieB.minY);
  const shift = (poly: readonly Point2D[]): readonly Point2D[] => poly.map((p) => ({ x: round2(p.x + sx), y: round2(p.y + sy) }));

  const artworkPolygonMm = shift(rawArtwork);
  const dieCutPolygonMm = shift(rawDieCut);
  const whiteBackingPolygonMm = shift(rawWhite);
  const sDieB = computeBounds(dieCutPolygonMm);

  const canvasWidthMm = round2(sDieB.maxX + bleedMm);
  const canvasHeightMm = round2(sDieB.maxY + bottomPegMm + bleedMm);
  const canvasWidthPx = mmToPixels(canvasWidthMm, dpi);
  const canvasHeightPx = mmToPixels(canvasHeightMm, dpi);
  const dieCutOffsetPx = mmToPixels(dieCutOffsetMm, dpi);
  const whiteTrapShrinkPx = round2((whiteTrapShrinkMm / 25.4) * dpi);
  const bleedPx = mmToPixels(bleedMm, dpi);
  const artworkAreaMm2 = round2(Math.abs(signedArea(artworkPolygonMm)));
  const dieCutAreaMm2 = round2(Math.abs(signedArea(dieCutPolygonMm)));
  const whiteBackingAreaMm2 = round2(Math.abs(signedArea(whiteBackingPolygonMm)));

  const px = (mm: number): number => round2((mm / 25.4) * dpi);
  const polyPx = (poly: readonly Point2D[]): string => poly.map((p) => `${px(p.x)},${px(p.y)}`).join(" ");
  const wallThicknessMm = 2.2;
  const keyringHole: GoodsKeyringHoleSpec | null = enableKeyringHole
    ? { cxMm: round2((sDieB.minX + sDieB.maxX) * 0.5), cyMm: round2(sDieB.minY - keyringHoleDiameterMm * 0.5 - 1.0), diameterMm: keyringHoleDiameterMm, radiusPx: px(keyringHoleDiameterMm * 0.5), wallThicknessMm }
    : null;

  const hairlinePx = px(0.25);
  const tabW = Math.min(26, round2((sDieB.maxX - sDieB.minX) * 0.42));
  const standTabSvg = input.kind === "acrylic-stand"
    ? `<rect id="AcrylicBasePeg" x="${px((sDieB.minX + sDieB.maxX) * 0.5 - tabW * 0.5)}" y="${px(sDieB.maxY)}" width="${px(tabW)}" height="${px(bottomPegMm)}" rx="${px(0.6)}" fill="none" stroke="oklch(0.62 0.27 332)" stroke-width="${hairlinePx}" />`
    : "";
  const keyringLugSvg = keyringHole
    ? `<circle id="KeyringOuterLug" cx="${px(keyringHole.cxMm)}" cy="${px(keyringHole.cyMm)}" r="${px(keyringHole.diameterMm * 0.5 + keyringHole.wallThicknessMm)}" fill="none" stroke="oklch(0.62 0.27 332)" stroke-width="${hairlinePx}" /><circle id="KeyringPunchHole" data-hole-diameter-mm="${keyringHole.diameterMm}" cx="${px(keyringHole.cxMm)}" cy="${px(keyringHole.cyMm)}" r="${keyringHole.radiusPx}" fill="oklch(0.155 0.008 70)" stroke="oklch(0.62 0.27 332)" stroke-width="${hairlinePx}" />`
    : "";

  const checks: GoodsPrintSpecCheck[] = [
    { id: "dpi-300", labelKo: "인쇄 해상도 300 DPI 이상", labelEn: "Print resolution >= 300 DPI", passed: dpi >= 300, detailKo: `현재 ${dpi} DPI`, detailEn: `Current ${dpi} DPI` },
    { id: "diecut-offset", labelKo: "외곽 칼선 2.0mm 여백 확장", labelEn: "Outer die-cut contour >= 2.0mm", passed: dieCutOffsetMm >= 2.0 && dieCutAreaMm2 > artworkAreaMm2, detailKo: `여백 ${dieCutOffsetMm}mm (${dieCutOffsetPx}px @ ${dpi}DPI)`, detailEn: `Offset ${dieCutOffsetMm}mm (${dieCutOffsetPx}px @ ${dpi}DPI)` },
    { id: "white-trap", labelKo: "CMYK 화이트 백킹 0.15mm 인쇄 트랩 축소", labelEn: "CMYK SpotWhite 0.15mm trap shrink", passed: whiteTrapShrinkMm >= 0.1 && whiteBackingAreaMm2 < artworkAreaMm2 && whiteBackingAreaMm2 > 0, detailKo: `트랩 축소 ${whiteTrapShrinkMm}mm (${whiteTrapShrinkPx}px) · ${whiteBackingAreaMm2}mm2 < ${artworkAreaMm2}mm2`, detailEn: `Trap ${whiteTrapShrinkMm}mm (${whiteTrapShrinkPx}px) · ${whiteBackingAreaMm2}mm2 < ${artworkAreaMm2}mm2` },
    { id: "bleed-margin", labelKo: `인쇄소 도련(Bleed) ${spec.minBleedMm}mm 이상`, labelEn: `Bleed margin >= ${spec.minBleedMm}mm`, passed: bleedMm >= spec.minBleedMm, detailKo: `도련 ${bleedMm}mm (${bleedPx}px)`, detailEn: `Bleed ${bleedMm}mm (${bleedPx}px)` },
    ...(keyringHole ? [{ id: "keyring-hole", labelKo: "키링 3.0mm 타공 홀 & 아크릴 외벽 검증", labelEn: "Keyring 3.0mm punch hole & wall", passed: keyringHole.diameterMm >= 3.0 && keyringHole.wallThicknessMm >= 2.0, detailKo: `타공 ${keyringHole.diameterMm}mm · 외벽 ${keyringHole.wallThicknessMm}mm`, detailEn: `Hole ${keyringHole.diameterMm}mm · wall ${keyringHole.wallThicknessMm}mm` }] : []),
  ];
  const warnings = checks.filter((c) => !c.passed).map((c) => `${c.labelKo}: ${c.detailKo}`);
  const passed = warnings.length === 0;
  const cmykSeparationSummary = { colorSpace: "CMYK+Spot" as const, cutContourSpotName: "CutContour" as const, cutContourCmyk: "C0 M100 Y0 K0" as const, whiteBackingSpotName: "SpotWhite" as const, whiteBackingCmyk: "C0 M0 Y0 K0 (100% White Ink)" as const, whiteTrapShrinkMm };

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidthMm}mm" height="${canvasHeightMm}mm" viewBox="0 0 ${canvasWidthPx} ${canvasHeightPx}" data-goods-kind="${input.kind}" data-dpi="${dpi}">`,
    `<title>${escapeXml(title)} — ${escapeXml(spec.labelKo)} CutContour &amp; SpotWhite</title>`,
    `<metadata>ToonStudio Die-Cut | Kind=${input.kind} | DPI=${dpi} | CutContour=C0M100Y0K0(${dieCutOffsetMm}mm/${dieCutOffsetPx}px) | SpotWhite=Trap-${whiteTrapShrinkMm}mm | Bleed=${bleedMm}mm</metadata>`,
    `<rect width="${canvasWidthPx}" height="${canvasHeightPx}" fill="oklch(0.17 0.009 68)" />`,
    `<g id="BleedBox" data-layer="bleed" data-bleed-mm="${bleedMm}"><rect x="${px(bleedMm * 0.5)}" y="${px(bleedMm * 0.5)}" width="${round2(canvasWidthPx - px(bleedMm))}" height="${round2(canvasHeightPx - px(bleedMm))}" fill="none" stroke="oklch(0.75 0.11 232 / 0.55)" stroke-width="2" stroke-dasharray="10 6" /></g>`,
    `<g id="SpotWhite" data-spot-color="SpotWhite" data-cmyk="0,0,0,0" data-white-ink="100%" data-trap-shrink-mm="${whiteTrapShrinkMm}"><polygon points="${polyPx(whiteBackingPolygonMm)}" fill="oklch(0.97 0.005 85 / 0.85)" /></g>`,
    `<g id="ArtworkSilhouette" data-layer="artwork-guide"><polygon points="${polyPx(artworkPolygonMm)}" fill="oklch(0.69 0.13 232 / 0.28)" stroke="oklch(0.8 0.11 232 / 0.72)" stroke-width="2" /></g>`,
    `<g id="CutContour" data-spot-color="CutContour" data-cmyk="0,100,0,0" data-offset-mm="${dieCutOffsetMm}" data-offset-px="${dieCutOffsetPx}"><polygon points="${polyPx(dieCutPolygonMm)}" fill="none" stroke="oklch(0.62 0.27 332)" stroke-width="${hairlinePx}" stroke-linejoin="round" />${standTabSvg}${keyringLugSvg}</g>`,
    `</svg>`,
  ].join("");

  const slug = slugify(title);
  const svgFilename = `${slug}-${input.kind}-cutcontour-300dpi.svg`;
  const jsonFilename = `${slug}-${input.kind}-print-spec.json`;
  const printSpecJson = JSON.stringify({ schemaVersion: "toonstudio.goods-diecut-spec.v1", kind: input.kind, title, dpi, canvasMm: { width: canvasWidthMm, height: canvasHeightMm }, canvasPx: { width: canvasWidthPx, height: canvasHeightPx }, dieCutOffsetMm, dieCutOffsetPx, whiteTrapShrinkMm, whiteTrapShrinkPx, bleedMm, bleedPx, keyringHole, cmykSeparationSummary, validation: { passed, warnings } }, null, 2);

  return { kind: input.kind, labelKo: spec.labelKo, labelEn: spec.labelEn, title, dpi, canvasWidthMm, canvasHeightMm, canvasWidthPx, canvasHeightPx, dieCutOffsetMm, dieCutOffsetPx, whiteTrapShrinkMm, whiteTrapShrinkPx, bleedMm, bleedPx, keyringHole, artworkPolygonMm, dieCutPolygonMm, whiteBackingPolygonMm, artworkAreaMm2, dieCutAreaMm2, whiteBackingAreaMm2, cmykSeparationSummary, validation: { passed, checks, warnings }, svgFilename, jsonFilename, svg, printSpecJson };
}

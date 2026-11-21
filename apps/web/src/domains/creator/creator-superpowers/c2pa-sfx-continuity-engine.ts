/**
 * 창작 슈퍼파워 엔진 Part 1:
 *  - #7 C2PA + 제작 타임랩스 저작권 증빙 패키지 (표준 SHA-256 해시 체인)
 *  - #8 감정 인식 말풍선 · 폰트 · 효과음(SFX) 자동 식자 (6감정 · 한/일/영)
 *  - #9 장기 연재(50화+) 떡밥 · 설정 오류 감지기 (부상·의상·호칭·시간선)
 */

// ── 표준 FIPS 180-4 SHA-256 (외부 의존성 없이 브라우저·Node 동일 동작) ──
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const SHA256_INIT = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19] as const;

const rotr = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));

/** UTF-8 문자열의 64자리 소문자 SHA-256 16진수 해시를 동기 계산한다. */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const buffer = new Uint8Array(paddedLen);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const hash = new Uint32Array(SHA256_INIT);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = [
      hash[0] ?? 0, hash[1] ?? 0, hash[2] ?? 0, hash[3] ?? 0,
      hash[4] ?? 0, hash[5] ?? 0, hash[6] ?? 0, hash[7] ?? 0,
    ];

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    const deltas = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i += 1) hash[i] = ((hash[i] ?? 0) + (deltas[i] ?? 0)) >>> 0;
  }

  return Array.from(hash, (word) => word.toString(16).padStart(8, "0")).join("");
}

// ── #7 C2PA + 제작 타임랩스 저작권 증빙 패키지 ──

export type StrokeAuthorSource = "human-pen" | "human-touch" | "ai-assist";
export type ProductionStageTag = "rough" | "ink" | "base-color" | "shading" | "lettering";

export interface StrokeAuditEvent {
  readonly strokeId: string;
  readonly timestampMs: number;
  readonly layerId: string;
  readonly stage: ProductionStageTag;
  readonly tool: string;
  readonly pointCount: number;
  readonly pressureAvg: number;
  readonly authorSource: StrokeAuthorSource;
}

export interface StrokeHashChainLink {
  readonly index: number;
  readonly strokeId: string;
  readonly timestampMs: number;
  readonly prevHash: string;
  readonly eventHash: string;
  readonly chainHash: string;
  readonly stage: ProductionStageTag;
  readonly authorSource: StrokeAuthorSource;
}

export interface TimelapseFrameSummary {
  readonly frameNumber: number;
  readonly stage: ProductionStageTag;
  readonly stageLabelKo: string;
  readonly cumulativeStrokes: number;
  readonly elapsedSeconds: number;
  readonly checkpointHash: string;
}

export interface C2paManifestPackage {
  readonly specVersion: "c2pa-2.1";
  readonly claimGenerator: string;
  readonly workTitle: string;
  readonly authorName: string;
  readonly episodeNumber: number;
  readonly canvasSize: { readonly width: number; readonly height: number };
  readonly createdAtIso: string;
  readonly genesisHash: string;
  readonly finalChainHash: string;
  readonly totalStrokes: number;
  readonly humanAuthoredRatio: number;
  readonly aiAssistRatio: number;
  readonly elapsedSeconds: number;
  readonly strokeChain: readonly StrokeHashChainLink[];
  readonly timelapseFrames: readonly TimelapseFrameSummary[];
  readonly sourceEvents: readonly StrokeAuditEvent[];
  readonly manifestJson: string;
}

export interface C2paChainVerificationResult {
  readonly valid: boolean;
  readonly verifiedLinks: number;
  readonly tamperedIndex: number | null;
  readonly reasonKo: string;
}

const STAGE_LABEL_KO: Readonly<Record<ProductionStageTag, string>> = {
  rough: "콘티·러프 스케치",
  ink: "선화 펜터치",
  "base-color": "밑색 채색",
  shading: "명암·광원 효과",
  lettering: "말풍선·효과음 식자",
};

export const SAMPLE_STROKE_AUDIT_EVENTS: readonly StrokeAuditEvent[] = Object.freeze([
  { strokeId: "stk-001", timestampMs: 1763700000000, layerId: "L-rough", stage: "rough", tool: "연필 B", pointCount: 48, pressureAvg: 0.42, authorSource: "human-pen" },
  { strokeId: "stk-002", timestampMs: 1763700120000, layerId: "L-rough", stage: "rough", tool: "연필 B", pointCount: 64, pressureAvg: 0.48, authorSource: "human-pen" },
  { strokeId: "stk-003", timestampMs: 1763700420000, layerId: "L-ink", stage: "ink", tool: "웹툰 G펜", pointCount: 112, pressureAvg: 0.67, authorSource: "human-pen" },
  { strokeId: "stk-004", timestampMs: 1763700780000, layerId: "L-ink", stage: "ink", tool: "웹툰 G펜", pointCount: 95, pressureAvg: 0.71, authorSource: "human-pen" },
  { strokeId: "stk-005", timestampMs: 1763701140000, layerId: "L-color", stage: "base-color", tool: "자동 밑색 채움", pointCount: 14, pressureAvg: 0.5, authorSource: "ai-assist" },
  { strokeId: "stk-006", timestampMs: 1763701560000, layerId: "L-shade", stage: "shading", tool: "2단 셀 음영 브러시", pointCount: 84, pressureAvg: 0.61, authorSource: "human-pen" },
  { strokeId: "stk-007", timestampMs: 1763701980000, layerId: "L-sfx", stage: "lettering", tool: "말풍선·식자 펜", pointCount: 36, pressureAvg: 0.55, authorSource: "human-touch" },
]);

const canonicalStrokePayload = (event: StrokeAuditEvent): string =>
  [event.strokeId, String(event.timestampMs), event.layerId, event.stage, event.tool, String(event.pointCount), event.pressureAvg.toFixed(4), event.authorSource].join("|");

const buildGenesisHash = (workTitle: string, authorName: string, episodeNumber: number): string =>
  sha256Hex(`toonstudio:c2pa:v1|${workTitle}|${authorName}|ep:${episodeNumber}`);

/** 스트로크 이력 해시 체인 + 타임랩스 프레임 요약 + C2PA 2.1 매니페스트 패키지를 생성한다. */
export function buildC2paCopyrightPackage(input: {
  readonly workTitle: string;
  readonly authorName: string;
  readonly episodeNumber: number;
  readonly canvasSize?: { readonly width: number; readonly height: number };
  readonly strokes: readonly StrokeAuditEvent[];
  readonly recordedAtIso?: string;
}): C2paManifestPackage {
  const canvasSize = input.canvasSize ?? { width: 800, height: 12800 };
  const createdAtIso = input.recordedAtIso ?? "2026-11-22T00:00:00.000Z";
  const genesisHash = buildGenesisHash(input.workTitle, input.authorName, input.episodeNumber);
  const claimGenerator = "ToonStudio/2.0 (Local-First C2PA Provenance Engine)";

  let prevHash = genesisHash;
  const strokeChain: StrokeHashChainLink[] = [];
  const timelapseFrames: TimelapseFrameSummary[] = [];

  const firstTs = input.strokes[0]?.timestampMs ?? 0;
  const elapsedSeconds = Math.max(0, Math.round(((input.strokes.at(-1)?.timestampMs ?? firstTs) - firstTs) / 1000));

  let humanCount = 0;
  let aiCount = 0;
  let lastRecordedStage: ProductionStageTag | null = null;

  for (let i = 0; i < input.strokes.length; i += 1) {
    const stroke = input.strokes[i]!;
    if (stroke.authorSource === "ai-assist") aiCount += 1;
    else humanCount += 1;

    const eventHash = sha256Hex(canonicalStrokePayload(stroke));
    const chainHash = sha256Hex(`${prevHash}:${eventHash}:${i}`);
    strokeChain.push({
      index: i, strokeId: stroke.strokeId, timestampMs: stroke.timestampMs,
      prevHash, eventHash, chainHash, stage: stroke.stage, authorSource: stroke.authorSource,
    });

    if (stroke.stage !== lastRecordedStage || i === input.strokes.length - 1) {
      timelapseFrames.push({
        frameNumber: timelapseFrames.length + 1,
        stage: stroke.stage,
        stageLabelKo: STAGE_LABEL_KO[stroke.stage],
        cumulativeStrokes: i + 1,
        elapsedSeconds: Math.max(0, Math.round((stroke.timestampMs - firstTs) / 1000)),
        checkpointHash: chainHash.slice(0, 16),
      });
      lastRecordedStage = stroke.stage;
    }
    prevHash = chainHash;
  }

  const totalStrokes = input.strokes.length;
  const humanAuthoredRatio = totalStrokes === 0 ? 0 : Number((humanCount / totalStrokes).toFixed(4));
  const aiAssistRatio = totalStrokes === 0 ? 0 : Number((aiCount / totalStrokes).toFixed(4));

  const manifestObject = {
    spec_version: "c2pa-2.1",
    claim_generator: claimGenerator,
    dc_title: `${input.workTitle} ${input.episodeNumber}화`,
    recorded_at: createdAtIso,
    assertions: [
      { label: "stds.schema-org.CreativeWork", data: { "@type": "VisualArtwork", author: input.authorName, episodeNumber: input.episodeNumber, ...canvasSize } },
      { label: "c2pa.actions", data: { actions: [{ action: "c2pa.created", humanStrokeRatio: humanAuthoredRatio, aiAssistStrokeRatio: aiAssistRatio }] } },
      { label: "toonstudio.stroke-chain.v1", data: { algorithm: "SHA-256", genesisHash, finalChainHash: prevHash, strokeCount: totalStrokes, elapsedSeconds } },
      { label: "toonstudio.timelapse-summary.v1", data: { frameCount: timelapseFrames.length, checkpoints: timelapseFrames } },
    ],
  };

  return {
    specVersion: "c2pa-2.1", claimGenerator, workTitle: input.workTitle, authorName: input.authorName,
    episodeNumber: input.episodeNumber, canvasSize, createdAtIso, genesisHash, finalChainHash: prevHash,
    totalStrokes, humanAuthoredRatio, aiAssistRatio, elapsedSeconds, strokeChain, timelapseFrames,
    sourceEvents: input.strokes, manifestJson: JSON.stringify(manifestObject, null, 2),
  };
}

/** C2PA 스트로크 해시 체인의 무결성(위변조·삭제·순서 역전 여부)을 전수 검증한다. */
export function verifyC2paStrokeChain(pkg: C2paManifestPackage): C2paChainVerificationResult {
  if (pkg.genesisHash !== buildGenesisHash(pkg.workTitle, pkg.authorName, pkg.episodeNumber)) {
    return { valid: false, verifiedLinks: 0, tamperedIndex: 0, reasonKo: "작품·작가 제네시스 해시가 변조되었습니다." };
  }
  if (pkg.strokeChain.length !== pkg.sourceEvents.length) {
    return {
      valid: false,
      verifiedLinks: 0,
      tamperedIndex: Math.min(pkg.strokeChain.length, pkg.sourceEvents.length),
      reasonKo: "스트로크 원본 수와 체인 링크 수가 일치하지 않습니다(누락 또는 삽입 의심).",
    };
  }

  let expectedPrev = pkg.genesisHash;
  let prevTimestamp = -Infinity;

  for (let i = 0; i < pkg.strokeChain.length; i += 1) {
    const link = pkg.strokeChain[i]!;
    const sourceEvent = pkg.sourceEvents[i]!;
    if (sourceEvent.timestampMs < prevTimestamp) {
      return { valid: false, verifiedLinks: i, tamperedIndex: i, reasonKo: `${i + 1}번째 스트로크 타임스탬프가 이전 작업 시각보다 앞섭니다.` };
    }
    const recomputedEventHash = sha256Hex(canonicalStrokePayload(sourceEvent));
    const recomputedChainHash = sha256Hex(`${expectedPrev}:${recomputedEventHash}:${i}`);
    if (link.prevHash !== expectedPrev || link.eventHash !== recomputedEventHash || link.chainHash !== recomputedChainHash) {
      return { valid: false, verifiedLinks: i, tamperedIndex: i, reasonKo: `${i + 1}번째 스트로크(${sourceEvent.strokeId}) 해시 체인 불일치 — 위변조가 감지되었습니다.` };
    }
    expectedPrev = link.chainHash;
    prevTimestamp = sourceEvent.timestampMs;
  }

  if (pkg.finalChainHash !== expectedPrev) {
    return { valid: false, verifiedLinks: pkg.strokeChain.length, tamperedIndex: Math.max(0, pkg.strokeChain.length - 1), reasonKo: "최종 서명 체인 해시가 마지막 스트로크와 일치하지 않습니다." };
  }

  return {
    valid: true,
    verifiedLinks: pkg.strokeChain.length,
    tamperedIndex: null,
    reasonKo: `전체 ${pkg.strokeChain.length}개 스트로크 SHA-256 체인 및 타임랩스 이력이 무결합니다.`,
  };
}

// ── #8 감정 인식 말풍선 · 폰트 · 효과음(SFX) 자동 식자 ──

export type ScriptEmotion = "anger" | "whisper" | "monologue" | "shock" | "romance" | "normal";
export type LetteringLocale = "ko" | "ja" | "en";
export type BubbleShape = "spiky-burst" | "dashed-cloud" | "borderless-box" | "jagged-flash" | "soft-petal" | "classic-oval";

export interface EmotionClassification {
  readonly emotion: ScriptEmotion;
  readonly labelKo: string;
  readonly confidence: number;
  readonly matchedSignals: readonly string[];
}

export interface AutoLetteringPlacement {
  readonly index: number;
  readonly speaker: string | null;
  readonly dialogue: string;
  readonly emotion: ScriptEmotion;
  readonly emotionLabelKo: string;
  readonly bubbleShape: BubbleShape;
  readonly bubbleLabelKo: string;
  readonly tailDirection: "left" | "right" | "none";
  readonly fontFamily: string;
  readonly fontSizePx: number;
  readonly sfxText: string | null;
  readonly sfxRotationDeg: number;
  readonly position: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface AutoLetteringPlan {
  readonly locale: LetteringLocale;
  readonly canvasWidth: number;
  readonly placements: readonly AutoLetteringPlacement[];
  readonly sfxCount: number;
}

interface EmotionVisualPreset {
  readonly labelKo: string;
  readonly bubbleShape: BubbleShape;
  readonly bubbleLabelKo: string;
  readonly fontByLocale: Readonly<Record<LetteringLocale, string>>;
  readonly fontSizePx: number;
  readonly sfxByLocale: Readonly<Record<LetteringLocale, string | null>>;
  readonly sfxRotationDeg: number;
}

const EMOTION_PRESETS: Readonly<Record<ScriptEmotion, EmotionVisualPreset>> = {
  anger: {
    labelKo: "분노·폭발", bubbleShape: "spiky-burst", bubbleLabelKo: "폭발 가시 말풍선", fontSizePx: 26, sfxRotationDeg: -12,
    fontByLocale: { ko: "Black Han Sans / 굵은 산돌고딕", ja: "源ノ角ゴシック Heavy", en: "CC Wild Words Bold" },
    sfxByLocale: { ko: "콰앙!", ja: "ドゴォン!", en: "BOOM!" },
  },
  whisper: {
    labelKo: "속삭임·비밀", bubbleShape: "dashed-cloud", bubbleLabelKo: "점선 소근 말풍선", fontSizePx: 14, sfxRotationDeg: 4,
    fontByLocale: { ko: "나눔명조 라이트 / KoPub 바탕", ja: "游明朝 Light", en: "Anime Ace Thin" },
    sfxByLocale: { ko: "소근…", ja: "コソッ…", en: "psst..." },
  },
  monologue: {
    labelKo: "독백·내면", bubbleShape: "borderless-box", bubbleLabelKo: "무테 사각 나레이션", fontSizePx: 17, sfxRotationDeg: 0,
    fontByLocale: { ko: "KoPub 바탕 미디엄", ja: "しっぽり明朝", en: "Merriweather Italic" },
    sfxByLocale: { ko: null, ja: null, en: null },
  },
  shock: {
    labelKo: "충격·경악", bubbleShape: "jagged-flash", bubbleLabelKo: "번개 충격 말풍선", fontSizePx: 24, sfxRotationDeg: -8,
    fontByLocale: { ko: "Gmarket Sans Bold", ja: "ラグランパンチ UB", en: "Bangers / Comic Impact" },
    sfxByLocale: { ko: "쿵—!!", ja: "ガーン!!", en: "GASP!!" },
  },
  romance: {
    labelKo: "설렘·로맨스", bubbleShape: "soft-petal", bubbleLabelKo: "꽃잎 몽글 말풍선", fontSizePx: 18, sfxRotationDeg: 7,
    fontByLocale: { ko: "마루 부리 / 나눔손글씨 붓", ja: "筑紫A丸ゴシック", en: "Cormorant Garamond" },
    sfxByLocale: { ko: "두근두근", ja: "ドキドキ", en: "ba-dump" },
  },
  normal: {
    labelKo: "일반 대화", bubbleShape: "classic-oval", bubbleLabelKo: "표준 타원 말풍선", fontSizePx: 18, sfxRotationDeg: 0,
    fontByLocale: { ko: "Pretendard Medium / 본고딕", ja: "Noto Sans JP Medium", en: "Comic Neue / Wild Words" },
    sfxByLocale: { ko: null, ja: null, en: null },
  },
};

const EMOTION_RULES: readonly { readonly emotion: Exclude<ScriptEmotion, "normal">; readonly patterns: readonly RegExp[] }[] = [
  { emotion: "monologue", patterns: [/^\s*[([（]/u, /\[독백\]|\(속마음\)/u, /생각했다|몰랐다|기억이\s*났다|그때\s*난|i thought/iu] },
  { emotion: "shock", patterns: [/\?!|!\?/u, /설마|말도\s*안\s*돼|거짓말|무슨\s*소리|경악|what\?!|no way/iu] },
  { emotion: "anger", patterns: [/!!+/u, /닥쳐|용서\s*못|감히|죽여|꺼져|미쳤어|화나|분노|shut up|how dare/iu] },
  { emotion: "whisper", patterns: [/소근|조용히|쉿|비밀이야|들릴라|작게|whisper|psst/iu, /^\.{2,}|…$/u] },
  { emotion: "romance", patterns: [/♡|♥|두근|설레|사랑해|좋아해|심장이|키스|입술|my heart|love you/iu] },
];

export const SAMPLE_WEBTOON_SCRIPT_LINES: readonly string[] = Object.freeze([
  "(속마음) 그때는 몰랐다. 이 계약이 모든 걸 바꿀 줄은.",
  "황태자: 설마... 네가 그 북부 대공의 숨겨진 후계자라고?!",
  "엘리시아: 쉿, 조용히 하세요... 문 밖에 기사들이 듣고 있어요.",
  "대공: 감히 내 앞에서 그 이름을 꺼내다니! 당장 꺼져!!",
  "황태자: 하지만 내 심장이 네 앞에서만 두근거려 ♡",
  "집사: 마차가 정문에 도착했습니다.",
]);

/** 대본 한 줄의 감정을 6종(anger/whisper/monologue/shock/romance/normal)으로 분류한다. */
export function classifyDialogueEmotion(rawLine: string): EmotionClassification {
  const line = rawLine.trim();
  let bestEmotion: ScriptEmotion = "normal";
  let bestSignals: string[] = [];

  for (const rule of EMOTION_RULES) {
    const matched: string[] = [];
    for (const pattern of rule.patterns) {
      const m = pattern.exec(line);
      if (m) matched.push(m[0]);
    }
    if (matched.length > bestSignals.length) {
      bestEmotion = rule.emotion;
      bestSignals = matched;
    }
  }

  return {
    emotion: bestEmotion,
    labelKo: EMOTION_PRESETS[bestEmotion].labelKo,
    confidence: bestEmotion === "normal" ? 0.72 : Math.min(0.98, 0.76 + bestSignals.length * 0.1),
    matchedSignals: bestSignals,
  };
}

function parseSpeakerAndDialogue(line: string): { readonly speaker: string | null; readonly dialogue: string } {
  const trimmed = line.trim();
  const colonMatch = /^([^:：(（[\]]{1,18})\s*[:：]\s*(.+)$/u.exec(trimmed);
  if (!colonMatch) return { speaker: null, dialogue: trimmed };
  return { speaker: colonMatch[1]!.trim(), dialogue: colonMatch[2]!.trim() };
}

/** 대본 여러 줄을 받아 감정별 말풍선·꼬리·한/일/영 추천 폰트·SFX 레이어 좌표를 자동 산출한다. */
export function generateAutoLetteringLayout(
  scriptLines: readonly string[],
  options?: { readonly locale?: LetteringLocale; readonly canvasWidth?: number; readonly panelStartY?: number },
): AutoLetteringPlan {
  const locale = options?.locale ?? "ko";
  const canvasWidth = options?.canvasWidth ?? 800;
  let cursorY = options?.panelStartY ?? 120;
  let sfxCount = 0;

  const speakerSide = new Map<string, "left" | "right">();
  const placements: AutoLetteringPlacement[] = [];
  const nonEmptyLines = scriptLines.map((line) => line.trim()).filter(Boolean);

  for (let i = 0; i < nonEmptyLines.length; i += 1) {
    const rawLine = nonEmptyLines[i]!;
    const { speaker, dialogue } = parseSpeakerAndDialogue(rawLine);
    const classified = classifyDialogueEmotion(rawLine);
    const preset = EMOTION_PRESETS[classified.emotion];

    let tailDirection: "left" | "right" | "none" = i % 2 === 0 ? "left" : "right";
    if (classified.emotion === "monologue") {
      tailDirection = "none";
    } else if (speaker) {
      const assigned = speakerSide.get(speaker);
      if (assigned) tailDirection = assigned;
      else {
        tailDirection = speakerSide.size % 2 === 0 ? "left" : "right";
        speakerSide.set(speaker, tailDirection);
      }
    }

    const bubbleWidth = Math.min(Math.round(canvasWidth * 0.62), Math.max(220, dialogue.length * 14));
    const bubbleHeight = Math.max(92, Math.ceil(dialogue.length / 18) * 34 + 44);
    const x = tailDirection === "none"
      ? Math.round((canvasWidth - bubbleWidth) / 2)
      : tailDirection === "left" ? 48 : Math.max(48, canvasWidth - bubbleWidth - 48);

    const sfxText = preset.sfxByLocale[locale];
    if (sfxText) sfxCount += 1;

    placements.push({
      index: i, speaker, dialogue, emotion: classified.emotion, emotionLabelKo: preset.labelKo,
      bubbleShape: preset.bubbleShape, bubbleLabelKo: preset.bubbleLabelKo, tailDirection,
      fontFamily: preset.fontByLocale[locale], fontSizePx: preset.fontSizePx,
      sfxText, sfxRotationDeg: preset.sfxRotationDeg,
      position: { x, y: cursorY, width: bubbleWidth, height: bubbleHeight },
    });
    cursorY += bubbleHeight + 76;
  }

  return { locale, canvasWidth, placements, sfxCount };
}

// ── #9 장기 연재(50화+) 떡밥 · 설정 오류 감지기 ──

export type ForeshadowSeverity = "watch" | "overdue" | "critical";
export type ContinuityConflictKind = "injury-location-mismatch" | "outfit-mismatch" | "honorific-mismatch" | "timeline-reversal";

export interface SeriesForeshadowEvent {
  readonly threadId: string;
  readonly title: string;
  readonly action: "plant" | "hint" | "resolve";
}

export interface SeriesCharacterSnapshot {
  readonly characterName: string;
  readonly injuryKey?: string;
  readonly injuryLocation?: string;
  readonly injuryHealed?: boolean;
  readonly sceneId?: string;
  readonly outfit?: string;
  readonly outfitChangedExplicitly?: boolean;
}

export interface SeriesHonorificRecord {
  readonly speaker: string;
  readonly target: string;
  readonly speechLevel: "formal" | "casual";
  readonly titleUsed: string;
  readonly relationshipShifted?: boolean;
}

export interface SeriesEpisodeRecord {
  readonly episodeNumber: number;
  readonly storyDay: number;
  readonly isFlashback?: boolean;
  readonly summary: string;
  readonly foreshadowing?: readonly SeriesForeshadowEvent[];
  readonly characters?: readonly SeriesCharacterSnapshot[];
  readonly honorifics?: readonly SeriesHonorificRecord[];
}

export interface UnresolvedForeshadowAlert {
  readonly threadId: string;
  readonly title: string;
  readonly plantedEpisode: number;
  readonly lastMentionedEpisode: number;
  readonly unresolvedSpanEpisodes: number;
  readonly severity: ForeshadowSeverity;
  readonly suggestionKo: string;
}

export interface ContinuityConflictAlert {
  readonly id: string;
  readonly kind: ContinuityConflictKind;
  readonly severity: "warning" | "error";
  readonly episodeNumber: number;
  readonly previousEpisodeNumber: number;
  readonly titleKo: string;
  readonly detailKo: string;
  readonly fixHintKo: string;
}

export interface ContinuityAuditReport {
  readonly inspectedEpisodes: number;
  readonly latestEpisode: number;
  readonly totalForeshadowThreads: number;
  readonly resolvedThreads: number;
  readonly unresolvedThreads: readonly UnresolvedForeshadowAlert[];
  readonly conflicts: readonly ContinuityConflictAlert[];
  readonly continuityHealthScore: number;
}

export const SAMPLE_LONG_SERIAL_EPISODES: readonly SeriesEpisodeRecord[] = Object.freeze([
  {
    episodeNumber: 3, storyDay: 1, summary: "프롤로그 — 붉은 회중시계의 주인 암시와 왼팔 자상 발생",
    foreshadowing: [
      { threadId: "fs-watch", title: "깨진 붉은 회중시계의 진짜 주인", action: "plant" },
      { threadId: "fs-seal", title: "지하 예배당의 봉인 문양", action: "plant" },
    ],
    characters: [{ characterName: "카엘", injuryKey: "sword-scar", injuryLocation: "왼팔", sceneId: "palace-ball", outfit: "검은 제복" }],
    honorifics: [{ speaker: "엘리시아", target: "카엘", speechLevel: "formal", titleUsed: "대공님" }],
  },
  {
    episodeNumber: 14, storyDay: 6, summary: "무도회 연속 씬에서 의상 불일치 발생 + 지하 예배당 복선 회수",
    foreshadowing: [
      { threadId: "fs-seal", title: "지하 예배당의 봉인 문양", action: "resolve" },
      { threadId: "fs-letter", title: "태워진 유언장 마지막 문장", action: "plant" },
    ],
    characters: [{ characterName: "카엘", sceneId: "palace-ball", outfit: "흰색 연회복" }],
  },
  {
    episodeNumber: 32, storyDay: 18, summary: "호칭 불일치 발생",
    honorifics: [{ speaker: "엘리시아", target: "카엘", speechLevel: "casual", titleUsed: "카엘" }],
  },
  {
    episodeNumber: 48, storyDay: 15, summary: "회상 표시 누락된 시간선 역전 + 왼팔 흉터가 오른팔로 변경",
    characters: [{ characterName: "카엘", injuryKey: "sword-scar", injuryLocation: "오른팔" }],
  },
  {
    episodeNumber: 55, storyDay: 24, summary: "시즌 1 피날레 직전 — 3화 붉은 회중시계 떡밥 52화째 미회수",
    foreshadowing: [{ threadId: "fs-crown", title: "황실 보물고 열쇠의 행방", action: "plant" }],
  },
]);

/** 50화+ 장기 연재 로그에서 미회수 복선과 4대 설정 충돌(부상·의상·호칭·시간선)을 자동 탐지한다. */
export function auditLongSeriesContinuity(
  episodes: readonly SeriesEpisodeRecord[],
  currentEpisodeOverride?: number,
): ContinuityAuditReport {
  const sorted = [...episodes].sort((a, b) => a.episodeNumber - b.episodeNumber);
  const latestEpisode = currentEpisodeOverride ?? sorted.at(-1)?.episodeNumber ?? 0;

  const threads = new Map<string, { title: string; plantedEp: number; lastMentionedEp: number; resolved: boolean }>();
  const injuries = new Map<string, { episode: number; location: string }>();
  const sceneOutfits = new Map<string, { episode: number; outfit: string }>();
  const honorificMap = new Map<string, { episode: number; speechLevel: "formal" | "casual"; titleUsed: string }>();
  const conflicts: ContinuityConflictAlert[] = [];

  let maxNonFlashbackDay = -Infinity;
  let lastNonFlashbackEp = 0;

  for (const ep of sorted) {
    if (!ep.isFlashback) {
      if (ep.storyDay < maxNonFlashbackDay) {
        conflicts.push({
          id: `timeline-${ep.episodeNumber}`, kind: "timeline-reversal", severity: "error",
          episodeNumber: ep.episodeNumber, previousEpisodeNumber: lastNonFlashbackEp,
          titleKo: "시간선 역전 오류",
          detailKo: `${ep.episodeNumber}화(Day ${ep.storyDay})가 이전 ${lastNonFlashbackEp}화(Day ${maxNonFlashbackDay})보다 과거 시점으로 표기되었습니다.`,
          fixHintKo: "회상 씬이라면 '회상(Flashback)' 태그를 켜거나 스토리 일차를 수정하세요.",
        });
      } else {
        maxNonFlashbackDay = ep.storyDay;
        lastNonFlashbackEp = ep.episodeNumber;
      }
    }

    for (const fs of ep.foreshadowing ?? []) {
      const existing = threads.get(fs.threadId);
      if (!existing) {
        threads.set(fs.threadId, { title: fs.title, plantedEp: ep.episodeNumber, lastMentionedEp: ep.episodeNumber, resolved: fs.action === "resolve" });
      } else {
        existing.lastMentionedEp = ep.episodeNumber;
        if (fs.action === "resolve") existing.resolved = true;
      }
    }

    for (const snap of ep.characters ?? []) {
      if (snap.injuryKey) {
        const key = `${snap.characterName}::${snap.injuryKey}`;
        if (snap.injuryHealed) injuries.delete(key);
        else if (snap.injuryLocation) {
          const prev = injuries.get(key);
          if (prev && prev.location !== snap.injuryLocation) {
            conflicts.push({
              id: `injury-${snap.characterName}-${snap.injuryKey}-${ep.episodeNumber}`, kind: "injury-location-mismatch", severity: "error",
              episodeNumber: ep.episodeNumber, previousEpisodeNumber: prev.episode,
              titleKo: `${snap.characterName} 부상·흉터 부위 변경`,
              detailKo: `${prev.episode}화 '${prev.location}'이던 부상(${snap.injuryKey})이 ${ep.episodeNumber}화 '${snap.injuryLocation}'(으)로 바뀌었습니다.`,
              fixHintKo: "컷 좌우 반전 실수 여부를 확인하고 캐릭터 시트 기준으로 부위를 통일하세요.",
            });
          } else if (!prev) injuries.set(key, { episode: ep.episodeNumber, location: snap.injuryLocation });
        }
      }

      if (snap.sceneId && snap.outfit) {
        const sceneKey = `${snap.characterName}::${snap.sceneId}`;
        const prevOutfit = sceneOutfits.get(sceneKey);
        if (prevOutfit && prevOutfit.outfit !== snap.outfit && !snap.outfitChangedExplicitly) {
          conflicts.push({
            id: `outfit-${snap.characterName}-${snap.sceneId}-${ep.episodeNumber}`, kind: "outfit-mismatch", severity: "warning",
            episodeNumber: ep.episodeNumber, previousEpisodeNumber: prevOutfit.episode,
            titleKo: `${snap.characterName} 동일 씬 의상 불일치`,
            detailKo: `같은 장면(${snap.sceneId})에서 ${prevOutfit.episode}화 '${prevOutfit.outfit}'이 ${ep.episodeNumber}화 '${snap.outfit}'(으)로 환복 설명 없이 변경되었습니다.`,
            fixHintKo: "환복 컷을 넣거나 의상 레이어 색상을 이전 화와 맞추세요.",
          });
        } else sceneOutfits.set(sceneKey, { episode: ep.episodeNumber, outfit: snap.outfit });
      }
    }

    for (const rel of ep.honorifics ?? []) {
      const relKey = `${rel.speaker}->${rel.target}`;
      const prevRel = honorificMap.get(relKey);
      if (prevRel && !rel.relationshipShifted && (prevRel.speechLevel !== rel.speechLevel || prevRel.titleUsed !== rel.titleUsed)) {
        conflicts.push({
          id: `honorific-${rel.speaker}-${rel.target}-${ep.episodeNumber}`, kind: "honorific-mismatch", severity: "warning",
          episodeNumber: ep.episodeNumber, previousEpisodeNumber: prevRel.episode,
          titleKo: `${rel.speaker}→${rel.target} 호칭·말투 불일치`,
          detailKo: `${prevRel.episode}화 '${prevRel.titleUsed}(${prevRel.speechLevel === "formal" ? "존댓말" : "반말"})'에서 ${ep.episodeNumber}화 '${rel.titleUsed}(${rel.speechLevel === "formal" ? "존댓말" : "반말"})'(으)로 관계 전환 없이 변경되었습니다.`,
          fixHintKo: "대사 식자에서 호칭을 통일하거나 관계 변화 이벤트로 등록하세요.",
        });
      } else {
        honorificMap.set(relKey, { episode: ep.episodeNumber, speechLevel: rel.speechLevel, titleUsed: rel.titleUsed });
      }
    }
  }

  const unresolvedThreads: UnresolvedForeshadowAlert[] = [];
  let resolvedThreads = 0;

  for (const [threadId, state] of threads.entries()) {
    if (state.resolved) { resolvedThreads += 1; continue; }
    const span = Math.max(0, latestEpisode - state.plantedEp);
    const severity: ForeshadowSeverity = span >= 50 ? "critical" : span >= 25 ? "overdue" : "watch";
    const suggestionKo = severity === "critical"
      ? `50화 이상(${span}화) 미회수 핵심 떡밥입니다. 다음 아크 클라이맥스에 회수 컷을 배치하세요.`
      : severity === "overdue"
        ? `${span}화째 미회수 상태입니다. 독자 망각 방지를 위해 중간 힌트 컷을 권장합니다.`
        : `최근(${state.plantedEp}화) 깔린 복선입니다. 회수 목표 화차를 메모해 두세요.`;
    unresolvedThreads.push({ threadId, title: state.title, plantedEpisode: state.plantedEp, lastMentionedEpisode: state.lastMentionedEp, unresolvedSpanEpisodes: span, severity, suggestionKo });
  }
  unresolvedThreads.sort((a, b) => b.unresolvedSpanEpisodes - a.unresolvedSpanEpisodes);

  const errorCount = conflicts.filter((c) => c.severity === "error").length;
  const warningCount = conflicts.filter((c) => c.severity === "warning").length;
  const criticalThreads = unresolvedThreads.filter((t) => t.severity === "critical").length;
  const continuityHealthScore = Math.max(0, Math.min(100, 100 - errorCount * 18 - warningCount * 9 - criticalThreads * 10));

  return {
    inspectedEpisodes: sorted.length, latestEpisode, totalForeshadowThreads: threads.size,
    resolvedThreads, unresolvedThreads, conflicts, continuityHealthScore,
  };
}

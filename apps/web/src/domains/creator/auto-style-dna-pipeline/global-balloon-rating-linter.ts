/**
 * 다국어(KO/EN/JA/ZH/ES) 말풍선 자동 줄바꿈·폰트 크기 최적화 조판기 +
 * 4개 권역(KR·JP·US·EU) 등급 심의 사전 린터 + WebCrypto AES-GCM 암호화 샌드박스 컨테이너 통합 모듈.
 */

export {
  detectCrossBrowserCryptoCapabilities,
  InMemorySandboxedBackend,
  SandboxedVfsContainer,
  type CrossBrowserCryptoCapabilities,
  type EncryptedVfsEntrySummary,
  type SandboxedStorageBackend,
  type SandboxedVfsStats,
} from "./sandboxed-vfs-crypto";

export type BalloonLanguage = "ko" | "en" | "ja" | "zh" | "es";
export type BalloonGeometryShape = "ellipse" | "rounded-rect" | "shout-burst" | "thought-cloud";

export interface BalloonTypesetSpec {
  readonly language: BalloonLanguage;
  readonly text: string;
  readonly shape: BalloonGeometryShape;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly paddingPx?: number;
  readonly minFontSizePx?: number;
  readonly maxFontSizePx?: number;
  readonly lineHeightRatio?: number;
}

export interface TypesetBalloonLine {
  readonly lineIndex: number;
  readonly text: string;
  readonly estimatedWidthPx: number;
  readonly availableWidthPx: number;
  readonly utilizationRatio: number;
}

export interface BalloonTypesetResult {
  readonly language: BalloonLanguage;
  readonly shape: BalloonGeometryShape;
  readonly optimalFontSizePx: number;
  readonly lineHeightPx: number;
  readonly lines: readonly TypesetBalloonLine[];
  readonly totalTextHeightPx: number;
  readonly maxLineUtilization: number;
  readonly areaFillRatio: number;
  readonly overflow: boolean;
  readonly recommendedBalloonScale: number;
  readonly kinsokuViolations: number;
  readonly wordBreakViolations: number;
}

export type RatingRegionCode = "KR" | "JP" | "US" | "EU";
export type RatingTargetTier = "all" | "12+" | "15+" | "18+";
export type SubstanceDepictionKind = "none" | "smoking" | "alcohol-adult" | "alcohol-minor" | "narcotics";

export interface RatingDialogueSample {
  readonly language: BalloonLanguage;
  readonly text: string;
}

export interface EpisodeRatingAuditInput {
  readonly episodeTitle: string;
  readonly targetTier: RatingTargetTier;
  readonly dialogues: readonly RatingDialogueSample[];
  readonly bloodLevel: 0 | 1 | 2 | 3;
  readonly weaponProminence: 0 | 1 | 2 | 3;
  readonly nudityExposure: 0 | 1 | 2 | 3;
  readonly substanceUse: SubstanceDepictionKind;
  readonly gamblingDepiction: boolean;
  readonly selfHarmTheme: boolean;
  readonly flashingStrobeHz?: number;
}

export interface RegionRatingFinding {
  readonly ruleId: string;
  readonly category: "violence" | "language" | "nudity" | "substance" | "gambling" | "self-harm" | "photosensitivity";
  readonly severity: "info" | "warn" | "block";
  readonly messageKo: string;
  readonly messageEn: string;
  readonly remediationKo: string;
  readonly remediationEn: string;
}

export interface RegionRatingAssessment {
  readonly region: RatingRegionCode;
  readonly authorityLabelKo: string;
  readonly authorityLabelEn: string;
  readonly targetTier: RatingTargetTier;
  readonly computedTier: RatingTargetTier;
  readonly computedLabel: string;
  readonly compliant: boolean;
  readonly riskLevel: "pass" | "warning" | "blocked";
  readonly findings: readonly RegionRatingFinding[];
}

export interface GlobalRatingLintReport {
  readonly episodeTitle: string;
  readonly targetTier: RatingTargetTier;
  readonly allRegionsCompliant: boolean;
  readonly strictestRegion: RatingRegionCode;
  readonly strictestTier: RatingTargetTier;
  readonly assessments: readonly RegionRatingAssessment[];
}

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const KINSOKU_NO_LINE_START = new Set([
  "。", "、", "，", "．", "！", "？", "：", "；", "」", "』", "）", "】", "》", "〉", "ー", "…", "っ", "ッ", "ゃ", "ゅ", "ょ", "ャ", "ュ", "ョ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ",
]);
const KINSOKU_NO_LINE_END = new Set(["「", "『", "（", "【", "《", "〈", "¿", "¡"]);

function estimateCharWidthEm(ch: string, lang: BalloonLanguage): number {
  if (ch === " ") return lang === "ja" || lang === "zh" ? 0.36 : 0.28;
  const code = ch.charCodeAt(0);
  if (
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x3000 && code <= 0x303f)
  ) {
    return lang === "ko" ? 0.96 : 1.0;
  }
  if ("ilIjtf1.,;:'!|¡".includes(ch)) return 0.36;
  if ("mwMW@%#&".includes(ch)) return 0.8;
  return code >= 65 && code <= 90 ? 0.68 : 0.56;
}

function measureTextWidthPx(text: string, fontSizePx: number, lang: BalloonLanguage): number {
  let widthEm = 0;
  for (const ch of text) widthEm += estimateCharWidthEm(ch, lang);
  return widthEm * fontSizePx;
}

function computeLineChordWidth(shape: BalloonGeometryShape, innerWidth: number, lineIdx: number, totalLines: number): number {
  if (shape === "rounded-rect") return innerWidth;
  const factor = shape === "shout-burst" ? 0.82 : shape === "thought-cloud" ? 0.88 : 0.92;
  if (totalLines <= 1) return innerWidth * factor;
  const normalizedY = ((lineIdx + 0.5) / totalLines) * 2 - 1;
  return innerWidth * factor * Math.sqrt(Math.max(0.24, 1 - Math.pow(normalizedY * 0.86, 2)));
}

function wrapLinesAtFontSize(
  text: string,
  lang: BalloonLanguage,
  shape: BalloonGeometryShape,
  innerWidth: number,
  fontSizePx: number,
): { readonly lines: readonly TypesetBalloonLine[]; readonly kinsokuViolations: number; readonly wordBreakViolations: number } {
  const isCjkCharWrap = lang === "ja" || lang === "zh";
  const cleaned = text.replace(/\s+/g, " ").trim();
  const tokens = !cleaned ? [] : isCjkCharWrap ? Array.from(cleaned) : cleaned.split(" ").filter((tok) => tok.length > 0);
  if (tokens.length === 0) return { lines: [], kinsokuViolations: 0, wordBreakViolations: 0 };

  const avgChord = shape === "rounded-rect" ? innerWidth : innerWidth * 0.84;
  let estimatedLineCount = Math.max(1, Math.ceil(measureTextWidthPx(cleaned, fontSizePx, lang) / Math.max(24, avgChord)));
  let rawLines: string[] = [];
  let wordBreakViolations = 0;

  for (let pass = 0; pass < 2; pass += 1) {
    rawLines = [];
    wordBreakViolations = 0;
    let current = "";
    let lineIdx = 0;
    const capFor = (idx: number) =>
      Math.max(fontSizePx * 1.4, computeLineChordWidth(shape, innerWidth, idx, Math.max(estimatedLineCount, idx + 1)));

    for (const token of tokens) {
      const cap = capFor(lineIdx);
      const sep = current.length === 0 || isCjkCharWrap ? "" : " ";
      const candidate = `${current}${sep}${token}`;
      if (measureTextWidthPx(candidate, fontSizePx, lang) <= cap) {
        current = candidate;
        continue;
      }

      if (current.length > 0) {
        if (isCjkCharWrap && KINSOKU_NO_LINE_START.has(token)) {
          rawLines.push(`${current}${token}`);
          current = "";
          lineIdx += 1;
          continue;
        }
        const lastChar = current[current.length - 1] ?? "";
        if (KINSOKU_NO_LINE_END.has(lastChar) && current.length > 1) {
          rawLines.push(current.slice(0, -1).trimEnd());
          current = `${lastChar}${isCjkCharWrap ? "" : " "}${token}`;
          lineIdx += 1;
          continue;
        }
        rawLines.push(current);
        lineIdx += 1;
      }

      const nextCap = capFor(lineIdx);
      if (measureTextWidthPx(token, fontSizePx, lang) <= nextCap || isCjkCharWrap) {
        current = token;
      } else {
        let chunk = "";
        for (const ch of token) {
          if (chunk.length > 0 && measureTextWidthPx(`${chunk}${ch}`, fontSizePx, lang) > nextCap) {
            rawLines.push(lang === "en" || lang === "es" ? `${chunk}-` : chunk);
            wordBreakViolations += 1;
            chunk = ch;
            lineIdx += 1;
          } else chunk += ch;
        }
        current = chunk;
      }
    }
    if (current.length > 0) rawLines.push(current);
    estimatedLineCount = Math.max(1, rawLines.length);
  }

  let kinsokuViolations = 0;
  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i] ?? "";
    if (i > 0 && line.length > 0 && KINSOKU_NO_LINE_START.has(line[0] ?? "")) kinsokuViolations += 1;
    if (i < rawLines.length - 1 && line.length > 0 && KINSOKU_NO_LINE_END.has(line[line.length - 1] ?? "")) kinsokuViolations += 1;
  }

  const total = rawLines.length;
  return {
    kinsokuViolations,
    wordBreakViolations,
    lines: rawLines.map((line, idx) => {
      const avail = Math.max(1, computeLineChordWidth(shape, innerWidth, idx, total));
      const est = measureTextWidthPx(line, fontSizePx, lang);
      return { lineIndex: idx, text: line, estimatedWidthPx: round3(est), availableWidthPx: round3(avail), utilizationRatio: round3(est / avail) };
    }),
  };
}

/** 다국어(KO/EN/JA/ZH/ES) 번역 대사를 말풍선 형상에 맞춰 자동 줄바꿈·최적 폰트 크기로 조판한다. */
export function typesetMultilingualBalloon(spec: BalloonTypesetSpec): BalloonTypesetResult {
  const padding = spec.paddingPx ?? 16;
  const innerWidth = Math.max(48, spec.widthPx - padding * 2);
  const innerHeight = Math.max(36, spec.heightPx - padding * 2);
  const minFont = clamp(spec.minFontSizePx ?? 11, 8, 24);
  const maxFont = clamp(spec.maxFontSizePx ?? 24, minFont, 40);
  const lineHeightRatio = clamp(
    spec.lineHeightRatio ?? (spec.language === "ko" || spec.language === "ja" || spec.language === "zh" ? 1.32 : 1.24),
    1.1,
    1.7,
  );

  const evalAt = (fontSizePx: number) => {
    const layout = wrapLinesAtFontSize(spec.text, spec.language, spec.shape, innerWidth, fontSizePx);
    const lineHeightPx = fontSizePx * lineHeightRatio;
    const totalHeight = layout.lines.length * lineHeightPx;
    const maxUtil = layout.lines.reduce((m, l) => Math.max(m, l.utilizationRatio), 0);
    return { layout, lineHeightPx, totalHeight, maxUtil, fits: totalHeight <= innerHeight + 0.5 && maxUtil <= 1.03 };
  };

  let lo = Math.round(minFont * 2);
  let hi = Math.round(maxFont * 2);
  let bestStep: number | null = null;
  let bestEval: ReturnType<typeof evalAt> | null = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const res = evalAt(mid / 2);
    if (res.fits) {
      bestStep = mid;
      bestEval = res;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const chosenFont = bestStep !== null ? bestStep / 2 : minFont;
  const finalEval = bestEval ?? evalAt(minFont);
  const overflow = !finalEval.fits;
  const textArea = finalEval.layout.lines.reduce((acc, l) => acc + l.estimatedWidthPx * finalEval.lineHeightPx, 0);
  const balloonArea =
    spec.shape === "rounded-rect" ? innerWidth * innerHeight : Math.PI * (innerWidth * 0.5) * (innerHeight * 0.5);

  return {
    language: spec.language,
    shape: spec.shape,
    optimalFontSizePx: chosenFont,
    lineHeightPx: round3(finalEval.lineHeightPx),
    lines: finalEval.layout.lines,
    totalTextHeightPx: round3(finalEval.totalHeight),
    maxLineUtilization: round3(finalEval.maxUtil),
    areaFillRatio: round3(clamp(textArea / Math.max(1, balloonArea), 0, 2)),
    overflow,
    recommendedBalloonScale: overflow
      ? round3(Math.max(1.08, Math.max(finalEval.totalHeight / Math.max(1, innerHeight), finalEval.maxUtil) * 1.06))
      : 1,
    kinsokuViolations: finalEval.layout.kinsokuViolations,
    wordBreakViolations: finalEval.layout.wordBreakViolations,
  };
}

export function typesetBalloonAcrossLanguages(
  translations: Readonly<Record<BalloonLanguage, string>>,
  geometry: Omit<BalloonTypesetSpec, "language" | "text">,
): readonly BalloonTypesetResult[] {
  return (["ko", "en", "ja", "zh", "es"] as const).map((language) =>
    typesetMultilingualBalloon({ ...geometry, language, text: translations[language] }),
  );
}

const TIER_RANK: Readonly<Record<RatingTargetTier, number>> = { all: 0, "12+": 1, "15+": 2, "18+": 3 };
const RANK_TO_TIER: readonly RatingTargetTier[] = ["all", "12+", "15+", "18+"];

const STRONG_PROFANITY: readonly RegExp[] = [
  /씨발|시발|개새끼|병신|좆/,
  /\b(fuck|motherfucker|shithead|bastard|bitch)\b/i,
  /くそったれ|死ね|ぶっ殺/,
  /操你|他妈的|混蛋/,
  /\b(mierda|cabrón|joder|puta)\b/i,
];
const MILD_PROFANITY: readonly RegExp[] = [
  /젠장|빌어먹을|닥쳐|꺼져/,
  /\b(damn|hell|shut up|idiot|crap)\b/i,
  /ちくしょう|黙れ|バカ野郎/,
  /可恶|闭嘴/,
  /\b(maldición|cállate|idiota)\b/i,
];

function detectProfanityLevel(dialogues: readonly RatingDialogueSample[]): 0 | 1 | 2 {
  let level: 0 | 1 | 2 = 0;
  for (const d of dialogues) {
    if (STRONG_PROFANITY.some((re) => re.test(d.text))) return 2;
    if (MILD_PROFANITY.some((re) => re.test(d.text))) level = 1;
  }
  return level;
}

function mapRegionRatingLabel(region: RatingRegionCode, tier: RatingTargetTier): string {
  if (region === "KR") return tier === "all" ? "전체 이용가" : tier === "12+" ? "12세 이용가" : tier === "15+" ? "15세 이용가" : "18세 이용가(성인)";
  if (region === "JP") return tier === "all" ? "全年齢 (All Ages)" : tier === "12+" ? "12+ (中学生以上)" : tier === "15+" ? "15+ (高校生以上)" : "R18 (成人向け)";
  if (region === "US") return tier === "all" ? "Everyone (E)" : tier === "12+" ? "Teen (13+)" : tier === "15+" ? "Young Adult (16+)" : "Mature (18+)";
  return tier === "all" ? "PEGI 3 / 7" : tier === "12+" ? "PEGI 12" : tier === "15+" ? "PEGI 16" : "PEGI 18";
}

/** 4개 권역(KR·JP·US·EU) 웹툰·디지털 출판 등급 심의 사전 린터. */
export function lintGlobalContentRating(input: EpisodeRatingAuditInput): GlobalRatingLintReport {
  const profanityLevel = detectProfanityLevel(input.dialogues);
  const strobeHz = input.flashingStrobeHz ?? 0;
  const targetRank = TIER_RANK[input.targetTier];
  const regions: readonly { readonly code: RatingRegionCode; readonly ko: string; readonly en: string }[] = [
    { code: "KR", ko: "한국 웹툰 자율심의·방심위 기준", en: "Korea Webtoon Self-Regulation" },
    { code: "JP", ko: "일본 만화·앱스토어 심의 기준", en: "Japan Manga & Platform Guidelines" },
    { code: "US", ko: "미국 Webtoon US / MPA 등급 기준", en: "US Webtoon / MPA Rating Rubric" },
    { code: "EU", ko: "유럽 PEGI · DSA 디지털 등급 기준", en: "EU PEGI / DSA Digital Standard" },
  ];

  const assessments: RegionRatingAssessment[] = regions.map(({ code, ko, en }) => {
    let requiredRank = 0;
    const findings: RegionRatingFinding[] = [];
    const raise = (r: number) => {
      if (r > requiredRank) requiredRank = r;
    };

    if (input.bloodLevel === 1 || input.weaponProminence >= 2) raise(1);
    if (input.bloodLevel === 2) {
      raise(2);
      if (code === "KR" || code === "JP") {
        findings.push({
          ruleId: `${code}-VIOLENCE-BLOOD-L2`,
          category: "violence",
          severity: targetRank < 2 ? "block" : "warn",
          messageKo: `${code} 기준 선명한 혈흔 묘사는 15+ 대상이며 저연령 배포 시 감색 보정이 필요합니다.`,
          messageEn: `${code} classifies prominent blood as 15+; desaturation is needed for lower tiers.`,
          remediationKo: "선홍색 혈흔 채도를 낮추거나 실루엣·흑백 톤으로 완화하세요.",
          remediationEn: "Desaturate bright crimson blood or shift to monochrome silhouette.",
        });
      }
    }
    if (input.bloodLevel >= 3) {
      raise(3);
      findings.push({
        ruleId: `${code}-VIOLENCE-GORE`,
        category: "violence",
        severity: targetRank < 3 ? "block" : "warn",
        messageKo: `${code} 권역에서 과도한 유혈·고어 묘사는 18+ 성인 등급으로 제한됩니다.`,
        messageEn: `${code} restricts graphic gore depiction to 18+/Mature.`,
        remediationKo: "직접 타격 컷을 암시 구도로 교체하거나 18+ 등급으로 상향하세요.",
        remediationEn: "Replace direct graphic impact with implied framing or raise tier to 18+.",
      });
    }

    if (profanityLevel === 1) {
      raise(1);
      if (targetRank === 0) {
        findings.push({
          ruleId: `${code}-LANG-MILD`,
          category: "language",
          severity: "warn",
          messageKo: "전체 이용가 목표 대비 거친 표현이 감지되었습니다.",
          messageEn: "Mild harsh language detected against All-Ages target.",
          remediationKo: "완곡 표현으로 순화하면 전체 이용가를 유지할 수 있습니다.",
          remediationEn: "Soften exclamations to retain All-Ages clearance.",
        });
      }
    } else if (profanityLevel === 2) {
      const req = code === "US" ? 3 : 2;
      raise(req);
      findings.push({
        ruleId: `${code}-LANG-EXPLICIT`,
        category: "language",
        severity: targetRank < req ? "block" : "warn",
        messageKo: code === "US" ? "US 기준 강한 비속어는 Mature(18+) 또는 마스킹 처리가 필수입니다." : `${code} 기준 강한 욕설은 15+ 이상 또는 마스킹이 필요합니다.`,
        messageEn: code === "US" ? "US guidelines require Mature (18+) or explicit profanity masking." : `${code} requires 15+ or masking for explicit profanity.`,
        remediationKo: "강욕설을 기호 마스킹(`@#$!`)하거나 순화 대사로 교체하세요.",
        remediationEn: "Mask explicit terms with comic symbols or milder substitutes.",
      });
    }

    if (input.nudityExposure === 1) raise(1);
    if (input.nudityExposure === 2) {
      raise(2);
      if (targetRank < 2) {
        findings.push({
          ruleId: `${code}-NUDITY-L2`,
          category: "nudity",
          severity: "block",
          messageKo: "중간 수위 노출 묘사는 15+ 이상 등급이 필요합니다.",
          messageEn: "Moderate suggestive exposure requires 15+ tier.",
          remediationKo: "의상 커버리지·프레임 크롭을 조정하세요.",
          remediationEn: "Adjust outfit coverage or crop above shoulders.",
        });
      }
    }
    if (input.nudityExposure >= 3) {
      raise(3);
      findings.push({
        ruleId: `${code}-NUDITY-EXPLICIT`,
        category: "nudity",
        severity: targetRank < 3 ? "block" : "warn",
        messageKo: `${code} 기준 노골적 노출은 18+ 전용이며 앱스토어 심의 반려 위험이 높습니다.`,
        messageEn: `${code} restricts explicit nudity to 18+ with mobile store rejection risk.`,
        remediationKo: "글로벌 배포판용 광원·실루엣 가림 레이어를 활성화하세요.",
        remediationEn: "Enable global-edition light/silhouette modesty layer.",
      });
    }

    if (input.substanceUse === "smoking" || input.substanceUse === "alcohol-adult") {
      const req = code === "KR" || code === "EU" ? 2 : 1;
      raise(req);
      if (req === 2 && targetRank < 2) {
        findings.push({
          ruleId: `${code}-SUBSTANCE-ADULT`,
          category: "substance",
          severity: "block",
          messageKo: `${code} 기준 흡연·성인 음주 직접 묘사는 15+(PEGI 16) 이상 권장 대상입니다.`,
          messageEn: `${code} elevates explicit smoking/alcohol depiction to 15+/PEGI 16.`,
          remediationKo: "흡연/음주 소품을 제거하거나 15+ 등급으로 조정하세요.",
          remediationEn: "Remove smoking/alcohol prop or set target tier to 15+.",
        });
      }
    } else if (input.substanceUse === "alcohol-minor" || input.substanceUse === "narcotics") {
      raise(3);
      findings.push({
        ruleId: `${code}-SUBSTANCE-STRICT`,
        category: "substance",
        severity: targetRank < 3 ? "block" : "warn",
        messageKo: "미성년 음주·불법 약물 묘사는 전 권역 18+ 제한 대상입니다.",
        messageEn: "Underage alcohol or narcotics depiction triggers 18+ restriction globally.",
        remediationKo: "해당 연출을 삭제하거나 성인 전용 회차로 분리하세요.",
        remediationEn: "Remove underage substance scene or isolate to 18+ release.",
      });
    }

    if (input.gamblingDepiction) {
      const req = code === "EU" ? 3 : 2;
      raise(req);
      findings.push({
        ruleId: `${code}-GAMBLING`,
        category: "gambling",
        severity: targetRank < req ? "block" : "warn",
        messageKo: code === "EU" ? "EU PEGI 규정상 도박·베팅 모사 연출은 PEGI 18로 상향됩니다." : `${code} 기준 도박·사행성 묘사는 15+ 이상 등급이 필요합니다.`,
        messageEn: code === "EU" ? "EU PEGI classifies simulated gambling scenes as PEGI 18." : `${code} requires 15+ tier for gambling depiction.`,
        remediationKo: "현금 베팅/카지노 UI 요소를 제거하거나 EU 등급을 PEGI 18로 지정하세요.",
        remediationEn: "Remove simulated wagering elements or declare PEGI 18 in EU.",
      });
    }

    if (input.selfHarmTheme) {
      raise(2);
      findings.push({
        ruleId: `${code}-SELFHARM-BANNER`,
        category: "self-harm",
        severity: targetRank < 2 ? "block" : "warn",
        messageKo: `${code} 플랫폼은 자해·우울 테마 회차 최상단에 도움 안내 배너를 요구합니다.`,
        messageEn: `${code} requires a helpline content-warning banner above Cut 1 for self-harm themes.`,
        remediationKo: "권역별 상담 안내·트리거 경고 카드를 회차 도입부에 부착하세요.",
        remediationEn: "Attach localized helpline & trigger warning header before Cut 1.",
      });
    }

    if (strobeHz > 3) {
      findings.push({
        ruleId: `${code}-STROBE-3HZ`,
        category: "photosensitivity",
        severity: code === "JP" || code === "EU" ? "block" : "warn",
        messageKo: `초당 ${strobeHz}Hz 점멸 연출 감지 (JP/EU 광과민성 안전 상한 3Hz 초과).`,
        messageEn: `${strobeHz}Hz flashing exceeds 3Hz photosensitivity safety limit (${code}).`,
        remediationKo: "점멸 주기를 2Hz 이하로 낮추고 고대비 적색 플래시를 제거하세요.",
        remediationEn: "Lower flash rate to ≤ 2Hz and remove saturated red strobes.",
      });
    }

    const computedTier = RANK_TO_TIER[clamp(requiredRank, 0, 3)] ?? "all";
    const compliant = !findings.some((f) => f.severity === "block") && requiredRank <= targetRank;
    return {
      region: code,
      authorityLabelKo: ko,
      authorityLabelEn: en,
      targetTier: input.targetTier,
      computedTier,
      computedLabel: mapRegionRatingLabel(code, computedTier),
      compliant,
      riskLevel: !compliant ? "blocked" : findings.length > 0 ? "warning" : "pass",
      findings,
    };
  });

  let strictest = assessments[0];
  for (const a of assessments) {
    if (!strictest || TIER_RANK[a.computedTier] > TIER_RANK[strictest.computedTier]) strictest = a;
  }

  return {
    episodeTitle: input.episodeTitle,
    targetTier: input.targetTier,
    allRegionsCompliant: assessments.every((a) => a.compliant),
    strictestRegion: strictest?.region ?? "KR",
    strictestTier: strictest?.computedTier ?? "all",
    assessments,
  };
}

export const DEMO_MULTILINGUAL_DIALOGUES: Readonly<Record<BalloonLanguage, string>> = {
  ko: "지금 이 문을 열면, 우리가 숨겨온 모든 진실이 한꺼번에 드러나게 될 거야.",
  en: "If we open this door right now, every secret we tried to hide will come rushing out.",
  ja: "今この扉を開けたら、私たちが隠してきた真実がすべて明らかになってしまうよ。",
  zh: "如果现在打开这扇门，我们一直隐藏的所有真相就会全部暴露出来。",
  es: "¿Si abrimos esta puerta ahora mismo, toda la verdad que ocultamos saldrá a la luz!",
};

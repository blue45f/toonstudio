/**
 * 차세대 드로잉 프런티어 연출·교정·심볼 엔진 (Wave 26A):
 * 1) 카메라 화각(24/35/50/85mm) · 3분할 · 황금나선 · 아이레벨 오버레이 계산기 (`computeCameraCompositionOverlay`)
 * 2) 말풍선 실시간 맞춤법 · 설정집 고유명사 · 글로벌 4대 플랫폼 심의 린터 (`lintDialogueComplianceAndGlossary`)
 * 3) 스마트 심볼 뱅크 — 소품/배경/SFX 마스터 등록 · 다중 컷 일괄 전파 · 언링크 보호 (`SmartPropSymbolBank`)
 */

export type CameraFocalLengthMm = 24 | 35 | 50 | 85;
export type GoldenSpiralCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type CompliancePlatformId = "naver" | "kakao" | "japan" | "north-america";
export type DialogueLintCategory = "glossary-typo" | "spelling-typo" | "platform-compliance";
export type DialogueLintSeverity = "error" | "warning" | "info";
export type SmartSymbolCategory = "prop" | "background" | "sfx";

export interface OverlayPoint2D { readonly x: number; readonly y: number; }
export interface OverlayLineSegment { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; }
export interface OverlayRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }

export interface CameraCompositionInput {
  readonly canvasWidthPx: number; readonly canvasHeightPx: number; readonly focalLengthMm: CameraFocalLengthMm;
  readonly eyeLevelRatio01?: number; readonly spiralCorner?: GoldenSpiralCorner; readonly sensorWidthMm?: number;
}
export interface CameraCompositionOverlay {
  readonly canvasWidthPx: number; readonly canvasHeightPx: number; readonly focalLengthMm: CameraFocalLengthMm;
  readonly labelKo: string; readonly labelEn: string; readonly framingAdviceKo: string; readonly framingAdviceEn: string;
  readonly horizontalFovDeg: number; readonly verticalFovDeg: number; readonly diagonalFovDeg: number;
  readonly viewingDistancePx: number; readonly compressionIndex: number; readonly perspectiveStrength01: number;
  readonly cropRelativeTo24mm: OverlayRect;
  readonly ruleOfThirds: {
    readonly verticalLines: readonly [OverlayLineSegment, OverlayLineSegment];
    readonly horizontalLines: readonly [OverlayLineSegment, OverlayLineSegment];
    readonly powerPoints: readonly [OverlayPoint2D, OverlayPoint2D, OverlayPoint2D, OverlayPoint2D];
  };
  readonly goldenSpiral: {
    readonly corner: GoldenSpiralCorner; readonly phi: number;
    readonly subdivisions: readonly OverlayRect[]; readonly curvePoints: readonly OverlayPoint2D[]; readonly focalEye: OverlayPoint2D;
  };
  readonly eyeLevel: {
    readonly ratio01: number; readonly yPx: number; readonly cameraPitchDeg: number;
    readonly horizonLine: OverlayLineSegment; readonly leftVanishingPoint: OverlayPoint2D;
    readonly rightVanishingPoint: OverlayPoint2D; readonly vanishingSpanPx: number;
  };
}

export interface GlossaryEntry {
  readonly canonical: string; readonly aliases?: readonly string[]; readonly knownMisspellings?: readonly string[];
  readonly roleKo?: string; readonly roleEn?: string;
}
export interface DialogueLintIssue {
  readonly id: string; readonly category: DialogueLintCategory; readonly severity: DialogueLintSeverity;
  readonly platformScope: CompliancePlatformId | "all"; readonly startOffset: number; readonly endOffset: number;
  readonly matchedText: string; readonly suggestions: readonly string[]; readonly messageKo: string; readonly messageEn: string;
}
export interface DialogueLintInput {
  readonly text: string; readonly glossary?: readonly GlossaryEntry[]; readonly targetPlatforms?: readonly CompliancePlatformId[];
}
export interface DialogueLintReport {
  readonly text: string; readonly issues: readonly DialogueLintIssue[];
  readonly countsByCategory: Record<DialogueLintCategory, number>;
  readonly countsByPlatform: Record<CompliancePlatformId, number>;
  readonly complianceScore0To100: number;
  readonly readyForPlatforms: Record<CompliancePlatformId, boolean>;
}

export interface SmartSymbolGeometry {
  readonly widthPx: number; readonly heightPx: number; readonly strokeWeightPx: number;
  readonly fillToneToken: string; readonly labelText?: string; readonly vectorPathHint: string;
}
export interface SmartSymbolMaster {
  readonly id: string; readonly nameKo: string; readonly nameEn: string;
  readonly category: SmartSymbolCategory; readonly version: number; readonly tags: readonly string[];
  readonly geometry: SmartSymbolGeometry;
}
export interface SmartSymbolInstance {
  readonly instanceId: string; readonly masterId: string; readonly cutId: string;
  readonly cutLabelKo: string; readonly cutLabelEn: string; readonly x: number; readonly y: number;
  readonly scale: number; readonly rotationDeg: number; readonly linked: boolean; readonly syncedVersion: number;
  readonly resolvedGeometry: SmartSymbolGeometry; readonly localOverrides: Partial<SmartSymbolGeometry>;
}
export interface RegisterSymbolMasterInput {
  readonly id: string; readonly nameKo: string; readonly nameEn: string;
  readonly category: SmartSymbolCategory; readonly tags?: readonly string[]; readonly geometry: SmartSymbolGeometry;
}
export interface PlaceSymbolInstanceInput {
  readonly instanceId: string; readonly masterId: string; readonly cutId: string;
  readonly cutLabelKo: string; readonly cutLabelEn: string; readonly x: number; readonly y: number;
  readonly scale?: number; readonly rotationDeg?: number; readonly localOverrides?: Partial<SmartSymbolGeometry>;
}
export interface MasterPropagationOptions {
  readonly targetCutIds?: readonly string[]; readonly targetInstanceIds?: readonly string[];
  readonly preserveLocalOverrides?: boolean;
}
export interface SymbolPropagationReport {
  readonly masterId: string; readonly newVersion: number;
  readonly updatedInstanceIds: readonly string[]; readonly skippedUnlinkedInstanceIds: readonly string[];
  readonly skippedUnselectedInstanceIds: readonly string[]; readonly affectedCutIds: readonly string[];
}
export interface SmartPropBankSummary {
  readonly masterCount: number; readonly instanceCount: number; readonly linkedCount: number; readonly unlinkedCount: number;
}

export const CAMERA_FOCAL_LENGTHS: readonly CameraFocalLengthMm[] = [24, 35, 50, 85];
export const ALL_COMPLIANCE_PLATFORMS: readonly CompliancePlatformId[] = ["naver", "kakao", "japan", "north-america"];

const PHI = (1 + Math.sqrt(5)) / 2;
const clampNum = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const FOCAL_META: Record<CameraFocalLengthMm, { readonly ko: string; readonly en: string; readonly adviceKo: string; readonly adviceEn: string }> = {
  24: { ko: "24mm 광각 · 역동적 액션", en: "24mm Wide · Dynamic Action", adviceKo: "근경 과장과 빠른 원근 수렴으로 액션 타격감·광활한 배경 컷에 적합합니다.", adviceEn: "Strong foreground exaggeration and tight vanishing points suit dynamic action & wide worlds." },
  35: { ko: "35mm 준광각 · 스토리텔링", en: "35mm Narrative · Storytelling", adviceKo: "인물과 주변 공간 정보를 균형 있게 담아 일상·대화·상황 설정 컷에 최적입니다.", adviceEn: "Balances character expression with environmental context for everyday narrative beats." },
  50: { ko: "50mm 표준 · 자연 시야", en: "50mm Standard · Natural Eye", adviceKo: "왜곡이 적은 자연 원근으로 독자 몰입이 필요한 정면 대화·심리 묘사에 안정적입니다.", adviceEn: "Low-distortion natural perspective keeps dialogue and psychological scenes grounded." },
  85: { ko: "85mm 망원 · 인물 클로즈업", en: "85mm Telephoto · Portrait", adviceKo: "배경 압축 효과가 커서 감정 클로즈업·로맨스·엔딩 클리프행어 컷에 강합니다.", adviceEn: "High background compression isolates faces for emotional close-ups and cliffhangers." },
};

/** 24/35/50/85mm 광학 화각, 3분할, 황금나선, 아이레벨·2점 소실점 오버레이를 계산한다. */
export function computeCameraCompositionOverlay(input: CameraCompositionInput): CameraCompositionOverlay {
  const w = Math.max(64, input.canvasWidthPx);
  const h = Math.max(64, input.canvasHeightPx);
  const focal = input.focalLengthMm;
  const sensorW = clampNum(input.sensorWidthMm ?? 36, 12, 70);
  const sensorH = sensorW / Math.max(0.25, w / h);

  const hFovRad = 2 * Math.atan(sensorW / (2 * focal));
  const vFovRad = 2 * Math.atan(sensorH / (2 * focal));
  const dFovRad = 2 * Math.atan(Math.hypot(sensorW, sensorH) / (2 * focal));
  const radToDeg = 180 / Math.PI;
  const horizontalFovDeg = hFovRad * radToDeg;
  const verticalFovDeg = vFovRad * radToDeg;
  const diagonalFovDeg = dFovRad * radToDeg;
  const viewingDistancePx = (w * 0.5) / Math.max(1e-4, Math.tan(hFovRad * 0.5));
  const cropScale = clampNum(24 / focal, 0.1, 1);
  const cropW = w * cropScale;
  const cropH = h * cropScale;

  const x1 = w / 3; const x2 = (w * 2) / 3; const y1 = h / 3; const y2 = (h * 2) / 3;
  const corner: GoldenSpiralCorner = input.spiralCorner ?? "top-right";
  const subdivisions: OverlayRect[] = [];
  const rawSpiral: OverlayPoint2D[] = [];
  let rx = 0; let ry = 0; let rw = w; let rh = h; let dir = 0;

  for (let step = 0; step < 7; step += 1) {
    const sq = Math.min(rw, rh);
    let sx = rx; let sy = ry;
    let arcCx: number; let arcCy: number; let startAngle: number; let endAngle: number;
    if (dir === 0) {
      arcCx = rx + sq; arcCy = ry + sq; startAngle = Math.PI; endAngle = Math.PI * 1.5; rx += sq; rw = Math.max(1, rw - sq);
    } else if (dir === 1) {
      arcCx = rx; arcCy = ry + sq; startAngle = Math.PI * 1.5; endAngle = Math.PI * 2; ry += sq; rh = Math.max(1, rh - sq);
    } else if (dir === 2) {
      sx = rx + rw - sq; arcCx = sx; arcCy = ry; startAngle = 0; endAngle = Math.PI * 0.5; rw = Math.max(1, rw - sq);
    } else {
      sy = ry + rh - sq; arcCx = rx + sq; arcCy = sy; startAngle = Math.PI * 0.5; endAngle = Math.PI; rh = Math.max(1, rh - sq);
    }
    subdivisions.push({ x: sx, y: sy, width: sq, height: sq });
    for (let k = 0; k < 8; k += 1) {
      const a = startAngle + ((endAngle - startAngle) * k) / 8;
      rawSpiral.push({ x: arcCx + Math.cos(a) * sq, y: arcCy + Math.sin(a) * sq });
    }
    dir = (dir + 1) % 4;
  }

  const flipX = corner === "top-left" || corner === "bottom-left";
  const flipY = corner === "bottom-left" || corner === "bottom-right";
  const mapPt = (p: OverlayPoint2D): OverlayPoint2D => ({ x: clampNum(flipX ? w - p.x : p.x, 0, w), y: clampNum(flipY ? h - p.y : p.y, 0, h) });
  const mapRect = (r: OverlayRect): OverlayRect => ({ x: flipX ? w - (r.x + r.width) : r.x, y: flipY ? h - (r.y + r.height) : r.y, width: r.width, height: r.height });

  const eyeRatio = clampNum(input.eyeLevelRatio01 ?? 0.42, 0.05, 0.95);
  const eyeY = h * eyeRatio;
  const vpHalfSpan = viewingDistancePx * 0.92;
  const meta = FOCAL_META[focal];

  return {
    canvasWidthPx: w, canvasHeightPx: h, focalLengthMm: focal,
    labelKo: meta.ko, labelEn: meta.en, framingAdviceKo: meta.adviceKo, framingAdviceEn: meta.adviceEn,
    horizontalFovDeg, verticalFovDeg, diagonalFovDeg, viewingDistancePx,
    compressionIndex: focal / 50, perspectiveStrength01: clampNum(24 / focal, 0.2, 1),
    cropRelativeTo24mm: { x: (w - cropW) * 0.5, y: (h - cropH) * 0.5, width: cropW, height: cropH },
    ruleOfThirds: {
      verticalLines: [{ x1, y1: 0, x2: x1, y2: h }, { x1: x2, y1: 0, x2: x2, y2: h }],
      horizontalLines: [{ x1: 0, y1, x2: w, y2: y1 }, { x1: 0, y1: y2, x2: w, y2: y2 }],
      powerPoints: [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x1, y: y2 }, { x: x2, y: y2 }],
    },
    goldenSpiral: {
      corner, phi: PHI, subdivisions: subdivisions.map(mapRect),
      curvePoints: rawSpiral.map(mapPt), focalEye: mapPt({ x: rx + rw * 0.5, y: ry + rh * 0.5 }),
    },
    eyeLevel: {
      ratio01: eyeRatio, yPx: eyeY, cameraPitchDeg: (0.5 - eyeRatio) * verticalFovDeg,
      horizonLine: { x1: 0, y1: eyeY, x2: w, y2: eyeY },
      leftVanishingPoint: { x: w * 0.5 - vpHalfSpan, y: eyeY },
      rightVanishingPoint: { x: w * 0.5 + vpHalfSpan, y: eyeY },
      vanishingSpanPx: vpHalfSpan * 2,
    },
  };
}

interface SpellingRule { readonly pattern: RegExp; readonly replacement: string; readonly messageKo: string; readonly messageEn: string; }
interface PlatformRule { readonly platform: CompliancePlatformId; readonly severity: DialogueLintSeverity; readonly pattern: RegExp; readonly suggestion: string; readonly messageKo: string; readonly messageEn: string; }

const SPELLING_RULES: readonly SpellingRule[] = [
  { pattern: /되요/gu, replacement: "돼요", messageKo: "맞춤법 오류: '되요'는 '돼요'가 바른 표기입니다.", messageEn: "Spelling: use '돼요' instead of '되요'." },
  { pattern: /안되(?=[.!?\s,]|$)/gu, replacement: "안 돼", messageKo: "맞춤법·띄어쓰기: 문장 끝 '안되'는 '안 돼'로 교정하세요.", messageEn: "Spelling: use '안 돼' at clause end." },
  { pattern: /몇일/gu, replacement: "며칠", messageKo: "맞춤법 오류: '몇일'은 '며칠'이 표준어입니다.", messageEn: "Spelling: use '며칠' instead of '몇일'." },
  { pattern: /어떻해/gu, replacement: "어떡해", messageKo: "맞춤법 오류: '어떻해'는 '어떡해'로 써야 합니다.", messageEn: "Spelling: use '어떡해' instead of '어떻해'." },
  { pattern: /어의없/gu, replacement: "어이없", messageKo: "맞춤법 오류: '어의없-'은 '어이없-'이 표준어입니다.", messageEn: "Spelling: use '어이없-' instead of '어의없-'." },
  { pattern: /금새/gu, replacement: "금세", messageKo: "맞춤법 오류: '금새'는 '금세'로 교정하세요.", messageEn: "Spelling: use '금세' instead of '금새'." },
  { pattern: /오랫만/gu, replacement: "오랜만", messageKo: "맞춤법 오류: '오랫만'은 '오랜만'이 표준어입니다.", messageEn: "Spelling: use '오랜만' instead of '오랫만'." },
  { pattern: /역활/gu, replacement: "역할", messageKo: "맞춤법 오류: '역활'은 '역할'이 표준어입니다.", messageEn: "Spelling: use '역할' instead of '역활'." },
  { pattern: /할께/gu, replacement: "할게", messageKo: "맞춤법 오류: '할께'는 '할게'가 바른 표기입니다.", messageEn: "Spelling: use '할게' instead of '할께'." },
  { pattern: /갯수/gu, replacement: "개수", messageKo: "맞춤법 오류: '갯수'는 '개수'로 표기합니다.", messageEn: "Spelling: use '개수' instead of '갯수'." },
];

const PLATFORM_COMPLIANCE_RULES: readonly PlatformRule[] = [
  { platform: "naver", severity: "error", pattern: /죽어버려|스스로\s*끝내/gu, suggestion: "사라져 버려", messageKo: "네이버 웹툰 심의 경고: 자해·극단적 표현은 등급 반려 대상입니다.", messageEn: "Naver Webtoon compliance: self-harm or fatal phrasing triggers rating rejection." },
  { platform: "naver", severity: "warning", pattern: /꺼져버려|미친\s*놈/gu, suggestion: "물러나", messageKo: "네이버 웹툰 심의 주의: 과격한 비속어는 순화 표현을 권장합니다.", messageEn: "Naver Webtoon advisory: soften harsh profanity for all-ages visibility." },
  { platform: "kakao", severity: "error", pattern: /불법\s*도박|칼로\s*찔러/gu, suggestion: "무기로 제압해", messageKo: "카카오웹툰 심의 경고: 사행성 권유·직접적 흉기 가해 묘사는 재심 대상입니다.", messageEn: "Kakao Webtoon compliance: direct weapon assault or illegal gambling triggers review." },
  { platform: "kakao", severity: "warning", pattern: /상표명\s*콜라|유명\s*명품백/gu, suggestion: "탄산음료", messageKo: "카카오웹툰 편집 주의: 실존 상표 직접 노출은 가상 브랜드 치환이 안전합니다.", messageEn: "Kakao Webtoon advisory: replace real-world brand names with fictional ones." },
  { platform: "japan", severity: "error", pattern: /미성년\s*음주|고등학생\s*흡연|未成年飲酒|未成年喫煙/gu, suggestion: "탄산음료를 마시며", messageKo: "일본(피코마/라인망가) 심의 경고: 미성년 음주·흡연 묘사는 현지 반려 사유입니다.", messageEn: "Japan (Piccoma/LINE Manga) compliance: underage drinking or smoking is restricted." },
  { platform: "japan", severity: "warning", pattern: /담배\s*한\s*대/gu, suggestion: "사탕 하나", messageKo: "일본 플랫폼 주의: 흡연 장면은 성인 연령 표기 및 연기 수위를 확인하세요.", messageEn: "Japan platform advisory: smoking references require age-verified character context." },
  { platform: "north-america", severity: "error", pattern: /\b(?:kill yourself|self-harm|underage drinking)\b/giu, suggestion: "back down now", messageKo: "북미(WEBTOON/Tapas) 심의 경고: 자해·미성년 음주 표현은 글로벌 차단 대상입니다.", messageEn: "North America (WEBTOON/Tapas) compliance: self-harm or underage drinking violates guidelines." },
  { platform: "north-america", severity: "warning", pattern: /\b(?:bloodbath|damn idiot)\b/giu, suggestion: "total chaos", messageKo: "북미 플랫폼 주의: 강한 욕설·고어 표현은 Young Adult 콘텐츠 경고가 필요합니다.", messageEn: "North America advisory: strong profanity or gore requires Mature content advisory." },
];

function damerauLevenshtein(a: string, b: string): number {
  const m = a.length; const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0));
  for (let i = 0; i <= m; i += 1) { const row = dp[i]; if (row) row[0] = i; }
  for (let j = 0; j <= n; j += 1) { const r0 = dp[0]; if (r0) r0[j] = j; }
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min((dp[i - 1]?.[j] ?? 0) + 1, (dp[i]?.[j - 1] ?? 0) + 1, (dp[i - 1]?.[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, (dp[i - 2]?.[j - 2] ?? 0) + 1);
      }
      const row = dp[i];
      if (row) row[j] = val;
    }
  }
  return dp[m]?.[n] ?? 3;
}

const KO_PARTICLES = /(?:은|는|이|가|을|를|의|에|도|로|으로|와|과|야|아|님|씨)$/u;

/** 말풍선 실시간 맞춤법·설정집 고유명사 오타·글로벌 4대 플랫폼 심의 린터. */
export function lintDialogueComplianceAndGlossary(input: DialogueLintInput): DialogueLintReport {
  const text = input.text;
  const glossary = input.glossary ?? [];
  const activePlatforms = new Set<CompliancePlatformId>(input.targetPlatforms ?? ALL_COMPLIANCE_PLATFORMS);
  const issues: DialogueLintIssue[] = [];
  const seenSpans = new Set<string>();
  let seq = 0;

  const pushIssue = (issue: Omit<DialogueLintIssue, "id">): void => {
    const key = `${issue.category}:${issue.platformScope}:${issue.startOffset}:${issue.endOffset}`;
    if (seenSpans.has(key)) return;
    seenSpans.add(key);
    seq += 1;
    issues.push({ id: `lint-${seq}`, ...issue });
  };

  const canonicalSet = new Set(glossary.map((g) => g.canonical));
  const aliasSet = new Set(glossary.flatMap((g) => g.aliases ?? []));
  for (const entry of glossary) {
    for (const wrong of entry.knownMisspellings ?? []) {
      if (!wrong) continue;
      let pos = 0;
      while (pos < text.length) {
        const idx = text.indexOf(wrong, pos);
        if (idx === -1) break;
        pushIssue({
          category: "glossary-typo", severity: "error", platformScope: "all",
          startOffset: idx, endOffset: idx + wrong.length, matchedText: wrong, suggestions: [entry.canonical],
          messageKo: `고유명사 오타: 설정집 정식 명칭 '${entry.canonical}'과(와) 다릅니다.`,
          messageEn: `Glossary mismatch: expected canonical name '${entry.canonical}'.`,
        });
        pos = idx + wrong.length;
      }
    }
  }

  for (const match of text.matchAll(/[가-힣A-Za-z0-9]{2,}/gu)) {
    const raw = match[0];
    const start = match.index ?? -1;
    if (start < 0) continue;
    const stem = raw.length >= 3 ? raw.replace(KO_PARTICLES, "") : raw;
    if (stem.length < 2 || canonicalSet.has(stem) || aliasSet.has(stem) || canonicalSet.has(raw)) continue;
    for (const entry of glossary) {
      const target = entry.canonical;
      if (target.length < 2 || Math.abs(stem.length - target.length) > 1) continue;
      const dist = damerauLevenshtein(stem.toLowerCase(), target.toLowerCase());
      const anchor = stem[0]?.toLowerCase() === target[0]?.toLowerCase() || stem[stem.length - 1]?.toLowerCase() === target[target.length - 1]?.toLowerCase();
      if (dist === 1 && anchor) {
        pushIssue({
          category: "glossary-typo", severity: "error", platformScope: "all",
          startOffset: start, endOffset: start + stem.length, matchedText: stem, suggestions: [entry.canonical],
          messageKo: `고유명사 오타 의심: '${stem}' → 설정집 '${entry.canonical}' 확인`,
          messageEn: `Suspected glossary typo: '${stem}' -> '${entry.canonical}'.`,
        });
        break;
      }
    }
  }

  for (const rule of SPELLING_RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      const start = m.index ?? -1;
      if (start < 0) continue;
      pushIssue({
        category: "spelling-typo", severity: "warning", platformScope: "all",
        startOffset: start, endOffset: start + m[0].length, matchedText: m[0], suggestions: [rule.replacement],
        messageKo: rule.messageKo, messageEn: rule.messageEn,
      });
    }
  }

  for (const m of text.matchAll(/(^|[^A-Za-z가-힣0-9])([A-Za-z가-힣]{2,})\s+\2(?=$|[^A-Za-z가-힣0-9])/giu)) {
    const prefixLen = m[1]?.length ?? 0;
    const start = (m.index ?? -1) + prefixLen;
    const word = m[2];
    const matched = m[0].slice(prefixLen);
    if (start < 0 || !word) continue;
    pushIssue({
      category: "spelling-typo", severity: "warning", platformScope: "all",
      startOffset: start, endOffset: start + matched.length, matchedText: matched, suggestions: [word],
      messageKo: `반복 오탈자: '${word}'이(가) 연속 중복되었습니다.`,
      messageEn: `Repeated word typo: duplicate '${word}'.`,
    });
  }

  for (const rule of PLATFORM_COMPLIANCE_RULES) {
    if (!activePlatforms.has(rule.platform)) continue;
    for (const m of text.matchAll(rule.pattern)) {
      const start = m.index ?? -1;
      if (start < 0) continue;
      pushIssue({
        category: "platform-compliance", severity: rule.severity, platformScope: rule.platform,
        startOffset: start, endOffset: start + m[0].length, matchedText: m[0], suggestions: [rule.suggestion],
        messageKo: rule.messageKo, messageEn: rule.messageEn,
      });
    }
  }

  issues.sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);
  const countsByCategory: Record<DialogueLintCategory, number> = { "glossary-typo": 0, "spelling-typo": 0, "platform-compliance": 0 };
  const countsByPlatform: Record<CompliancePlatformId, number> = { naver: 0, kakao: 0, japan: 0, "north-america": 0 };
  const blocked: Record<CompliancePlatformId, boolean> = { naver: false, kakao: false, japan: false, "north-america": false };
  let penalty = 0;
  for (const item of issues) {
    countsByCategory[item.category] += 1;
    penalty += item.severity === "error" ? 18 : item.severity === "warning" ? 8 : 3;
    if (item.platformScope !== "all") {
      countsByPlatform[item.platformScope] += 1;
      if (item.severity === "error") blocked[item.platformScope] = true;
    }
  }
  return {
    text, issues, countsByCategory, countsByPlatform,
    complianceScore0To100: Math.max(0, 100 - penalty),
    readyForPlatforms: { naver: !blocked.naver, kakao: !blocked.kakao, japan: !blocked.japan, "north-america": !blocked["north-america"] },
  };
}

/** 검출된 이슈의 첫 번째 수정 제안을 오프셋 충돌 없이 뒤에서부터 안전 일괄 적용한다. */
export function applyLinterFixes(
  text: string,
  issues: readonly DialogueLintIssue[],
  categories?: readonly DialogueLintCategory[],
): string {
  const allowed = categories ? new Set<DialogueLintCategory>(categories) : null;
  const sorted = issues
    .filter((i) => (!allowed || allowed.has(i.category)) && i.suggestions.length > 0)
    .sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  const picked: DialogueLintIssue[] = [];
  let cursor = -1;
  for (const item of sorted) {
    if (item.startOffset < cursor) continue;
    picked.push(item);
    cursor = item.endOffset;
  }
  let out = text;
  for (let i = picked.length - 1; i >= 0; i -= 1) {
    const item = picked[i];
    const rep = item?.suggestions[0];
    if (item && rep !== undefined) out = `${out.slice(0, item.startOffset)}${rep}${out.slice(item.endOffset)}`;
  }
  return out;
}

export const DEMO_WEBTOON_GLOSSARY: readonly GlossaryEntry[] = [
  { canonical: "강서윤", aliases: ["서윤"], knownMisspellings: ["강서연"], roleKo: "주인공", roleEn: "Protagonist" },
  { canonical: "아르카디아", knownMisspellings: ["아르카데아"], roleKo: "성채 도시", roleEn: "Citadel City" },
  { canonical: "청룡검", knownMisspellings: ["청용검"], roleKo: "전설 무구", roleEn: "Relic Blade" },
  { canonical: "Seoyun", knownMisspellings: ["Seoyeon"], roleKo: "주인공(영문)", roleEn: "Protagonist" },
  { canonical: "Arcadia", knownMisspellings: ["Arkadea"], roleKo: "성채 도시(영문)", roleEn: "Citadel City" },
];

export const DEMO_LINTER_SAMPLE_KO =
  "강서연은 아르카데아 성문 앞에서 정말 정말 몇일 밤을 새워도 안되! 미성년 음주 장면과 죽어버려 대사는 심의에 걸리고 bloodbath 경고도 확인해야 해.";

export const DEMO_LINTER_SAMPLE_EN =
  "Seoyeon waits at the the Arkadea gate! Check bloodbath and underage drinking lines before global release.";

function mergeGeometry(base: SmartSymbolGeometry, override?: Partial<SmartSymbolGeometry>): SmartSymbolGeometry {
  if (!override) return { ...base };
  const labelText = override.labelText ?? base.labelText;
  return {
    widthPx: override.widthPx ?? base.widthPx,
    heightPx: override.heightPx ?? base.heightPx,
    strokeWeightPx: override.strokeWeightPx ?? base.strokeWeightPx,
    fillToneToken: override.fillToneToken ?? base.fillToneToken,
    ...(labelText !== undefined ? { labelText } : {}),
    vectorPathHint: override.vectorPathHint ?? base.vectorPathHint,
  };
}

/** 소품·배경·SFX 마스터 등록, 다중 컷 인스턴스 배치, 선택적 일괄 전파 및 언링크 보호 뱅크. */
export class SmartPropSymbolBank {
  private readonly masters = new Map<string, SmartSymbolMaster>();
  private readonly instances = new Map<string, SmartSymbolInstance>();

  registerMaster(input: RegisterSymbolMasterInput): SmartSymbolMaster {
    const master: SmartSymbolMaster = {
      id: input.id, nameKo: input.nameKo, nameEn: input.nameEn, category: input.category,
      version: 1, tags: [...(input.tags ?? [])], geometry: { ...input.geometry },
    };
    this.masters.set(master.id, master);
    return master;
  }

  placeInstance(input: PlaceSymbolInstanceInput): SmartSymbolInstance {
    const master = this.masters.get(input.masterId);
    if (!master) throw new Error(`Unknown smart symbol master: ${input.masterId}`);
    const localOverrides = { ...(input.localOverrides ?? {}) };
    const instance: SmartSymbolInstance = {
      instanceId: input.instanceId, masterId: master.id, cutId: input.cutId,
      cutLabelKo: input.cutLabelKo, cutLabelEn: input.cutLabelEn, x: input.x, y: input.y,
      scale: clampNum(input.scale ?? 1, 0.1, 10), rotationDeg: input.rotationDeg ?? 0,
      linked: true, syncedVersion: master.version,
      resolvedGeometry: mergeGeometry(master.geometry, localOverrides), localOverrides,
    };
    this.instances.set(instance.instanceId, instance);
    return instance;
  }

  unlinkInstance(instanceId: string): SmartSymbolInstance {
    const existing = this.instances.get(instanceId);
    if (!existing) throw new Error(`Unknown smart symbol instance: ${instanceId}`);
    const next: SmartSymbolInstance = { ...existing, linked: false };
    this.instances.set(instanceId, next);
    return next;
  }

  relinkInstance(instanceId: string, syncNow = true): SmartSymbolInstance {
    const existing = this.instances.get(instanceId);
    if (!existing) throw new Error(`Unknown smart symbol instance: ${instanceId}`);
    const master = this.masters.get(existing.masterId);
    if (!master) throw new Error(`Missing master for instance: ${instanceId}`);
    const next: SmartSymbolInstance = {
      ...existing, linked: true,
      ...(syncNow ? { syncedVersion: master.version, resolvedGeometry: mergeGeometry(master.geometry, existing.localOverrides) } : {}),
    };
    this.instances.set(instanceId, next);
    return next;
  }

  /** 마스터 수정 시 연결된 대상 컷 인스턴스에만 선택적 일괄 전파(언링크 컷 완벽 보호). */
  updateMasterAndPropagate(
    masterId: string,
    geometryPatch: Partial<SmartSymbolGeometry>,
    options: MasterPropagationOptions = {},
  ): SymbolPropagationReport {
    const master = this.masters.get(masterId);
    if (!master) throw new Error(`Unknown smart symbol master: ${masterId}`);
    const newVersion = master.version + 1;
    const updatedMaster: SmartSymbolMaster = { ...master, version: newVersion, geometry: mergeGeometry(master.geometry, geometryPatch) };
    this.masters.set(masterId, updatedMaster);

    const cutFilter = options.targetCutIds ? new Set(options.targetCutIds) : null;
    const instFilter = options.targetInstanceIds ? new Set(options.targetInstanceIds) : null;
    const preserveLocal = options.preserveLocalOverrides ?? true;
    const updatedInstanceIds: string[] = [];
    const skippedUnlinkedInstanceIds: string[] = [];
    const skippedUnselectedInstanceIds: string[] = [];
    const affectedCuts = new Set<string>();

    for (const [id, inst] of this.instances.entries()) {
      if (inst.masterId !== masterId) continue;
      if (!inst.linked) { skippedUnlinkedInstanceIds.push(id); continue; }
      if ((cutFilter && !cutFilter.has(inst.cutId)) || (instFilter && !instFilter.has(id))) {
        skippedUnselectedInstanceIds.push(id);
        continue;
      }
      this.instances.set(id, {
        ...inst, syncedVersion: newVersion,
        resolvedGeometry: preserveLocal ? mergeGeometry(updatedMaster.geometry, inst.localOverrides) : { ...updatedMaster.geometry },
      });
      updatedInstanceIds.push(id);
      affectedCuts.add(inst.cutId);
    }
    return { masterId, newVersion, updatedInstanceIds, skippedUnlinkedInstanceIds, skippedUnselectedInstanceIds, affectedCutIds: [...affectedCuts] };
  }

  getMaster(masterId: string): SmartSymbolMaster | undefined { return this.masters.get(masterId); }
  getInstance(instanceId: string): SmartSymbolInstance | undefined { return this.instances.get(instanceId); }
  listMasters(): readonly SmartSymbolMaster[] { return [...this.masters.values()]; }
  listInstances(masterId?: string): readonly SmartSymbolInstance[] {
    const all = [...this.instances.values()];
    return masterId ? all.filter((i) => i.masterId === masterId) : all;
  }
  getBankSummary(): SmartPropBankSummary {
    const all = [...this.instances.values()];
    const linkedCount = all.filter((i) => i.linked).length;
    return { masterCount: this.masters.size, instanceCount: all.length, linkedCount, unlinkedCount: all.length - linkedCount };
  }
}

/** UI·테스트용 소품/배경/SFX 데모 스마트 심볼 뱅크를 생성한다. */
export function createDemoSmartPropBank(): SmartPropSymbolBank {
  const bank = new SmartPropSymbolBank();
  bank.registerMaster({
    id: "sym-relic-blade", nameKo: "청룡검 (소품)", nameEn: "Relic Blade (Prop)", category: "prop", tags: ["weapon", "hero"],
    geometry: { widthPx: 48, heightPx: 186, strokeWeightPx: 2.5, fillToneToken: "accent-soft", vectorPathHint: "blade-guard-hilt" },
  });
  bank.registerMaster({
    id: "sym-atelier-window", nameKo: "아틀리에 아치 창문 (배경)", nameEn: "Atelier Arch Window (BG)", category: "background", tags: ["bg", "interior"],
    geometry: { widthPx: 220, heightPx: 320, strokeWeightPx: 2.0, fillToneToken: "card", vectorPathHint: "arch-mullion-frame" },
  });
  bank.registerMaster({
    id: "sym-sfx-boom", nameKo: "충격 효과음 (SFX)", nameEn: "Impact Callout (SFX)", category: "sfx", tags: ["sfx", "action"],
    geometry: { widthPx: 260, heightPx: 96, strokeWeightPx: 3.5, fillToneToken: "warning-soft", labelText: "BOOM!!", vectorPathHint: "jagged-impact-calligraphy" },
  });
  bank.placeInstance({ instanceId: "inst-blade-c1", masterId: "sym-relic-blade", cutId: "cut-01", cutLabelKo: "1컷 · 발도", cutLabelEn: "Cut 1 · Draw", x: 140, y: 180, scale: 1.0 });
  bank.placeInstance({ instanceId: "inst-blade-c2", masterId: "sym-relic-blade", cutId: "cut-02", cutLabelKo: "2컷 · 대치", cutLabelEn: "Cut 2 · Standoff", x: 260, y: 210, scale: 1.15 });
  bank.placeInstance({ instanceId: "inst-blade-c3", masterId: "sym-relic-blade", cutId: "cut-03", cutLabelKo: "3컷 · 파손 클로즈업", cutLabelEn: "Cut 3 · Broken Close-Up", x: 180, y: 120, scale: 1.8 });
  bank.unlinkInstance("inst-blade-c3");
  bank.placeInstance({ instanceId: "inst-win-c1", masterId: "sym-atelier-window", cutId: "cut-01", cutLabelKo: "1컷 · 전경", cutLabelEn: "Cut 1 · Wide", x: 60, y: 40 });
  bank.placeInstance({ instanceId: "inst-win-c4", masterId: "sym-atelier-window", cutId: "cut-04", cutLabelKo: "4컷 · 회상", cutLabelEn: "Cut 4 · Flashback", x: 80, y: 48 });
  bank.placeInstance({ instanceId: "inst-sfx-c2", masterId: "sym-sfx-boom", cutId: "cut-02", cutLabelKo: "2컷 · 충돌", cutLabelEn: "Cut 2 · Clash", x: 110, y: 90 });
  bank.placeInstance({ instanceId: "inst-sfx-c4", masterId: "sym-sfx-boom", cutId: "cut-04", cutLabelKo: "4컷 · 피날레", cutLabelEn: "Cut 4 · Finale", x: 125, y: 105, scale: 1.25 });
  return bank;
}

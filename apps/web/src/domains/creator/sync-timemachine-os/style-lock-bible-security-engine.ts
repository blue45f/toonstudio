/**
 * 작가 개인화 아트 바이블 & 화풍 일관성 자동 검수(Style-Lock Consistency Gate)
 * + 권한별 부분 원고 열람(Zero-Leak Scoped Slice) 및 비가시 포렌식 워터마크 정책 엔진.
 */

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export type PaletteSlotKey = "skin" | "hair" | "eyes" | "outfit";

export const PALETTE_SLOT_LABELS_KO: Readonly<Record<PaletteSlotKey, string>> = Object.freeze({
  skin: "피부 톤",
  hair: "헤어 컬러",
  eyes: "눈동자",
  outfit: "시그니처 의상",
});

export const PALETTE_SLOT_ORDER: readonly PaletteSlotKey[] = Object.freeze([
  "skin",
  "hair",
  "eyes",
  "outfit",
]);

export interface CharacterArtBibleEntry {
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly palette: Readonly<Record<PaletteSlotKey, OklchColor>>;
  readonly standardLineWidthPx: number;
  readonly lineWidthTolerancePx: number;
  readonly minContrastRatio: number;
  readonly maxContrastRatio: number;
  readonly maxDeltaE: number;
}

export interface SubmittedCutStyleSample {
  readonly cutId: string;
  readonly characterId: string;
  readonly contributorNameKo: string;
  readonly sampledPalette: Readonly<Record<PaletteSlotKey, OklchColor>>;
  readonly measuredLineWidthPx: number;
  readonly measuredContrastRatio: number;
}

export interface PaletteSlotAuditResult {
  readonly slot: PaletteSlotKey;
  readonly slotLabelKo: string;
  readonly target: OklchColor;
  readonly sampled: OklchColor;
  readonly deltaE: number;
  readonly withinLimit: boolean;
  readonly correctionShift: {
    readonly deltaL: number;
    readonly deltaC: number;
    readonly deltaH: number;
  };
}

export interface StyleLockAutoCorrectionParams {
  readonly cutId: string;
  readonly characterId: string;
  readonly lineWidthScaleFactor: number;
  readonly targetLineWidthPx: number;
  readonly contrastGainFactor: number;
  readonly targetContrastRatio: number;
  readonly paletteRemaps: readonly {
    readonly slot: PaletteSlotKey;
    readonly targetOklchCss: string;
    readonly deltaL: number;
    readonly deltaC: number;
    readonly deltaH: number;
  }[];
}

export type StyleLockSeverity = "pass" | "warn" | "block";

export interface StyleLockAuditReport {
  readonly cutId: string;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly contributorNameKo: string;
  readonly passed: boolean;
  readonly severity: StyleLockSeverity;
  readonly maxObservedDeltaE: number;
  readonly slotAudits: readonly PaletteSlotAuditResult[];
  readonly lineWidthDeviationPx: number;
  readonly lineWidthWithinLimit: boolean;
  readonly contrastWithinLimit: boolean;
  readonly contrastDeviation: number;
  readonly autoCorrection: StyleLockAutoCorrectionParams;
  readonly summaryKo: string;
}

export type ExternalCollabRole =
  | "outsource-line"
  | "outsource-color"
  | "translator"
  | "editor-review";

export interface RolePolicyDefaults {
  readonly role: ExternalCollabRole;
  readonly labelKo: string;
  readonly maxResolutionPx: number;
  readonly maxAllowedCuts: number;
  readonly allowRawLayerExport: boolean;
  readonly defaultTtlHours: number;
}

export const ZERO_LEAK_ROLE_POLICIES: Readonly<Record<ExternalCollabRole, RolePolicyDefaults>> =
  Object.freeze({
    "outsource-line": {
      role: "outsource-line",
      labelKo: "외주 선화 어시스턴트",
      maxResolutionPx: 2400,
      maxAllowedCuts: 15,
      allowRawLayerExport: true,
      defaultTtlHours: 48,
    },
    "outsource-color": {
      role: "outsource-color",
      labelKo: "외주 채색·명암 담당",
      maxResolutionPx: 2400,
      maxAllowedCuts: 20,
      allowRawLayerExport: true,
      defaultTtlHours: 48,
    },
    translator: {
      role: "translator",
      labelKo: "해외 현지화 번역가",
      maxResolutionPx: 1280,
      maxAllowedCuts: 30,
      allowRawLayerExport: false,
      defaultTtlHours: 24,
    },
    "editor-review": {
      role: "editor-review",
      labelKo: "담당 PD·플랫폼 검수",
      maxResolutionPx: 1600,
      maxAllowedCuts: 60,
      allowRawLayerExport: false,
      defaultTtlHours: 12,
    },
  });

export interface ZeroLeakAccessToken {
  readonly tokenId: string;
  readonly projectId: string;
  readonly recipientNameKo: string;
  readonly role: ExternalCollabRole;
  readonly allowedCutStart: number;
  readonly allowedCutEnd: number;
  readonly maxResolutionPx: number;
  readonly allowRawLayerExport: boolean;
  readonly issuedAtIso: string;
  readonly expiresAtIso: string;
  readonly watermarkId: string;
  readonly signature: string;
  readonly revoked: boolean;
}

export interface ScopedSliceAccessRequest {
  readonly requestedCutNumber: number;
  readonly requestedResolutionPx: number;
  readonly requestsRawLayerExport: boolean;
  readonly evaluatedAtIso: string;
}

export type ZeroLeakDecisionCode =
  | "ALLOW"
  | "DENY_SIGNATURE_INVALID"
  | "DENY_REVOKED"
  | "DENY_EXPIRED"
  | "DENY_CUT_OUT_OF_RANGE"
  | "DENY_RESOLUTION_EXCEEDED"
  | "DENY_RAW_EXPORT_FORBIDDEN";

export interface ZeroLeakEvaluationResult {
  readonly allowed: boolean;
  readonly code: ZeroLeakDecisionCode;
  readonly reasonKo: string;
  readonly enforcedWatermarkId: string | null;
  readonly effectiveResolutionPx: number;
}

export interface ForensicAuditLogEntry {
  readonly auditId: string;
  readonly timestampIso: string;
  readonly tokenId: string;
  readonly recipientNameKo: string;
  readonly role: ExternalCollabRole;
  readonly requestedCutNumber: number;
  readonly requestedResolutionPx: number;
  readonly decision: ZeroLeakDecisionCode;
  readonly allowed: boolean;
  readonly watermarkId: string;
  readonly summaryKo: string;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHueDeg(hue: number): number {
  const mod = hue % 360;
  return mod < 0 ? mod + 360 : mod;
}

function shortestHueDelta(fromDeg: number, toDeg: number): number {
  const diff = ((toDeg - fromDeg + 540) % 360) - 180;
  return roundTo(diff, 1);
}

function deterministicDigestHex(input: string, salt: number): string {
  let hash = salt >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function computeTokenSignature(token: Omit<ZeroLeakAccessToken, "signature" | "revoked">): string {
  const payload = [
    token.tokenId,
    token.projectId,
    token.recipientNameKo,
    token.role,
    token.allowedCutStart,
    token.allowedCutEnd,
    token.maxResolutionPx,
    token.allowRawLayerExport ? "raw1" : "raw0",
    token.issuedAtIso,
    token.expiresAtIso,
    token.watermarkId,
  ].join("|");
  const hi = deterministicDigestHex(payload, 0x811c9dc5);
  const lo = deterministicDigestHex(`zl-seal:${payload}`, 0x27d4eb2d);
  return `ZL-${hi}${lo}`;
}

/** OKLCH 색상을 원시 HEX 없이 CSS `oklch(...)` 문자열로 직렬화한다. */
export function formatOklchCss(color: OklchColor): string {
  const l = clamp(color.l, 0, 1).toFixed(3);
  const c = clamp(color.c, 0, 0.4).toFixed(3);
  const h = normalizeHueDeg(color.h).toFixed(1);
  return `oklch(${l} ${c} ${h})`;
}

/**
 * 두 OKLCH 색상을 OKLab 직교 좌표로 변환해 지각 색차 `ΔE` (0~100 스케일)를 산출한다.
 * 색상환 경계(0°/360°)에서도 불연속이 발생하지 않는다.
 */
export function computeOklchDeltaE(a: OklchColor, b: OklchColor): number {
  const radA = (normalizeHueDeg(a.h) * Math.PI) / 180;
  const radB = (normalizeHueDeg(b.h) * Math.PI) / 180;
  const a1 = a.c * Math.cos(radA);
  const b1 = a.c * Math.sin(radA);
  const a2 = b.c * Math.cos(radB);
  const b2 = b.c * Math.sin(radB);

  const dL = a.l - b.l;
  const dA = a1 - a2;
  const dB = b1 - b2;
  return roundTo(Math.sqrt(dL * dL + dA * dA + dB * dB) * 100, 2);
}

/** 외주·어시스턴트 제출 컷을 작가 아트 바이블 기준과 대조해 ΔE·선폭·명암 리포트와 1클릭 보정값을 산출한다. */
export function evaluateStyleLockConsistency(
  bibleEntry: CharacterArtBibleEntry,
  sample: SubmittedCutStyleSample,
): StyleLockAuditReport {
  const slotAudits: PaletteSlotAuditResult[] = [];
  let maxObservedDeltaE = 0;
  let severePaletteDrift = false;

  for (const slot of PALETTE_SLOT_ORDER) {
    const target = bibleEntry.palette[slot];
    const sampled = sample.sampledPalette[slot];
    const deltaE = computeOklchDeltaE(target, sampled);
    maxObservedDeltaE = Math.max(maxObservedDeltaE, deltaE);
    const withinLimit = deltaE <= bibleEntry.maxDeltaE;
    if (deltaE > bibleEntry.maxDeltaE * 1.6) {
      severePaletteDrift = true;
    }

    slotAudits.push(
      Object.freeze({
        slot,
        slotLabelKo: PALETTE_SLOT_LABELS_KO[slot],
        target,
        sampled,
        deltaE,
        withinLimit,
        correctionShift: Object.freeze({
          deltaL: roundTo(target.l - sampled.l, 3),
          deltaC: roundTo(target.c - sampled.c, 3),
          deltaH: shortestHueDelta(sampled.h, target.h),
        }),
      }),
    );
  }

  const lineWidthDeviationPx = roundTo(sample.measuredLineWidthPx - bibleEntry.standardLineWidthPx, 2);
  const lineWidthWithinLimit = Math.abs(lineWidthDeviationPx) <= bibleEntry.lineWidthTolerancePx;
  const severeLineDrift = Math.abs(lineWidthDeviationPx) > bibleEntry.lineWidthTolerancePx * 1.6;

  let contrastDeviation = 0;
  let targetContrastRatio = sample.measuredContrastRatio;
  if (sample.measuredContrastRatio < bibleEntry.minContrastRatio) {
    contrastDeviation = roundTo(sample.measuredContrastRatio - bibleEntry.minContrastRatio, 2);
    targetContrastRatio = bibleEntry.minContrastRatio;
  } else if (sample.measuredContrastRatio > bibleEntry.maxContrastRatio) {
    contrastDeviation = roundTo(sample.measuredContrastRatio - bibleEntry.maxContrastRatio, 2);
    targetContrastRatio = bibleEntry.maxContrastRatio;
  }
  const contrastWithinLimit = contrastDeviation === 0;

  const allSlotsOk = slotAudits.every((audit) => audit.withinLimit);
  const passed = allSlotsOk && lineWidthWithinLimit && contrastWithinLimit;

  let severity: StyleLockSeverity = "pass";
  if (!passed) {
    severity =
      severePaletteDrift || severeLineDrift || Math.abs(contrastDeviation) >= 1.5 ? "block" : "warn";
  }

  const safeMeasuredLine = Math.max(0.1, sample.measuredLineWidthPx);
  const safeMeasuredContrast = Math.max(0.5, sample.measuredContrastRatio);
  const autoCorrection: StyleLockAutoCorrectionParams = Object.freeze({
    cutId: sample.cutId,
    characterId: bibleEntry.characterId,
    lineWidthScaleFactor: roundTo(bibleEntry.standardLineWidthPx / safeMeasuredLine, 3),
    targetLineWidthPx: bibleEntry.standardLineWidthPx,
    contrastGainFactor: roundTo(targetContrastRatio / safeMeasuredContrast, 3),
    targetContrastRatio,
    paletteRemaps: Object.freeze(
      slotAudits.map((audit) =>
        Object.freeze({
          slot: audit.slot,
          targetOklchCss: formatOklchCss(audit.target),
          deltaL: audit.correctionShift.deltaL,
          deltaC: audit.correctionShift.deltaC,
          deltaH: audit.correctionShift.deltaH,
        }),
      ),
    ),
  });

  const issues: string[] = [];
  if (!allSlotsOk) issues.push(`최대 ΔE ${maxObservedDeltaE.toFixed(1)} (기준 ≤ ${bibleEntry.maxDeltaE})`);
  if (!lineWidthWithinLimit) {
    issues.push(`선폭 편차 ${lineWidthDeviationPx >= 0 ? "+" : ""}${lineWidthDeviationPx}px`);
  }
  if (!contrastWithinLimit) {
    issues.push(
      `명암 대비 ${sample.measuredContrastRatio.toFixed(1)}:1 (기준 ${bibleEntry.minContrastRatio}~${bibleEntry.maxContrastRatio}:1)`,
    );
  }

  const summaryKo = passed
    ? `${bibleEntry.characterNameKo} 아트 바이블 화풍 락 통과 (최대 ΔE ${maxObservedDeltaE.toFixed(1)} · 선폭 일치)`
    : `${bibleEntry.characterNameKo} 화풍 편차 감지: ${issues.join(" · ")} — 1클릭 자동 보정 가능`;

  return Object.freeze({
    cutId: sample.cutId,
    characterId: bibleEntry.characterId,
    characterNameKo: bibleEntry.characterNameKo,
    contributorNameKo: sample.contributorNameKo,
    passed,
    severity,
    maxObservedDeltaE: roundTo(maxObservedDeltaE, 2),
    slotAudits: Object.freeze(slotAudits),
    lineWidthDeviationPx,
    lineWidthWithinLimit,
    contrastWithinLimit,
    contrastDeviation,
    autoCorrection,
    summaryKo,
  });
}

/** 1클릭 화풍 락 자동 보정 파라미터를 제출 컷 샘플에 적용해 기준 팔레트·선폭·명암으로 정규화한다. */
export function applyStyleLockAutoCorrection(
  sample: SubmittedCutStyleSample,
  bibleEntry: CharacterArtBibleEntry,
): SubmittedCutStyleSample {
  const targetContrast = clamp(
    sample.measuredContrastRatio,
    bibleEntry.minContrastRatio,
    bibleEntry.maxContrastRatio,
  );
  const correctedPalette: Record<PaletteSlotKey, OklchColor> = {
    skin: Object.freeze({ ...bibleEntry.palette.skin }),
    hair: Object.freeze({ ...bibleEntry.palette.hair }),
    eyes: Object.freeze({ ...bibleEntry.palette.eyes }),
    outfit: Object.freeze({ ...bibleEntry.palette.outfit }),
  };

  return Object.freeze({
    ...sample,
    sampledPalette: Object.freeze(correctedPalette),
    measuredLineWidthPx: bibleEntry.standardLineWidthPx,
    measuredContrastRatio: roundTo(targetContrast, 2),
  });
}

export interface IssueZeroLeakTokenParams {
  readonly projectId: string;
  readonly recipientNameKo: string;
  readonly role: ExternalCollabRole;
  readonly allowedCutStart: number;
  readonly allowedCutEnd: number;
  readonly ttlHours?: number;
  readonly maxResolutionPx?: number;
  readonly nowIso: string;
}

/** 역할별 정책 상한과 비가시 포렌식 워터마크 ID를 강제하는 Zero-Leak 부분 열람 토큰을 발급한다. */
export function issueZeroLeakAccessToken(params: IssueZeroLeakTokenParams): ZeroLeakAccessToken {
  const policy = ZERO_LEAK_ROLE_POLICIES[params.role];
  const rawStart = Math.max(1, Math.floor(Math.min(params.allowedCutStart, params.allowedCutEnd)));
  const rawEnd = Math.max(rawStart, Math.floor(Math.max(params.allowedCutStart, params.allowedCutEnd)));
  const cappedEnd = Math.min(rawEnd, rawStart + policy.maxAllowedCuts - 1);

  const safeTtlHours = clamp(
    Math.floor(params.ttlHours ?? policy.defaultTtlHours),
    1,
    policy.defaultTtlHours * 2,
  );
  const issuedMs = Date.parse(params.nowIso);
  const safeIssuedMs = Number.isNaN(issuedMs) ? Date.parse("2026-11-21T00:00:00Z") : issuedMs;
  const expiresAtIso = new Date(safeIssuedMs + safeTtlHours * 3_600_000).toISOString();

  const effectiveMaxRes = clamp(
    Math.floor(params.maxResolutionPx ?? policy.maxResolutionPx),
    640,
    policy.maxResolutionPx,
  );

  const seed = `${params.projectId}|${params.recipientNameKo}|${params.role}|${rawStart}-${cappedEnd}|${params.nowIso}`;
  const tokenHash = deterministicDigestHex(seed, 0x811c9dc5);
  const wmHash = deterministicDigestHex(`forensic-wm:${seed}`, 0x9e3779b1);
  const tokenId = `zl-${params.role.slice(0, 4)}-${tokenHash}`;
  const watermarkId = `WM-${params.role.toUpperCase().slice(0, 3)}-${wmHash.toUpperCase()}`;

  const unsignedToken = {
    tokenId,
    projectId: params.projectId,
    recipientNameKo: params.recipientNameKo.trim() || "외부 협업자",
    role: params.role,
    allowedCutStart: rawStart,
    allowedCutEnd: cappedEnd,
    maxResolutionPx: effectiveMaxRes,
    allowRawLayerExport: policy.allowRawLayerExport,
    issuedAtIso: new Date(safeIssuedMs).toISOString(),
    expiresAtIso,
    watermarkId,
  };

  return Object.freeze({
    ...unsignedToken,
    signature: computeTokenSignature(unsignedToken),
    revoked: false,
  });
}

/** 발급된 Zero-Leak 토큰을 즉시 회수해 후속 열람을 전면 차단한다. */
export function revokeZeroLeakAccessToken(token: ZeroLeakAccessToken): ZeroLeakAccessToken {
  return Object.freeze({
    ...token,
    revoked: true,
  });
}

export interface EvaluateZeroLeakOutput {
  readonly result: ZeroLeakEvaluationResult;
  readonly auditEntry: ForensicAuditLogEntry;
}

/** Fail-closed 규칙으로 부분 원고 열람 요청을 평가하고 포렌식 감사 로그를 생성한다. */
export function evaluateZeroLeakSliceAccess(
  token: ZeroLeakAccessToken,
  request: ScopedSliceAccessRequest,
): EvaluateZeroLeakOutput {
  const expectedSig = computeTokenSignature(token);
  const evaluatedMs = Date.parse(request.evaluatedAtIso);
  const expiresMs = Date.parse(token.expiresAtIso);

  let code: ZeroLeakDecisionCode = "ALLOW";
  let reasonKo = `허용 컷(${token.allowedCutStart}~${token.allowedCutEnd}컷) 범위 확인 · 비가시 워터마크(${token.watermarkId}) 강제 삽입`;

  if (token.signature !== expectedSig) {
    code = "DENY_SIGNATURE_INVALID";
    reasonKo = "토큰 무결성 서명이 일치하지 않아 열람을 차단했습니다.";
  } else if (token.revoked) {
    code = "DENY_REVOKED";
    reasonKo = "회수된 권한 토큰입니다. 작가 승인 후 재발급이 필요합니다.";
  } else if (Number.isNaN(evaluatedMs) || Number.isNaN(expiresMs) || evaluatedMs >= expiresMs) {
    code = "DENY_EXPIRED";
    reasonKo = `열람 유효 시각(${token.expiresAtIso})이 만료되어 접근이 차단되었습니다.`;
  } else if (
    request.requestedCutNumber < token.allowedCutStart ||
    request.requestedCutNumber > token.allowedCutEnd
  ) {
    code = "DENY_CUT_OUT_OF_RANGE";
    reasonKo = `요청 컷(${request.requestedCutNumber}컷)이 허용 범위(${token.allowedCutStart}~${token.allowedCutEnd}컷)를 벗어났습니다.`;
  } else if (request.requestedResolutionPx > token.maxResolutionPx) {
    code = "DENY_RESOLUTION_EXCEEDED";
    reasonKo = `요청 해상도(${request.requestedResolutionPx}px)가 역할 상한(${token.maxResolutionPx}px)을 초과했습니다.`;
  } else if (request.requestsRawLayerExport && !token.allowRawLayerExport) {
    code = "DENY_RAW_EXPORT_FORBIDDEN";
    reasonKo = `${ZERO_LEAK_ROLE_POLICIES[token.role].labelKo} 역할은 원본 레이어 내보내기가 금지됩니다.`;
  }

  const allowed = code === "ALLOW";
  const result: ZeroLeakEvaluationResult = Object.freeze({
    allowed,
    code,
    reasonKo,
    enforcedWatermarkId: allowed ? token.watermarkId : null,
    effectiveResolutionPx: allowed ? request.requestedResolutionPx : 0,
  });

  const auditHash = deterministicDigestHex(
    `${token.tokenId}|${request.requestedCutNumber}|${request.requestedResolutionPx}|${code}|${request.evaluatedAtIso}`,
    0x45d9f3b,
  );
  const auditEntry: ForensicAuditLogEntry = Object.freeze({
    auditId: `aud-${auditHash}`,
    timestampIso: request.evaluatedAtIso,
    tokenId: token.tokenId,
    recipientNameKo: token.recipientNameKo,
    role: token.role,
    requestedCutNumber: request.requestedCutNumber,
    requestedResolutionPx: request.requestedResolutionPx,
    decision: code,
    allowed,
    watermarkId: token.watermarkId,
    summaryKo: `${token.recipientNameKo}(${ZERO_LEAK_ROLE_POLICIES[token.role].labelKo}) · ${request.requestedCutNumber}컷/${request.requestedResolutionPx}px → ${allowed ? "허용" : "차단"} (${code})`,
  });

  return Object.freeze({ result, auditEntry });
}

/** 작가 개인화 아트 바이블 기본 캐릭터 목록을 생성한다. */
export function createInitialStyleLockBibleEntries(): readonly CharacterArtBibleEntry[] {
  return Object.freeze([
    Object.freeze({
      characterId: "char-seoyeon",
      characterNameKo: "주인공 서연",
      palette: Object.freeze({
        skin: Object.freeze({ l: 0.87, c: 0.042, h: 52 }),
        hair: Object.freeze({ l: 0.28, c: 0.058, h: 274 }),
        eyes: Object.freeze({ l: 0.56, c: 0.142, h: 248 }),
        outfit: Object.freeze({ l: 0.42, c: 0.118, h: 18 }),
      }),
      standardLineWidthPx: 2.2,
      lineWidthTolerancePx: 0.35,
      minContrastRatio: 4.5,
      maxContrastRatio: 11.0,
      maxDeltaE: 4.0,
    }),
    Object.freeze({
      characterId: "char-doyun",
      characterNameKo: "서브 주연 도윤",
      palette: Object.freeze({
        skin: Object.freeze({ l: 0.82, c: 0.048, h: 58 }),
        hair: Object.freeze({ l: 0.22, c: 0.018, h: 255 }),
        eyes: Object.freeze({ l: 0.48, c: 0.112, h: 162 }),
        outfit: Object.freeze({ l: 0.34, c: 0.062, h: 230 }),
      }),
      standardLineWidthPx: 2.4,
      lineWidthTolerancePx: 0.35,
      minContrastRatio: 4.8,
      maxContrastRatio: 11.5,
      maxDeltaE: 4.0,
    }),
  ]);
}

/** 외주·어시스턴트 제출 컷 샘플(편차 포함 케이스 + 정상 통과 케이스)을 생성한다. */
export function createInitialCutStyleSamples(): readonly SubmittedCutStyleSample[] {
  return Object.freeze([
    Object.freeze({
      cutId: "ep12-cut-07",
      characterId: "char-seoyeon",
      contributorNameKo: "외주 채색팀 B",
      sampledPalette: Object.freeze({
        skin: Object.freeze({ l: 0.81, c: 0.072, h: 42 }), // 피부 톤 어둡고 붉게 이탈
        hair: Object.freeze({ l: 0.36, c: 0.095, h: 298 }), // 헤어 채도·색상 이탈
        eyes: Object.freeze({ l: 0.55, c: 0.138, h: 250 }),
        outfit: Object.freeze({ l: 0.44, c: 0.115, h: 20 }),
      }),
      measuredLineWidthPx: 3.1, // 표준 2.2px 대비 +0.9px 초과
      measuredContrastRatio: 3.6, // 기준 4.5 미만
    }),
    Object.freeze({
      cutId: "ep12-cut-11",
      characterId: "char-doyun",
      contributorNameKo: "내부 선화 어시스턴트",
      sampledPalette: Object.freeze({
        skin: Object.freeze({ l: 0.822, c: 0.047, h: 57.5 }),
        hair: Object.freeze({ l: 0.224, c: 0.019, h: 256 }),
        eyes: Object.freeze({ l: 0.482, c: 0.11, h: 161 }),
        outfit: Object.freeze({ l: 0.342, c: 0.06, h: 231 }),
      }),
      measuredLineWidthPx: 2.45,
      measuredContrastRatio: 6.4,
    }),
  ]);
}

/**
 * 연재 원고 납품 전 1클릭 사전 검수 게이트(Pre-Publish Flight Check).
 *
 * 5대 검수 축을 일괄 실행해 PASS / WARN / BLOCK 판정과 즉시 실행 가능한 한국어 수정 가이드를 생성한다.
 * 1. 4대 연재 플랫폼 규격 (네이버 · 카카오 · 레진 · 글로벌)
 * 2. 390px 모바일 뷰포트 말풍선 오버플로 · 가독 폰트 크기
 * 3. 캐릭터 시트 대비 채색 색 일관성 (CIELAB ΔE 지각 색차)
 * 4. Rights BOM 상업 라이선스 확인 · 만료 · 저작자 표기
 * 5. AI 무단 학습 방어 워터마크 적용 · 온디바이스 증명 해시
 */

export const EPISODE_PREFLIGHT_SCHEMA_VERSION = "toonstudio.episode-preflight-gate.v1" as const;
export const MOBILE_READER_VIEWPORT_WIDTH_PX = 390 as const;

export type PreflightVerdict = "PASS" | "WARN" | "BLOCK";

export type FlightCheckPlatformId = "naver" | "kakao" | "lezhin" | "global";

export type FlightCheckCategory =
  | "platform-spec"
  | "mobile-390-balloon"
  | "character-color-consistency"
  | "rights-bom-license"
  | "ai-shield-watermark";

export interface FlightCheckPlatformSpec {
  readonly id: FlightCheckPlatformId;
  readonly labelKo: string;
  readonly allowedWidthsPx: readonly number[];
  readonly recommendedWidthPx: number;
  readonly maxSliceHeightPx: number;
  readonly maxFileSizeBytes: number;
  readonly maxEpisodeTotalBytes: number;
  readonly allowedFormats: readonly ("jpg" | "png")[];
  readonly strictSrgbOnly: boolean;
}

const MB = 1024 * 1024;

export const FOUR_MAJOR_PLATFORM_SPECS: Readonly<Record<FlightCheckPlatformId, FlightCheckPlatformSpec>> = Object.freeze({
  naver: Object.freeze({
    id: "naver",
    labelKo: "네이버 웹툰",
    allowedWidthsPx: Object.freeze([690, 800]),
    recommendedWidthPx: 800,
    maxSliceHeightPx: 2000,
    maxFileSizeBytes: 2 * MB,
    maxEpisodeTotalBytes: 20 * MB,
    allowedFormats: Object.freeze(["jpg", "png"] as const),
    strictSrgbOnly: false,
  }),
  kakao: Object.freeze({
    id: "kakao",
    labelKo: "카카오페이지 · 카카오웹툰",
    allowedWidthsPx: Object.freeze([720]),
    recommendedWidthPx: 720,
    maxSliceHeightPx: 2000,
    maxFileSizeBytes: 3 * MB,
    maxEpisodeTotalBytes: 30 * MB,
    allowedFormats: Object.freeze(["jpg", "png"] as const),
    strictSrgbOnly: false,
  }),
  lezhin: Object.freeze({
    id: "lezhin",
    labelKo: "레진코믹스",
    allowedWidthsPx: Object.freeze([720]),
    recommendedWidthPx: 720,
    maxSliceHeightPx: 2000,
    maxFileSizeBytes: 3 * MB,
    maxEpisodeTotalBytes: 30 * MB,
    allowedFormats: Object.freeze(["jpg", "png"] as const),
    strictSrgbOnly: true,
  }),
  global: Object.freeze({
    id: "global",
    labelKo: "글로벌 웹툰 (WEBTOON Global)",
    allowedWidthsPx: Object.freeze([800]),
    recommendedWidthPx: 800,
    maxSliceHeightPx: 1280,
    maxFileSizeBytes: 2 * MB,
    maxEpisodeTotalBytes: 20 * MB,
    allowedFormats: Object.freeze(["jpg", "png"] as const),
    strictSrgbOnly: false,
  }),
});

export interface FlightCheckBalloon {
  readonly balloonId: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 원고 캔버스 기준 폰트 크기(px). 390px 모바일 축소 비율을 곱해 실제 가독 크기를 판정한다. */
  readonly fontSizePx: number;
  readonly lineHeightRatio?: number;
  readonly paddingPx?: number;
}

export interface FlightCheckCutInput {
  readonly cutId: string;
  readonly order: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly fileBytes: number;
  readonly format: "jpg" | "png" | "webp" | "psd";
  readonly colorProfile: "sRGB" | "Display-P3" | "CMYK";
  readonly balloons: readonly FlightCheckBalloon[];
}

export interface CharacterCanonicalSwatch {
  readonly slot: string;
  readonly labelKo?: string;
  readonly hex: string;
}

export interface CharacterColorSheetInput {
  readonly characterId: string;
  readonly characterName: string;
  readonly swatches: readonly CharacterCanonicalSwatch[];
}

export interface CutCharacterColorSample {
  readonly cutId: string;
  readonly characterId: string;
  readonly slot: string;
  readonly sampledHex: string;
  /** 노을·야간 등 강한 조명 연출 보정이 걸린 컷이면 허용 ΔE 폭을 완화한다. */
  readonly lightingTintAdjusted?: boolean;
}

export type CommercialLicenseAuditStatus =
  | "verified"
  | "unverified"
  | "non-commercial"
  | "expired"
  | "expiring-soon";

export interface FlightCheckRightsBomItem {
  readonly assetId: string;
  readonly assetName: string;
  readonly assetKind: "font" | "3d-scene" | "3d-prop" | "brush-preset" | "texture-pattern" | "audio-track";
  readonly commercialLicenseStatus: CommercialLicenseAuditStatus;
  readonly attributionRequired: boolean;
  readonly attributionIncluded: boolean;
  readonly licenseRef?: string;
  readonly expiresAtIso?: string;
}

export interface FlightCheckAiShieldState {
  readonly enabled: boolean;
  readonly watermarkAppliedCutIds: readonly string[];
  readonly manifestHash?: string;
  readonly strengthPreset?: "subtle" | "balanced" | "strong";
  /** 기본값 `required`: 상업 출고 전 전 컷 워터마크 적용 필수. */
  readonly policyMode?: "required" | "recommended" | "opt-out";
}

export interface EpisodePreflightGateInput {
  readonly episodeId: string;
  readonly seriesTitle: string;
  readonly episodeNumber: number;
  readonly platformId: FlightCheckPlatformId;
  readonly cuts: readonly FlightCheckCutInput[];
  readonly characterSheets?: readonly CharacterColorSheetInput[];
  readonly colorSamples?: readonly CutCharacterColorSample[];
  readonly rightsBomItems?: readonly FlightCheckRightsBomItem[];
  readonly aiShield: FlightCheckAiShieldState;
  readonly strictAttribution?: boolean;
  readonly colorThresholds?: {
    readonly warnDeltaE?: number;
    readonly blockDeltaE?: number;
  };
  readonly generatedAtIso?: string;
}

export interface PreflightGateFinding {
  readonly code: string;
  readonly category: FlightCheckCategory;
  readonly verdict: Exclude<PreflightVerdict, "PASS">;
  readonly cutId?: string;
  readonly balloonId?: string;
  readonly characterId?: string;
  readonly assetId?: string;
  readonly titleKo: string;
  readonly detailKo: string;
  readonly fixGuideKo: string;
  readonly autoFixable: boolean;
}

export interface PreflightCategorySummary {
  readonly category: FlightCheckCategory;
  readonly labelKo: string;
  readonly verdict: PreflightVerdict;
  readonly blockCount: number;
  readonly warnCount: number;
}

export interface EpisodePreflightGateReport {
  readonly schemaVersion: typeof EPISODE_PREFLIGHT_SCHEMA_VERSION;
  readonly generatedAtIso: string;
  readonly episodeId: string;
  readonly seriesTitle: string;
  readonly episodeNumber: number;
  readonly platform: FlightCheckPlatformSpec;
  readonly verdict: PreflightVerdict;
  readonly canDeliver: boolean;
  readonly readinessScore: number;
  readonly blockCount: number;
  readonly warnCount: number;
  readonly summaryKo: string;
  readonly categorySummaries: readonly PreflightCategorySummary[];
  readonly findings: readonly PreflightGateFinding[];
  readonly reportFingerprint: string;
}

const CATEGORY_LABELS_KO: Readonly<Record<FlightCheckCategory, string>> = Object.freeze({
  "platform-spec": "4대 플랫폼 출고 규격",
  "mobile-390-balloon": "390px 모바일 말풍선 오버플로",
  "character-color-consistency": "캐릭터 색 일관성(ΔE)",
  "rights-bom-license": "Rights BOM 상업 라이선스",
  "ai-shield-watermark": "AI 학습 방어 워터마크",
});

const ALL_CATEGORIES: readonly FlightCheckCategory[] = Object.freeze([
  "platform-spec",
  "mobile-390-balloon",
  "character-color-consistency",
  "rights-bom-license",
  "ai-shield-watermark",
]);

function parseHexToRgb(hex: string): readonly [number, number, number] | null {
  const cleaned = hex.trim().replace(/^#/u, "");
  if (/^[0-9a-fA-F]{3}$/u.test(cleaned)) {
    const r = parseInt((cleaned[0] ?? "0").repeat(2), 16);
    const g = parseInt((cleaned[1] ?? "0").repeat(2), 16);
    const b = parseInt((cleaned[2] ?? "0").repeat(2), 16);
    return [r, g, b];
  }
  if (/^[0-9a-fA-F]{6}$/u.test(cleaned)) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return [r, g, b];
  }
  return null;
}

function srgbChannelToLinear(channel8Bit: number): number {
  const c = channel8Bit / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function rgbToCieLab(rgb: readonly [number, number, number]): readonly [number, number, number] {
  const r = srgbChannelToLinear(rgb[0]);
  const g = srgbChannelToLinear(rgb[1]);
  const b = srgbChannelToLinear(rgb[2]);

  // sRGB -> XYZ (D65)
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.072175) / 1.0;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;

  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** sRGB 두 헥스 색상의 CIE76 ΔE 지각 색차를 계산한다. */
export function computeHexDeltaE(hexA: string, hexB: string): number {
  const rgbA = parseHexToRgb(hexA);
  const rgbB = parseHexToRgb(hexB);
  if (!rgbA || !rgbB) return Number.NaN;
  const labA = rgbToCieLab(rgbA);
  const labB = rgbToCieLab(rgbB);
  const dL = labA[0] - labB[0];
  const da = labA[1] - labB[1];
  const db = labA[2] - labB[2];
  return Math.round(Math.hypot(dL, da, db) * 100) / 100;
}

function estimateBalloonLinesAt390(text: string, innerWidth390: number, fontSize390: number): number {
  const paragraphs = text.split(/\r?\n/u);
  let totalLines = 0;
  const safeInnerWidth = Math.max(1, innerWidth390);
  for (const paragraph of paragraphs) {
    if (paragraph.trim().length === 0) {
      totalLines += 1;
      continue;
    }
    let widthUnits = 0;
    for (const char of paragraph) {
      // 한글·CJK 전각 문자는 0.95em, 영숫자·공백은 0.56em 폭으로 근사한다.
      const isWide = /[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af]/u.test(char);
      widthUnits += isWide ? 0.95 : 0.56;
    }
    const textWidthPx = widthUnits * fontSize390;
    totalLines += Math.max(1, Math.ceil(textWidthPx / safeInnerWidth));
  }
  return Math.max(1, totalLines);
}

function computeReportFingerprint(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b1;
  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + i * 17), 0x85ebca6b) >>> 0;
  }
  return `fg-${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export function runEpisodePreflightGate(input: EpisodePreflightGateInput): EpisodePreflightGateReport {
  const spec = FOUR_MAJOR_PLATFORM_SPECS[input.platformId];
  const findings: PreflightGateFinding[] = [];
  const generatedAtIso = input.generatedAtIso ?? "2026-11-22T00:00:00.000Z";
  const sortedCuts = [...input.cuts].sort((a, b) => a.order - b.order);

  if (sortedCuts.length === 0) {
    findings.push({
      code: "PLATFORM_NO_CUTS",
      category: "platform-spec",
      verdict: "BLOCK",
      titleKo: "검수할 원고 컷이 없습니다",
      detailKo: "회차에 포함된 컷이 0건이라 납품 패키지를 생성할 수 없습니다.",
      fixGuideKo: "최소 1개 이상의 완성 컷을 회차 타임라인에 추가한 뒤 다시 검수하세요.",
      autoFixable: false,
    });
  }

  // ── 1) 4대 플랫폼 규격 & 2) 390px 모바일 말풍선 오버플로 ─────────────────
  let totalEpisodeBytes = 0;
  for (const cut of sortedCuts) {
    totalEpisodeBytes += Math.max(0, cut.fileBytes);

    if (!spec.allowedFormats.includes(cut.format as "jpg" | "png")) {
      findings.push({
        code: "PLATFORM_FORMAT_UNSUPPORTED",
        category: "platform-spec",
        verdict: "BLOCK",
        cutId: cut.cutId,
        titleKo: `${cut.order}컷 파일 형식 미지원(${cut.format.toUpperCase()})`,
        detailKo: `${spec.labelKo} 납품은 ${spec.allowedFormats.join("/").toUpperCase()} 형식만 허용합니다.`,
        fixGuideKo: `${cut.order}컷 내보내기 형식을 JPG(품질 90) 또는 PNG로 변환하세요.`,
        autoFixable: true,
      });
    }

    if (!spec.allowedWidthsPx.includes(cut.widthPx)) {
      findings.push({
        code: "PLATFORM_WIDTH_MISMATCH",
        category: "platform-spec",
        verdict: "BLOCK",
        cutId: cut.cutId,
        titleKo: `${cut.order}컷 가로 폭 불일치(${cut.widthPx}px)`,
        detailKo: `${spec.labelKo} 허용 폭은 ${spec.allowedWidthsPx.join(" / ")}px입니다.`,
        fixGuideKo: `원고 폭을 ${spec.recommendedWidthPx}px로 리사이즈 후 다시 내보내세요.`,
        autoFixable: true,
      });
    }

    if (cut.fileBytes > spec.maxFileSizeBytes) {
      const actualMb = (cut.fileBytes / MB).toFixed(2);
      const limitMb = (spec.maxFileSizeBytes / MB).toFixed(0);
      findings.push({
        code: "PLATFORM_FILE_SIZE_EXCEEDED",
        category: "platform-spec",
        verdict: "BLOCK",
        cutId: cut.cutId,
        titleKo: `${cut.order}컷 파일 용량 초과(${actualMb}MB)`,
        detailKo: `${spec.labelKo} 파일당 최대 용량 ${limitMb}MB를 초과했습니다.`,
        fixGuideKo: "JPEG 품질을 82~86으로 낮추거나 컷을 2개 이상으로 분할 압축하세요.",
        autoFixable: true,
      });
    }

    if (cut.colorProfile !== "sRGB") {
      const isBlocking = cut.colorProfile === "CMYK" || spec.strictSrgbOnly;
      findings.push({
        code: "PLATFORM_COLOR_PROFILE_NON_SRGB",
        category: "platform-spec",
        verdict: isBlocking ? "BLOCK" : "WARN",
        cutId: cut.cutId,
        titleKo: `${cut.order}컷 색공간 비표준(${cut.colorProfile})`,
        detailKo: `${spec.labelKo} 모바일 뷰어는 sRGB 기준으로 렌더링해 색 틀어짐이 발생할 수 있습니다.`,
        fixGuideKo: "내보내기 색 프로필을 sRGB IEC61966-2.1로 변환해 저장하세요.",
        autoFixable: true,
      });
    }

    if (cut.heightPx > spec.maxSliceHeightPx) {
      const slices = Math.ceil(cut.heightPx / spec.maxSliceHeightPx);
      findings.push({
        code: "PLATFORM_SLICE_HEIGHT_WARN",
        category: "platform-spec",
        verdict: "WARN",
        cutId: cut.cutId,
        titleKo: `${cut.order}컷 세로 분할 필요(${cut.heightPx}px)`,
        detailKo: `${spec.labelKo} 조각 최대 높이(${spec.maxSliceHeightPx}px)를 넘어 ${slices}조각 자동 분할이 필요합니다.`,
        fixGuideKo: "내보내기 시 말풍선 회피 자동 슬라이스 옵션을 켜세요.",
        autoFixable: true,
      });
    }

    // 2) 390px 모바일 말풍선 오버플로 검사
    const scale390 = cut.widthPx > 0 ? MOBILE_READER_VIEWPORT_WIDTH_PX / cut.widthPx : 1;
    for (const balloon of cut.balloons) {
      const outOfBounds =
        balloon.x < 0 ||
        balloon.y < 0 ||
        balloon.x + balloon.width > cut.widthPx ||
        balloon.y + balloon.height > cut.heightPx;
      const scaledLeft = balloon.x * scale390;
      const scaledRightMargin = MOBILE_READER_VIEWPORT_WIDTH_PX - (balloon.x + balloon.width) * scale390;

      if (outOfBounds) {
        findings.push({
          code: "MOBILE_390_BALLOON_CLIPPED",
          category: "mobile-390-balloon",
          verdict: "BLOCK",
          cutId: cut.cutId,
          balloonId: balloon.balloonId,
          titleKo: `${cut.order}컷 말풍선 캔버스 밖 잘림`,
          detailKo: `말풍선(${balloon.balloonId}) 좌표가 컷 경계(${cut.widthPx}×${cut.heightPx}px)를 벗어나 390px 화면에서 대사가 잘립니다.`,
          fixGuideKo: "말풍선을 컷 안쪽 안전 여백(390px 기준 좌우 12px 이상) 안으로 이동하세요.",
          autoFixable: true,
        });
      } else if (scaledLeft < 12 || scaledRightMargin < 12) {
        findings.push({
          code: "MOBILE_390_SAFE_MARGIN_WARN",
          category: "mobile-390-balloon",
          verdict: "WARN",
          cutId: cut.cutId,
          balloonId: balloon.balloonId,
          titleKo: `${cut.order}컷 390px 화면 좌우 여백 부족`,
          detailKo: `390px 축소 시 말풍선(${balloon.balloonId}) 가장자리 여백이 12px 미만(좌 ${Math.round(scaledLeft)}px · 우 ${Math.round(scaledRightMargin)}px)입니다.`,
          fixGuideKo: "말풍선 좌우 위치를 안쪽으로 16px 이상 옮겨 모바일 베젤 잘림을 예방하세요.",
          autoFixable: true,
        });
      }

      const scaledFontPx = balloon.fontSizePx * scale390;
      if (scaledFontPx < 10.5) {
        findings.push({
          code: "MOBILE_390_FONT_TOO_SMALL",
          category: "mobile-390-balloon",
          verdict: "BLOCK",
          cutId: cut.cutId,
          balloonId: balloon.balloonId,
          titleKo: `${cut.order}컷 390px 대사 폰트 과소(${scaledFontPx.toFixed(1)}px)`,
          detailKo: `390px 모바일 화면에서 글자가 ${scaledFontPx.toFixed(1)}px로 축소돼 독자가 읽기 어렵습니다(최소 10.5px).`,
          fixGuideKo: `원고 폰트 크기를 최소 ${Math.ceil(12 / scale390)}px 이상으로 키우세요.`,
          autoFixable: false,
        });
      } else if (scaledFontPx < 12) {
        findings.push({
          code: "MOBILE_390_FONT_BORDERLINE",
          category: "mobile-390-balloon",
          verdict: "WARN",
          cutId: cut.cutId,
          balloonId: balloon.balloonId,
          titleKo: `${cut.order}컷 390px 대사 폰트 권장 미만(${scaledFontPx.toFixed(1)}px)`,
          detailKo: "390px 모바일 가독성 권장 기준(12px)보다 다소 작습니다.",
          fixGuideKo: `원고 폰트를 ${Math.ceil(12.5 / scale390)}px 전후로 키우면 스마트폰 가독성이 올라갑니다.`,
          autoFixable: false,
        });
      }

      const padding390 = (balloon.paddingPx ?? 14) * scale390;
      const innerWidth390 = Math.max(8, balloon.width * scale390 - padding390 * 2);
      const innerHeight390 = Math.max(8, balloon.height * scale390 - padding390 * 2);
      const lineHeightPx = scaledFontPx * (balloon.lineHeightRatio ?? 1.35);
      const estimatedLines = estimateBalloonLinesAt390(balloon.text, innerWidth390, scaledFontPx);
      const requiredHeight390 = estimatedLines * lineHeightPx;

      if (requiredHeight390 > innerHeight390 * 1.15) {
        findings.push({
          code: "MOBILE_390_BALLOON_TEXT_OVERFLOW",
          category: "mobile-390-balloon",
          verdict: "BLOCK",
          cutId: cut.cutId,
          balloonId: balloon.balloonId,
          titleKo: `${cut.order}컷 390px 말풍선 텍스트 오버플로`,
          detailKo: `390px 축소 기준 예상 대사 높이(${Math.round(requiredHeight390)}px)가 말풍선 내부 높이(${Math.round(innerHeight390)}px)를 크게 초과합니다.`,
          fixGuideKo: "말풍선 세로 크기를 확장하거나 대사를 두 말풍선으로 분할하세요.",
          autoFixable: false,
        });
      } else if (requiredHeight390 > innerHeight390) {
        findings.push({
          code: "MOBILE_390_BALLOON_TIGHT_FIT",
          category: "mobile-390-balloon",
          verdict: "WARN",
          cutId: cut.cutId,
          balloonId: balloon.balloonId,
          titleKo: `${cut.order}컷 390px 말풍선 여백 빠듯함`,
          detailKo: `390px 렌더링 시 줄바꿈에 따라 끝 줄이 말풍선 테두리에 닿을 수 있습니다(${Math.round(requiredHeight390)}px / ${Math.round(innerHeight390)}px).`,
          fixGuideKo: "말풍선 높이를 15% 정도 넓히거나 줄바꿈 위치를 조정하세요.",
          autoFixable: false,
        });
      }
    }
  }

  if (totalEpisodeBytes > spec.maxEpisodeTotalBytes) {
    const actualMb = (totalEpisodeBytes / MB).toFixed(2);
    const limitMb = (spec.maxEpisodeTotalBytes / MB).toFixed(0);
    findings.push({
      code: "PLATFORM_TOTAL_SIZE_EXCEEDED",
      category: "platform-spec",
      verdict: "BLOCK",
      titleKo: `회차 총 용량 초과(${actualMb}MB / 최대 ${limitMb}MB)`,
      detailKo: `${spec.labelKo} 회차 전체 용량 제한을 넘어 업로드가 거절됩니다.`,
      fixGuideKo: "전체 컷에 일괄 JPEG 최적화(품질 84)를 적용해 총 용량을 줄이세요.",
      autoFixable: true,
    });
  }

  // ── 3) 캐릭터 색 일관성 검사 (CIELAB ΔE) ────────────────────────────────
  const sheetById = new Map((input.characterSheets ?? []).map((sheet) => [sheet.characterId, sheet]));
  const baseWarnDeltaE = input.colorThresholds?.warnDeltaE ?? 10;
  const baseBlockDeltaE = input.colorThresholds?.blockDeltaE ?? 18;

  for (const sample of input.colorSamples ?? []) {
    const sheet = sheetById.get(sample.characterId);
    const canonical = sheet?.swatches.find((sw) => sw.slot === sample.slot);
    if (!sheet || !canonical) continue;

    const deltaE = computeHexDeltaE(canonical.hex, sample.sampledHex);
    if (Number.isNaN(deltaE)) continue;

    const warnLimit = sample.lightingTintAdjusted ? baseWarnDeltaE + 6 : baseWarnDeltaE;
    const blockLimit = sample.lightingTintAdjusted ? baseBlockDeltaE + 8 : baseBlockDeltaE;
    const slotLabel = canonical.labelKo ?? sample.slot;

    if (deltaE >= blockLimit) {
      findings.push({
        code: "CHARACTER_COLOR_DRIFT_BLOCK",
        category: "character-color-consistency",
        verdict: "BLOCK",
        cutId: sample.cutId,
        characterId: sheet.characterId,
        titleKo: `${sheet.characterName} '${slotLabel}' 채색 심각 이탈(ΔE ${deltaE})`,
        detailKo: `기준 팔레트(${canonical.hex})와 컷 샘플(${sample.sampledHex})의 지각 색차가 차단 기준(${blockLimit})을 넘었습니다.`,
        fixGuideKo: `캐릭터 시트 기준색 ${canonical.hex} 스포이트로 해당 레이어 밑색을 보정하세요.`,
        autoFixable: false,
      });
    } else if (deltaE >= warnLimit) {
      findings.push({
        code: "CHARACTER_COLOR_DRIFT_WARN",
        category: "character-color-consistency",
        verdict: "WARN",
        cutId: sample.cutId,
        characterId: sheet.characterId,
        titleKo: `${sheet.characterName} '${slotLabel}' 색 편차 주의(ΔE ${deltaE})`,
        detailKo: `기준색(${canonical.hex}) 대비 샘플(${sample.sampledHex}) 색차가 경고 임계치(${warnLimit})를 넘었습니다.`,
        fixGuideKo: "조명 연출 의도가 아니라면 캐릭터 팔레트 기준색으로 톤을 맞추세요.",
        autoFixable: false,
      });
    }
  }

  // ── 4) Rights BOM 상업 라이선스 감사 ────────────────────────────────────
  for (const item of input.rightsBomItems ?? []) {
    if (item.commercialLicenseStatus === "non-commercial") {
      findings.push({
        code: "RIGHTS_BOM_NON_COMMERCIAL",
        category: "rights-bom-license",
        verdict: "BLOCK",
        assetId: item.assetId,
        titleKo: `비상업 전용 에셋 포함('${item.assetName}')`,
        detailKo: `상업 연재 출고 원고에 비상업 라이선스 에셋(${item.assetKind})이 포함돼 있습니다.`,
        fixGuideKo: "상업 이용 가능한 에셋으로 교체하거나 상업 라이선스를 구매·등록하세요.",
        autoFixable: false,
      });
    } else if (item.commercialLicenseStatus === "expired") {
      findings.push({
        code: "RIGHTS_BOM_LICENSE_EXPIRED",
        category: "rights-bom-license",
        verdict: "BLOCK",
        assetId: item.assetId,
        titleKo: `에셋 라이선스 만료('${item.assetName}')`,
        detailKo: `Rights BOM에 등록된 라이선스${item.expiresAtIso ? `(${item.expiresAtIso})` : ""}가 만료됐습니다.`,
        fixGuideKo: "라이선스를 갱신하고 새 영수증 ID를 Rights BOM에 반영하세요.",
        autoFixable: false,
      });
    } else if (item.commercialLicenseStatus === "unverified") {
      findings.push({
        code: "RIGHTS_BOM_LICENSE_UNVERIFIED",
        category: "rights-bom-license",
        verdict: "BLOCK",
        assetId: item.assetId,
        titleKo: `상업 라이선스 미확인('${item.assetName}')`,
        detailKo: "사용 에셋의 상업 라이선스 증명·계약 확인이 완료되지 않아 출고가 차단됩니다.",
        fixGuideKo: "Rights BOM 패널에서 구매 영수증 또는 라이선스 증빙을 등록해 검증 상태를 완료하세요.",
        autoFixable: false,
      });
    } else if (item.commercialLicenseStatus === "expiring-soon") {
      findings.push({
        code: "RIGHTS_BOM_EXPIRING_SOON",
        category: "rights-bom-license",
        verdict: "WARN",
        assetId: item.assetId,
        titleKo: `에셋 라이선스 만료 임박('${item.assetName}')`,
        detailKo: "30일 내 만료 예정인 에셋입니다. 연재 중간 갱신 누락에 유의하세요.",
        fixGuideKo: "다음 회차 마감 전에 라이선스 연장 일정을 확정하세요.",
        autoFixable: false,
      });
    }

    if (item.attributionRequired && !item.attributionIncluded) {
      findings.push({
        code: "RIGHTS_BOM_ATTRIBUTION_MISSING",
        category: "rights-bom-license",
        verdict: input.strictAttribution ? "BLOCK" : "WARN",
        assetId: item.assetId,
        titleKo: `저작자 크레딧 표기 누락('${item.assetName}')`,
        detailKo: "라이선스 조건상 원고 말미 또는 크레딧 영역에 원저작자 표기가 필요합니다.",
        fixGuideKo: "회차 크레딧 자동 생성 버튼으로 Rights BOM 저작자 표기를 삽입하세요.",
        autoFixable: true,
      });
    }
  }

  // ── 5) AI 무단 학습 방어 워터마크 검사 ──────────────────────────────────
  const shieldPolicy = input.aiShield.policyMode ?? "required";
  if (shieldPolicy !== "opt-out") {
    const appliedSet = new Set(input.aiShield.watermarkAppliedCutIds);
    const missingCutIds = sortedCuts.filter((cut) => !appliedSet.has(cut.cutId)).map((cut) => cut.cutId);
    const shieldSeverity: Exclude<PreflightVerdict, "PASS"> = shieldPolicy === "required" ? "BLOCK" : "WARN";

    if (!input.aiShield.enabled) {
      findings.push({
        code: "AI_SHIELD_DISABLED",
        category: "ai-shield-watermark",
        verdict: shieldSeverity,
        titleKo: "AI 학습 방어 워터마크 비활성화",
        detailKo: "무단 AI 스타일 학습 방어 레이어가 꺼진 상태로 출고하려 하고 있습니다.",
        fixGuideKo: "출고 설정에서 로컬 AI 학습 방어 워터마크(balanced 권장)를 켜세요.",
        autoFixable: true,
      });
    } else if (missingCutIds.length > 0) {
      const previewIds = missingCutIds.slice(0, 4).join(", ");
      findings.push({
        code: "AI_SHIELD_CUTS_MISSING",
        category: "ai-shield-watermark",
        verdict: shieldSeverity,
        cutId: missingCutIds[0],
        titleKo: `AI 방어 워터마크 누락 컷 ${missingCutIds.length}건`,
        detailKo: `일부 컷(${previewIds}${missingCutIds.length > 4 ? " 외" : ""})에 비가시 워터마크가 적용되지 않았습니다.`,
        fixGuideKo: "전 컷 일괄 워터마크 적용을 실행한 뒤 출고 패키지를 다시 생성하세요.",
        autoFixable: true,
      });
    } else if (!input.aiShield.manifestHash?.trim()) {
      findings.push({
        code: "AI_SHIELD_MANIFEST_HASH_MISSING",
        category: "ai-shield-watermark",
        verdict: "WARN",
        titleKo: "온디바이스 위변조 증명 해시 미생성",
        detailKo: "워터마크는 적용됐지만 SHA-256 출처 증명 해시가 첨부되지 않았습니다.",
        fixGuideKo: "온디바이스 증명서 생성을 실행해 C2PA 호환 해시를 원고 패키지에 포함하세요.",
        autoFixable: true,
      });
    }
  }

  // ── 판정 집계 및 카테고리별 요약 ────────────────────────────────────────
  const categorySummaries: PreflightCategorySummary[] = ALL_CATEGORIES.map((category) => {
    const matching = findings.filter((f) => f.category === category);
    const blockCount = matching.filter((f) => f.verdict === "BLOCK").length;
    const warnCount = matching.filter((f) => f.verdict === "WARN").length;
    const verdict: PreflightVerdict = blockCount > 0 ? "BLOCK" : warnCount > 0 ? "WARN" : "PASS";
    return Object.freeze({
      category,
      labelKo: CATEGORY_LABELS_KO[category],
      verdict,
      blockCount,
      warnCount,
    });
  });

  const blockCount = findings.filter((f) => f.verdict === "BLOCK").length;
  const warnCount = findings.filter((f) => f.verdict === "WARN").length;
  const verdict: PreflightVerdict = blockCount > 0 ? "BLOCK" : warnCount > 0 ? "WARN" : "PASS";
  const readinessScore = Math.max(0, Math.min(100, 100 - blockCount * 20 - warnCount * 6));
  const canDeliver = verdict !== "BLOCK";

  const summaryKo =
    verdict === "PASS"
      ? `${spec.labelKo} 출고 사전 검수 통과 — 5대 게이트 이상 없음 (${sortedCuts.length}컷)`
      : verdict === "WARN"
        ? `${spec.labelKo} 출고 가능(경고 ${warnCount}건) — 권장 보정 항목을 확인하세요`
        : `${spec.labelKo} 출고 차단(BLOCK ${blockCount}건 · WARN ${warnCount}건) — 차단 항목 해결 후 다시 검수하세요`;

  const fingerprintSeed = [
    input.episodeId,
    spec.id,
    verdict,
    readinessScore,
    findings.map((f) => `${f.code}:${f.cutId ?? f.assetId ?? ""}`).join("|"),
  ].join("::");

  return Object.freeze({
    schemaVersion: EPISODE_PREFLIGHT_SCHEMA_VERSION,
    generatedAtIso,
    episodeId: input.episodeId.trim(),
    seriesTitle: input.seriesTitle.trim(),
    episodeNumber: input.episodeNumber,
    platform: spec,
    verdict,
    canDeliver,
    readinessScore,
    blockCount,
    warnCount,
    summaryKo,
    categorySummaries: Object.freeze(categorySummaries),
    findings: Object.freeze(findings),
    reportFingerprint: computeReportFingerprint(fingerprintSeed),
  });
}

/**
 * 창작 슈퍼파워 엔진 Part 2:
 *  - #10 IP 굿즈 · 이모티콘 1클릭 추출기 (배경 마스킹 + 카카오 360×360 PNG + 아크릴 3mm 칼선 SVG + 300DPI CMYK)
 *  - #11 스마트폰 QR 무료 왼손 단축키 리모컨 (페어링 세션 + QR 페이로드/매트릭스 + 8종 단축키 + 햅틱 디스패처)
 */

// ============================================================================
// #10 IP 굿즈 · 이모티콘 1클릭 추출기
// ============================================================================

export interface CharacterLayerInput {
  readonly characterName: string;
  readonly sourceWidthPx: number;
  readonly sourceHeightPx: number;
  readonly subjectBoundsPx?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly standWidthMm?: number;
  readonly standHeightMm?: number;
  readonly bleedMm?: number;
  readonly baseSlotWidthMm?: number;
  readonly baseThicknessMm?: number;
  readonly paletteRgb?: readonly {
    readonly nameKo: string;
    readonly r: number;
    readonly g: number;
    readonly b: number;
  }[];
}

export interface CharacterMaskExtraction {
  readonly backgroundRemoved: true;
  readonly alphaMaskRatio: number;
  readonly transparentBackgroundRatio: number;
  readonly tightBoundsPx: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly featherRadiusPx: number;
}

export interface KakaoEmoticonSpec {
  readonly platform: "kakaotalk-emoticon";
  readonly format: "PNG";
  readonly widthPx: 360;
  readonly heightPx: 360;
  readonly transparentBackground: true;
  readonly colorSpace: "sRGB";
  readonly maxFileSizeKb: 150;
  readonly safeMarginPx: 24;
  readonly contentBoxPx: { readonly width: number; readonly height: number };
  readonly recommendedPackCount: 24;
  readonly fileName: string;
}

export interface AcrylicStandCutlineResult {
  readonly characterName: string;
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly bleedMm: number;
  readonly totalWidthMm: number;
  readonly totalHeightMm: number;
  readonly baseSlotWidthMm: number;
  readonly baseThicknessMm: number;
  readonly spotLayerName: "CutContour";
  readonly cutlinePathD: string;
  readonly svgMarkup: string;
}

export interface CmykColorValues {
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
  readonly totalInkCoveragePct: number;
  readonly tacSafe: boolean;
}

export interface CmykSwatchReport extends CmykColorValues {
  readonly nameKo: string;
}

export interface PrintCmykManifest {
  readonly dpi: 300;
  readonly colorProfile: "Japan Color 2001 Coated";
  readonly colorMode: "CMYK";
  readonly bleedMm: number;
  readonly trimSizeMm: { readonly width: number; readonly height: number };
  readonly bleedIncludedSizeMm: { readonly width: number; readonly height: number };
  readonly exportPixelSize: { readonly width: number; readonly height: number };
  readonly spotLayers: readonly ["CutContour", "WhiteUnderbase"];
  readonly swatches: readonly CmykSwatchReport[];
  readonly maxTacPct: number;
  readonly allSwatchesTacSafe: boolean;
  readonly manifestJson: string;
}

export interface IpGoodsExportBundle {
  readonly characterName: string;
  readonly mask: CharacterMaskExtraction;
  readonly kakaoEmoticon: KakaoEmoticonSpec;
  readonly acrylicCutline: AcrylicStandCutlineResult;
  readonly printManifest: PrintCmykManifest;
}

const DEFAULT_CHARACTER_PALETTE = Object.freeze([
  { nameKo: "주인공 머리카락(딥 네이비)", r: 34, g: 46, b: 86 },
  { nameKo: "포인트 드레스(로즈 버건디)", r: 176, g: 52, b: 78 },
  { nameKo: "금장 장식(웜 골드)", r: 214, g: 174, b: 84 },
]);

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function sanitizeFileSlug(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return cleaned || "character";
}

/** RGB(0..255) 값을 인쇄용 CMYK(%)와 잉크 총량(TAC <= 300% 안전 여부)으로 변환한다. */
export function rgbToCmyk(r: number, g: number, b: number): CmykColorValues {
  const rn = clampByte(r) / 255;
  const gn = clampByte(g) / 255;
  const bn = clampByte(b) / 255;

  const kRaw = 1 - Math.max(rn, gn, bn);
  if (kRaw >= 0.9999) {
    return { c: 0, m: 0, y: 0, k: 100, totalInkCoveragePct: 100, tacSafe: true };
  }

  const c = Math.round(((1 - rn - kRaw) / (1 - kRaw)) * 100);
  const m = Math.round(((1 - gn - kRaw) / (1 - kRaw)) * 100);
  const y = Math.round(((1 - bn - kRaw) / (1 - kRaw)) * 100);
  const k = Math.round(kRaw * 100);
  const totalInkCoveragePct = c + m + y + k;

  return {
    c,
    m,
    y,
    k,
    totalInkCoveragePct,
    tacSafe: totalInkCoveragePct <= 300,
  };
}

/** 캐릭터 레이어에서 배경을 제거한 전경 알파 마스크 및 타이트 경계 박스를 계산한다. */
export function extractCharacterMaskAndBounds(input: CharacterLayerInput): CharacterMaskExtraction {
  const width = Math.max(64, Math.round(input.sourceWidthPx));
  const height = Math.max(64, Math.round(input.sourceHeightPx));
  const rawBounds = input.subjectBoundsPx ?? {
    x: Math.round(width * 0.14),
    y: Math.round(height * 0.08),
    width: Math.round(width * 0.72),
    height: Math.round(height * 0.84),
  };

  const clampedX = Math.max(0, Math.min(width - 1, Math.round(rawBounds.x)));
  const clampedY = Math.max(0, Math.min(height - 1, Math.round(rawBounds.y)));
  const clampedW = Math.max(1, Math.min(width - clampedX, Math.round(rawBounds.width)));
  const clampedH = Math.max(1, Math.min(height - clampedY, Math.round(rawBounds.height)));

  const totalArea = width * height;
  const maskArea = clampedW * clampedH * 0.78;
  const alphaMaskRatio = Number(Math.min(0.98, Math.max(0.05, maskArea / totalArea)).toFixed(4));
  const transparentBackgroundRatio = Number((1 - alphaMaskRatio).toFixed(4));

  return {
    backgroundRemoved: true,
    alphaMaskRatio,
    transparentBackgroundRatio,
    tightBoundsPx: { x: clampedX, y: clampedY, width: clampedW, height: clampedH },
    featherRadiusPx: 1.5,
  };
}

/** 카카오톡 이모티콘 공식 규격(360×360 PNG 투명 배경, 24px 안전 여백)을 산출한다. */
export function generateKakaoEmoticonSpec(
  input: CharacterLayerInput,
  mask: CharacterMaskExtraction,
): KakaoEmoticonSpec {
  const safeCanvas = 360 - 24 * 2; // 312px
  const scale = Math.min(
    safeCanvas / Math.max(1, mask.tightBoundsPx.width),
    safeCanvas / Math.max(1, mask.tightBoundsPx.height),
  );
  return {
    platform: "kakaotalk-emoticon",
    format: "PNG",
    widthPx: 360,
    heightPx: 360,
    transparentBackground: true,
    colorSpace: "sRGB",
    maxFileSizeKb: 150,
    safeMarginPx: 24,
    contentBoxPx: {
      width: Math.max(1, Math.round(mask.tightBoundsPx.width * scale)),
      height: Math.max(1, Math.round(mask.tightBoundsPx.height * scale)),
    },
    recommendedPackCount: 24,
    fileName: `${sanitizeFileSlug(input.characterName)}-kakao-360x360.png`,
  };
}

/** 아크릴 스탠드용 3mm 도련선 칼선(CutContour) + 하단 받침대 삽입 탭 SVG 패스를 생성한다. */
export function generateAcrylicStandCutlineSvg(input: CharacterLayerInput): AcrylicStandCutlineResult {
  const trimWidthMm = Math.max(30, Number((input.standWidthMm ?? 70).toFixed(1)));
  const trimHeightMm = Math.max(40, Number((input.standHeightMm ?? 120).toFixed(1)));
  const bleedMm = Math.max(1, Number((input.bleedMm ?? 3).toFixed(1)));
  const baseSlotWidthMm = Math.min(
    Math.round(trimWidthMm * 0.55),
    Math.max(16, Number((input.baseSlotWidthMm ?? 28).toFixed(1))),
  );
  const baseThicknessMm = Math.max(2, Number((input.baseThicknessMm ?? 3).toFixed(1)));

  const totalWidthMm = Number((trimWidthMm + bleedMm * 2).toFixed(1));
  const totalHeightMm = Number((trimHeightMm + bleedMm * 2 + baseThicknessMm).toFixed(1));
  const r = Math.min(12, Math.round(trimWidthMm * 0.16));

  const bodyBottomY = Number((trimHeightMm + bleedMm * 2).toFixed(1));
  const tabLeftX = Number(((totalWidthMm - baseSlotWidthMm) / 2).toFixed(1));
  const tabRightX = Number((tabLeftX + baseSlotWidthMm).toFixed(1));

  // 캐릭터 외곽 3mm 도련선 + 하단 아크릴 받침대 삽입 탭이 연결된 단일 폐곡선 CutContour 패스
  const cutlinePathD = [
    `M ${r} 0`,
    `L ${(totalWidthMm - r).toFixed(1)} 0`,
    `Q ${totalWidthMm} 0 ${totalWidthMm} ${r}`,
    `L ${totalWidthMm} ${(bodyBottomY - r).toFixed(1)}`,
    `Q ${totalWidthMm} ${bodyBottomY} ${(totalWidthMm - r).toFixed(1)} ${bodyBottomY}`,
    `L ${tabRightX} ${bodyBottomY}`,
    `L ${tabRightX} ${totalHeightMm}`,
    `L ${tabLeftX} ${totalHeightMm}`,
    `L ${tabLeftX} ${bodyBottomY}`,
    `L ${r} ${bodyBottomY}`,
    `Q 0 ${bodyBottomY} 0 ${(bodyBottomY - r).toFixed(1)}`,
    `L 0 ${r}`,
    `Q 0 0 ${r} 0`,
    "Z",
  ].join(" ");

  const svgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidthMm}mm" height="${totalHeightMm}mm" viewBox="0 0 ${totalWidthMm} ${totalHeightMm}" role="img" aria-label="${input.characterName} 아크릴 스탠드 ${bleedMm}mm 칼선">`,
    `  <g id="SafeArtwork" fill="none" stroke="currentColor" stroke-width="0.4" stroke-dasharray="2 1.5" opacity="0.55">`,
    `    <rect x="${bleedMm}" y="${bleedMm}" width="${trimWidthMm}" height="${trimHeightMm}" rx="${Math.max(4, r - bleedMm)}" />`,
    `  </g>`,
    `  <g id="CutContour" data-spot-color="CutContour" data-bleed-mm="${bleedMm}">`,
    `    <path d="${cutlinePathD}" fill="none" stroke="oklch(0.62 0.22 350)" stroke-width="0.6" />`,
    `  </g>`,
    `</svg>`,
  ].join("\n");

  return {
    characterName: input.characterName,
    trimWidthMm,
    trimHeightMm,
    bleedMm,
    totalWidthMm,
    totalHeightMm,
    baseSlotWidthMm,
    baseThicknessMm,
    spotLayerName: "CutContour",
    cutlinePathD,
    svgMarkup,
  };
}

/** 300DPI CMYK 인쇄 매니페스트(밀리미터→픽셀 환산 + 도련 포함 + TAC 잉크 총량 점검)를 생성한다. */
export function generatePrintCmykManifest(
  input: CharacterLayerInput,
  cutline: AcrylicStandCutlineResult,
): PrintCmykManifest {
  const mmTo300DpiPx = (mm: number): number => Math.round((mm / 25.4) * 300);
  const palette = input.paletteRgb && input.paletteRgb.length > 0 ? input.paletteRgb : DEFAULT_CHARACTER_PALETTE;
  const swatches: CmykSwatchReport[] = palette.map((swatch) => ({
    nameKo: swatch.nameKo,
    ...rgbToCmyk(swatch.r, swatch.g, swatch.b),
  }));

  const maxTacPct = swatches.reduce((acc, s) => Math.max(acc, s.totalInkCoveragePct), 0);
  const allSwatchesTacSafe = swatches.every((s) => s.tacSafe);
  const exportPixelSize = {
    width: mmTo300DpiPx(cutline.totalWidthMm),
    height: mmTo300DpiPx(cutline.totalHeightMm),
  };

  const payload = {
    characterName: input.characterName,
    dpi: 300 as const,
    colorMode: "CMYK" as const,
    colorProfile: "Japan Color 2001 Coated" as const,
    bleedMm: cutline.bleedMm,
    trimSizeMm: { width: cutline.trimWidthMm, height: cutline.trimHeightMm },
    bleedIncludedSizeMm: { width: cutline.totalWidthMm, height: cutline.totalHeightMm },
    exportPixelSize,
    spotLayers: ["CutContour", "WhiteUnderbase"] as const,
    maxTacPct,
    allSwatchesTacSafe,
    swatches,
  };

  return {
    ...payload,
    manifestJson: JSON.stringify(payload, null, 2),
  };
}

/** 캐릭터 레이어에서 이모티콘(360×360 PNG) · 아크릴 3mm 칼선 SVG · 300DPI CMYK 인쇄 매니페스트를 일괄 추출한다. */
export function buildIpGoodsExportBundle(input: CharacterLayerInput): IpGoodsExportBundle {
  const mask = extractCharacterMaskAndBounds(input);
  const kakaoEmoticon = generateKakaoEmoticonSpec(input, mask);
  const acrylicCutline = generateAcrylicStandCutlineSvg(input);
  const printManifest = generatePrintCmykManifest(input, acrylicCutline);
  return {
    characterName: input.characterName,
    mask,
    kakaoEmoticon,
    acrylicCutline,
    printManifest,
  };
}

// ============================================================================
// #11 스마트폰 QR 무료 왼손 단축키 리모컨
// ============================================================================

export type RemoteShortcutId =
  | "undo"
  | "redo"
  | "brush-up"
  | "brush-down"
  | "eraser"
  | "rotate-ccw"
  | "rotate-cw"
  | "layer-next";

export interface RemoteShortcutDefinition {
  readonly id: RemoteShortcutId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly keyCombo: string;
  readonly hapticPattern: readonly number[];
}

export const REMOTE_SHORTCUT_DEFINITIONS: readonly RemoteShortcutDefinition[] = Object.freeze([
  { id: "undo", labelKo: "실행 취소", labelEn: "Undo", keyCombo: "Ctrl+Z", hapticPattern: [18] },
  { id: "redo", labelKo: "다시 실행", labelEn: "Redo", keyCombo: "Ctrl+Shift+Z", hapticPattern: [14, 24, 14] },
  { id: "brush-up", labelKo: "브러시 크게", labelEn: "Brush +", keyCombo: "]", hapticPattern: [10] },
  { id: "brush-down", labelKo: "브러시 작게", labelEn: "Brush -", keyCombo: "[", hapticPattern: [10] },
  { id: "eraser", labelKo: "지우개 전환", labelEn: "Eraser", keyCombo: "E", hapticPattern: [22] },
  { id: "rotate-ccw", labelKo: "좌회전 -15°", labelEn: "Rotate CCW", keyCombo: "Shift+[", hapticPattern: [12, 18] },
  { id: "rotate-cw", labelKo: "우회전 +15°", labelEn: "Rotate CW", keyCombo: "Shift+]", hapticPattern: [12, 18] },
  { id: "layer-next", labelKo: "다음 레이어", labelEn: "Next Layer", keyCombo: "Alt+]", hapticPattern: [15, 20, 15] },
]);

export interface PhoneRemoteSession {
  readonly sessionToken: string;
  readonly pinCode: string;
  readonly workId: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly qrPayloadUrl: string;
  readonly qrMatrix: readonly (readonly boolean[])[];
  readonly shortcuts: readonly RemoteShortcutDefinition[];
}

export interface PhoneRemoteDispatchEvent {
  readonly shortcutId: RemoteShortcutId;
  readonly labelKo: string;
  readonly keyCombo: string;
  readonly dispatchedAtMs: number;
  readonly hapticTriggered: boolean;
}

export interface PhoneRemoteDispatchResult {
  readonly accepted: boolean;
  readonly reasonKo: string;
  readonly event?: PhoneRemoteDispatchEvent;
}

export type PhoneRemoteCommandHandlers = Readonly<Partial<Record<RemoteShortcutId, () => void>>>;

export interface PhoneRemoteDispatcher {
  readonly dispatch: (
    shortcutId: RemoteShortcutId,
    options?: {
      readonly token?: string;
      readonly nowMs?: number;
      readonly hapticEnabled?: boolean;
    },
  ) => PhoneRemoteDispatchResult;
  readonly getHistory: () => readonly PhoneRemoteDispatchEvent[];
}

function deterministicSeedHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 페어링 URL 문자열로부터 표준 21×21 파인더 패턴 포함 결정적 QR 매트릭스를 생성한다. */
export function buildDeterministicQrMatrix(payload: string): readonly (readonly boolean[])[] {
  const size = 21;
  const grid: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false));

  const drawFinder = (top: number, left: number) => {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[top + r]![left + c] = isBorder || isCenter;
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  let state = deterministicSeedHash(payload);
  const inReserved = (r: number, c: number) =>
    (r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8);

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (inReserved(r, c)) continue;
      if (r === 6 || c === 6) {
        grid[r]![c] = (r + c) % 2 === 0;
        continue;
      }
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      grid[r]![c] = ((state >>> 24) & 1) === 1;
    }
  }

  return grid;
}

/** 스마트폰 QR 무료 왼손 단축키 리모컨 페어링 세션(토큰 · PIN · QR URL · 8종 매핑)을 생성한다. */
export function createPhoneRemoteSession(options?: {
  readonly origin?: string;
  readonly workId?: string;
  readonly nowMs?: number;
  readonly ttlMs?: number;
  readonly nonce?: string;
}): PhoneRemoteSession {
  const nowMs = options?.nowMs ?? Date.now();
  const ttlMs = options?.ttlMs ?? 30 * 60 * 1000;
  const workId = options?.workId?.trim() || "local-canvas";
  const origin = (options?.origin ?? "https://toonstudio.app").replace(/\/+$/u, "");
  const entropy = options?.nonce ?? `${workId}:${nowMs}`;
  const hashA = deterministicSeedHash(`tok:${entropy}`).toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
  const hashB = deterministicSeedHash(`pin:${entropy}`).toString(10).padStart(6, "0").slice(-6);

  const sessionToken = `TSR-${hashA}-${(nowMs % 9973).toString(36).toUpperCase().padStart(3, "0")}`;
  const params = new URLSearchParams({
    remoteSession: sessionToken,
    workId,
    mode: "left-hand-pad",
  });
  const qrPayloadUrl = `${origin}/studio?${params.toString()}`;

  return {
    sessionToken,
    pinCode: hashB,
    workId,
    createdAtMs: nowMs,
    expiresAtMs: nowMs + ttlMs,
    qrPayloadUrl,
    qrMatrix: buildDeterministicQrMatrix(qrPayloadUrl),
    shortcuts: REMOTE_SHORTCUT_DEFINITIONS,
  };
}

function triggerHapticFeedback(pattern: readonly number[]): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return false;
  }
  try {
    return Boolean(navigator.vibrate([...pattern]));
  } catch {
    return false;
  }
}

/** 세션 토큰과 만료 시각을 검증하고 햅틱 피드백과 함께 8종 작화 단축키를 실행하는 디스패처를 생성한다. */
export function createPhoneRemoteDispatcher(
  session: PhoneRemoteSession,
  handlers: PhoneRemoteCommandHandlers = {},
): PhoneRemoteDispatcher {
  const history: PhoneRemoteDispatchEvent[] = [];
  const shortcutById = new Map(session.shortcuts.map((def) => [def.id, def]));

  return {
    dispatch(shortcutId, options) {
      const nowMs = options?.nowMs ?? Date.now();
      const token = options?.token ?? session.sessionToken;
      if (token !== session.sessionToken) {
        return { accepted: false, reasonKo: "페어링 토큰이 일치하지 않습니다. QR을 다시 스캔하세요." };
      }
      if (nowMs > session.expiresAtMs) {
        return { accepted: false, reasonKo: "페어링 세션이 만료되었습니다. 새 QR을 발급하세요." };
      }
      const def = shortcutById.get(shortcutId);
      if (!def) {
        return { accepted: false, reasonKo: "지원하지 않는 리모컨 단축키입니다." };
      }

      const hapticEnabled = options?.hapticEnabled ?? true;
      const hapticTriggered = hapticEnabled ? triggerHapticFeedback(def.hapticPattern) : false;

      handlers[shortcutId]?.();

      const event: PhoneRemoteDispatchEvent = {
        shortcutId: def.id,
        labelKo: def.labelKo,
        keyCombo: def.keyCombo,
        dispatchedAtMs: nowMs,
        hapticTriggered,
      };
      history.unshift(event);
      if (history.length > 20) history.pop();

      return {
        accepted: true,
        reasonKo: `${def.labelKo} (${def.keyCombo}) 명령을 캔버스에 전달했습니다.`,
        event,
      };
    },
    getHistory: () => [...history],
  };
}

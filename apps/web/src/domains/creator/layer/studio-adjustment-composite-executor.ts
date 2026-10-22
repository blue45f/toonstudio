/**
 * studio-adjustment-composite-executor.ts
 *
 * 문서 조정 레이어(AdjustmentEl — PSD 가져오기가 삽입하는 1급 요소)의 픽셀
 * 합성 실행기. 합성 플래너(`planAdjustmentComposite`)와 렌더 트리
 * (`buildStudioLiveAdjustmentRenderTree`의 adjustment-el 접기)가 "어디에
 * 어떤 순서로"를 정하면, 이 모듈이 "픽셀을 실제로 어떻게 바꾸는가"를 맡는다.
 *
 * 배경: 조정 실행 자산은 종류별로 흩어져 있었다 — PSD 확장 10종은
 * `filter/studio-adjustment-executor.ts`가, 레벨·곡선·색상 균형·채널 믹서·
 * 그라디언트 맵은 각자 구조체 파라미터를 받는 전용 톤 엔진이 맡고, 둘 다
 * PSD 변환기가 만든 파라미터 형식과는 직접 맞지 않았다. 이 모듈이 그
 * 번역·디스패치 단일 지점이다:
 *  - levels/curves/color-balance/channel-mixer/gradient-map: PSD 파라미터를
 *    전용 엔진의 구조체로 번역해 위임한다(아래 번역 규칙 참조).
 *  - hsl: 마스터 색조/채도/명도만 적용한다(범위별 조정은 변환 단계 고지대로
 *    파라미터 보존 전용 — B4 대응표의 근사 판정과 일치).
 *  - 마스크: 요소에 실물 마스크 픽셀(maskSrc에서 디코드한 커버리지)이
 *    공급되면 픽셀별 반영 비율에 곱한다. maskHash만으로는 픽셀을 복원할
 *    수 없어 적용 대상이 아니다(아래 AdjustmentMaskCoverage 참조).
 *  - 나머지 10종: 기존 `applyStudioAdjustmentPixels`에 그대로 위임한다.
 *    color-lookup은 내장 .cube 데이터가 있을 때만 true를 돌려주고, 없으면
 *    픽셀을 건드리지 않는다(파라미터만 보존 — 기존 고지 유지).
 *  - lab: 픽셀 실행기가 없어 false — 적용한 척하지 않는다.
 *
 * 비파괴 계약:
 *  - 입력 버퍼·요소·파라미터를 절대 변형하지 않는다. 모든 공개 실행 함수는
 *    새 버퍼를 돌려주고, 조정 레이어를 끄면(hidden/제거) 합성에서 빠지므로
 *    원본 합성이 그대로 복원된다.
 *  - 조정 강도는 spec.opacity, 혼합은 spec.blendMode를 런타임
 *    (`studio-adjustment-layer-runtime.ts`의 패스 합성)과 같은 규칙으로
 *    적용한다: 조정 결과와 조정 전 합성을 blend한 뒤 opacity만큼 섞는다.
 *    모든 조정 적용기는 알파를 보존하므로 알파는 변하지 않는다.
 *
 * 순수·결정적: DOM/Konva에 닿지 않는다.
 */
import {
  applyStudioAdjustmentPixels,
  type StudioAdjustmentParameters,
} from "../filter/studio-adjustment-executor";
import type { StudioAdjustmentKind } from "../filter/studio-adjustment-effect-graph";
import { applyChannelMixer, type ChannelMixer, type MixerChannel } from "../studio-channel-mixer";
import { applyColorBalance, type ColorBalance } from "../studio-color-balance";
import { applyCurveChannels, DEFAULT_CURVE, type CurvePoint } from "../studio-curves";
import type { StudioImageDataLike } from "../studio-filters";
import { applyGradientMap, type GradientMap, type GradientStop } from "../studio-gradient-map";
import { applyLevelsChannels, type LevelsParams } from "../studio-levels";
import { hslToRgb, rgbToHsl } from "../studio-selective-hsl";
import type { El } from "../studio-element-model";
import type { StudioLiveAdjustmentRenderTree } from "../studio-live-adjustment";
import { buildStudioLiveAdjustmentRenderTree } from "../studio-live-adjustment";

import { adjustmentSpecFromEl, type AdjustmentElement } from "./studio-adjustment-layer-elements";

// ── 파라미터 읽기 보조 ────────────────────────────────────────────────────────

function numParam(parameters: StudioAdjustmentParameters, key: string): number | undefined {
  const value = parameters[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

// ── 종류별 번역·적용 ─────────────────────────────────────────────────────────

/**
 * PSD 레벨 파라미터(`${channel}ShadowInput` 등) → 전용 엔진 구조체.
 * 매핑: ShadowInput=blackPoint · HighlightInput=whitePoint ·
 * MidtoneInput=gamma(PSD 중간톤 0.1..9.99, 엔진도 같은 감마 의미론) ·
 * ShadowOutput=outBlack · HighlightOutput=outWhite.
 */
function levelsParamsFor(
  parameters: StudioAdjustmentParameters,
  channel: string,
): Partial<LevelsParams> | undefined {
  const blackPoint = numParam(parameters, `${channel}ShadowInput`);
  const whitePoint = numParam(parameters, `${channel}HighlightInput`);
  const gamma = numParam(parameters, `${channel}MidtoneInput`);
  const outBlack = numParam(parameters, `${channel}ShadowOutput`);
  const outWhite = numParam(parameters, `${channel}HighlightOutput`);
  if (
    blackPoint === undefined && whitePoint === undefined && gamma === undefined
    && outBlack === undefined && outWhite === undefined
  ) {
    return undefined;
  }
  return {
    ...(blackPoint !== undefined ? { blackPoint } : {}),
    ...(whitePoint !== undefined ? { whitePoint } : {}),
    ...(gamma !== undefined ? { gamma } : {}),
    ...(outBlack !== undefined ? { outBlack } : {}),
    ...(outWhite !== undefined ? { outWhite } : {}),
  };
}

function applyLevelsFromPsdParameters(
  img: StudioImageDataLike,
  parameters: StudioAdjustmentParameters,
): void {
  applyLevelsChannels(img, levelsParamsFor(parameters, "rgb") ?? null, {
    r: levelsParamsFor(parameters, "red"),
    g: levelsParamsFor(parameters, "green"),
    b: levelsParamsFor(parameters, "blue"),
  });
}

/** PSD 곡선 파라미터(`${channel}Points` 평탄 [in,out] 배열) → 제어점 배열. */
function curvePointsFor(
  parameters: StudioAdjustmentParameters,
  channel: string,
): CurvePoint[] | undefined {
  const flat = parameters[`${channel}Points`];
  if (!Array.isArray(flat) || flat.length < 2) return undefined;
  const points: CurvePoint[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const x = flat[i];
    const y = flat[i + 1];
    if (typeof x === "number" && typeof y === "number") points.push({ x, y });
  }
  return points.length > 0 ? points : undefined;
}

function applyCurvesFromPsdParameters(
  img: StudioImageDataLike,
  parameters: StudioAdjustmentParameters,
): void {
  applyCurveChannels(img, curvePointsFor(parameters, "rgb") ?? DEFAULT_CURVE, {
    r: curvePointsFor(parameters, "red"),
    g: curvePointsFor(parameters, "green"),
    b: curvePointsFor(parameters, "blue"),
  });
}

/**
 * PSD 색상 균형(`${band}CyanRed` 등) → 전용 엔진 구조체. 축이 1:1이다:
 * CyanRed 양수=빨강 증가, MagentaGreen 양수=초록 증가, YellowBlue 양수=파랑
 * 증가가 Studio 쉬프트(양수=그 채널 증가)와 같다. preserveLuminosity도
 * 엔진 구조체로 그대로 옮긴다 — 엔진이 켜진 경우 쉬프트 후 원본 휘도를
 * 복원한다(`studio-color-balance.ts`의 휘도 보존 규약 참조).
 */
function colorBalanceFromPsdParameters(parameters: StudioAdjustmentParameters): ColorBalance {
  const band = (name: string): [number, number, number] => [
    numParam(parameters, `${name}CyanRed`) ?? 0,
    numParam(parameters, `${name}MagentaGreen`) ?? 0,
    numParam(parameters, `${name}YellowBlue`) ?? 0,
  ];
  return {
    shadows: band("shadows"),
    midtones: band("midtones"),
    highlights: band("highlights"),
    ...(typeof parameters.preserveLuminosity === "boolean"
      ? { preserveLuminosity: parameters.preserveLuminosity }
      : {}),
  };
}

/**
 * PSD 채널 믹서(`${output}FromRed` 등, % 단위) → 전용 엔진 구조체(비율).
 * 단색(monochrome)이면 PSD의 gray 출력 행이 회색 행이므로 red 행 자리에
 * 넣어 엔진의 단색 경로(빨강 행으로 회색 생성)를 탄다.
 */
function channelMixerFromPsdParameters(parameters: StudioAdjustmentParameters): ChannelMixer {
  const row = (output: string, identity: MixerChannel): MixerChannel => {
    const r = numParam(parameters, `${output}FromRed`);
    const g = numParam(parameters, `${output}FromGreen`);
    const b = numParam(parameters, `${output}FromBlue`);
    const constant = numParam(parameters, `${output}Constant`);
    if (r === undefined && g === undefined && b === undefined && constant === undefined) {
      return identity;
    }
    return {
      r: (r ?? identity.r * 100) / 100,
      g: (g ?? identity.g * 100) / 100,
      b: (b ?? identity.b * 100) / 100,
      constant: (constant ?? identity.constant * 100) / 100,
    };
  };
  const identityRed: MixerChannel = { r: 1, g: 0, b: 0, constant: 0 };
  const identityGreen: MixerChannel = { r: 0, g: 1, b: 0, constant: 0 };
  const identityBlue: MixerChannel = { r: 0, g: 0, b: 1, constant: 0 };
  const monochrome = parameters.monochrome === true;
  return {
    red: monochrome ? row("gray", identityRed) : row("red", identityRed),
    green: row("green", identityGreen),
    blue: row("blue", identityBlue),
    monochrome,
  };
}

/**
 * PSD 그라디언트 맵(`stops` = "location:#hex:midpoint" 쉼표 인코딩) →
 * 전용 엔진 구조체. location은 ag-psd 규약 0..4096 척도(전부 1 이하면
 * 0..1 비율로 본다), midpoint는 엔진이 선형 보간이라 실행에 쓰지 않는다
 * (근사 — 대응표 판정과 일치). reverse면 위치를 뒤집는다.
 */
function gradientMapFromPsdParameters(
  parameters: StudioAdjustmentParameters,
): GradientMap | undefined {
  const raw = parameters.stops;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const parsed: { location: number; color: string }[] = [];
  for (const item of raw.split(",")) {
    const [locationRaw, color] = item.split(":");
    const location = Number(locationRaw);
    if (!Number.isFinite(location) || !color || !/^#[0-9a-fA-F]{6}$/.test(color)) continue;
    parsed.push({ location, color });
  }
  if (parsed.length === 0) return undefined;
  const scale = parsed.some((stop) => stop.location > 1) ? 4096 : 1;
  const reverse = parameters.reverse === true;
  const stops: GradientStop[] = parsed.map((stop) => {
    const pos = clamp01(stop.location / scale);
    return { pos: reverse ? 1 - pos : pos, color: stop.color };
  });
  return { stops };
}

/**
 * PSD 색조/채도 마스터(hue -180..180 · saturation/lightness -100..100) 적용.
 * 채도·명도는 Photoshop 규약대로 양수면 남은 여유분 비율, 음수면 현재값
 * 비율로 이동한다. 범위별(`range.*`) 조정은 변환 단계 고지대로 적용하지
 * 않는다(파라미터 보존 전용).
 */
function applyHslMasterFromPsdParameters(
  img: StudioImageDataLike,
  parameters: StudioAdjustmentParameters,
): void {
  const hue = clamp(numParam(parameters, "hue") ?? 0, -180, 180);
  const saturation = clamp(numParam(parameters, "saturation") ?? 0, -100, 100);
  const lightness = clamp(numParam(parameters, "lightness") ?? 0, -100, 100);
  if (hue === 0 && saturation === 0 && lightness === 0) return;
  const shift = (value: number, amount: number): number =>
    amount >= 0 ? value + (1 - value) * (amount / 100) : value + value * (amount / 100);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const hsl = rgbToHsl(data[i]!, data[i + 1]!, data[i + 2]!);
    const rgb = hslToRgb(
      (((hsl.h + hue) % 360) + 360) % 360,
      clamp01(shift(hsl.s, saturation)),
      clamp01(shift(hsl.l, lightness)),
    );
    data[i] = rgb.r;
    data[i + 1] = rgb.g;
    data[i + 2] = rgb.b;
  }
}

/**
 * 조정 종류 1건을 픽셀 버퍼에 제자리 적용한다. 실제로 적용했으면 true.
 * lab와, 데이터가 없어 실행할 수 없는 color-lookup·그라디언트 맵은 픽셀을
 * 건드리지 않고 false — 호출자가 "적용한 척"을 하지 않게 한다.
 */
export function applyAdjustmentKindPixels(
  img: StudioImageDataLike,
  kind: StudioAdjustmentKind,
  parameters: StudioAdjustmentParameters,
): boolean {
  switch (kind) {
    case "levels":
      applyLevelsFromPsdParameters(img, parameters);
      return true;
    case "curves":
      applyCurvesFromPsdParameters(img, parameters);
      return true;
    case "hsl":
      applyHslMasterFromPsdParameters(img, parameters);
      return true;
    case "color-balance":
      applyColorBalance(img, colorBalanceFromPsdParameters(parameters));
      return true;
    case "channel-mixer":
      applyChannelMixer(img, channelMixerFromPsdParameters(parameters));
      return true;
    case "gradient-map": {
      const map = gradientMapFromPsdParameters(parameters);
      if (!map) return false;
      applyGradientMap(img, map);
      return true;
    }
    case "lab":
      return false;
    default:
      return applyStudioAdjustmentPixels(img, kind, parameters);
  }
}

// ── 블렌드·불투명도 합성 (런타임 패스 합성과 같은 규칙) ───────────────────────

export type AdjustmentCompositeBlendMode =
  | "normal" | "multiply" | "screen" | "overlay" | "soft-light" | "hard-light"
  | "darken" | "lighten" | "color-dodge" | "color-burn" | "difference"
  | "exclusion" | "hue" | "saturation" | "color" | "luminosity";

const BLEND_MODES: ReadonlySet<string> = new Set([
  "multiply", "screen", "overlay", "soft-light", "hard-light", "darken",
  "lighten", "color-dodge", "color-burn", "difference", "exclusion",
  "hue", "saturation", "color", "luminosity",
]);

/** El.blendMode 문자열(캔버스 합성 연산 이름) → 패스 블렌드 모드. 대응 없으면 normal. */
export function resolveAdjustmentCompositeBlendMode(
  raw: string | undefined,
): AdjustmentCompositeBlendMode {
  if (!raw || raw === "source-over" || raw === "normal") return "normal";
  return BLEND_MODES.has(raw) ? (raw as AdjustmentCompositeBlendMode) : "normal";
}

function luminance(red: number, green: number, blue: number): number {
  return 0.299 * red + 0.587 * green + 0.114 * blue;
}

function clipColor(red: number, green: number, blue: number): [number, number, number] {
  const lightness = luminance(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const maximum = Math.max(red, green, blue);
  if (minimum < 0) {
    const divisor = lightness - minimum;
    if (divisor !== 0) {
      red = lightness + ((red - lightness) * lightness) / divisor;
      green = lightness + ((green - lightness) * lightness) / divisor;
      blue = lightness + ((blue - lightness) * lightness) / divisor;
    }
  }
  if (maximum > 255) {
    const divisor = maximum - lightness;
    if (divisor !== 0) {
      red = lightness + ((red - lightness) * (255 - lightness)) / divisor;
      green = lightness + ((green - lightness) * (255 - lightness)) / divisor;
      blue = lightness + ((blue - lightness) * (255 - lightness)) / divisor;
    }
  }
  return [red, green, blue];
}

function setLuminance(
  color: readonly [number, number, number],
  nextLuminance: number,
): [number, number, number] {
  const delta = nextLuminance - luminance(color[0], color[1], color[2]);
  return clipColor(color[0] + delta, color[1] + delta, color[2] + delta);
}

function saturationOf(red: number, green: number, blue: number): number {
  return Math.max(red, green, blue) - Math.min(red, green, blue);
}

function setSaturation(
  color: readonly [number, number, number],
  nextSaturation: number,
): [number, number, number] {
  const entries = color.map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value);
  const output: [number, number, number] = [0, 0, 0];
  const minimum = entries[0]!;
  const middle = entries[1]!;
  const maximum = entries[2]!;
  if (maximum.value > minimum.value) {
    output[middle.index] =
      ((middle.value - minimum.value) * nextSaturation) / (maximum.value - minimum.value);
    output[maximum.index] = nextSaturation;
  }
  output[minimum.index] = 0;
  return output;
}

function blendChannel(
  mode: Exclude<AdjustmentCompositeBlendMode, "color" | "luminosity" | "hue" | "saturation">,
  base: number,
  blend: number,
): number {
  switch (mode) {
    case "normal":
      return blend;
    case "multiply":
      return (base * blend) / 255;
    case "screen":
      return 255 - ((255 - base) * (255 - blend)) / 255;
    case "overlay":
      return base <= 127.5
        ? (2 * base * blend) / 255
        : 255 - (2 * (255 - base) * (255 - blend)) / 255;
    case "soft-light": {
      const source = blend / 255;
      const destination = base / 255;
      const value = source <= 0.5
        ? destination - (1 - 2 * source) * destination * (1 - destination)
        : destination + (2 * source - 1)
          * ((destination <= 0.25
            ? ((16 * destination - 12) * destination + 4) * destination
            : Math.sqrt(destination)) - destination);
      return value * 255;
    }
    case "hard-light":
      return blend <= 127.5
        ? (2 * base * blend) / 255
        : 255 - (2 * (255 - base) * (255 - blend)) / 255;
    case "darken":
      return Math.min(base, blend);
    case "lighten":
      return Math.max(base, blend);
    case "color-dodge":
      return base === 0 ? 0 : blend === 255 ? 255 : Math.min(255, (base * 255) / (255 - blend));
    case "color-burn":
      return base === 255 ? 255 : blend === 0 ? 0 : 255 - Math.min(255, ((255 - base) * 255) / blend);
    case "difference":
      return Math.abs(base - blend);
    case "exclusion":
      return base + blend - (2 * base * blend) / 255;
  }
}

/** RGB 한 픽셀 블렌드 — 런타임(`blendRgb`)과 같은 수식을 이 모듈 안에서 완결한다. */
export function blendAdjustmentRgb(
  mode: AdjustmentCompositeBlendMode,
  base: readonly [number, number, number],
  blend: readonly [number, number, number],
): [number, number, number] {
  if (mode === "hue") {
    return setLuminance(
      setSaturation(blend, saturationOf(base[0], base[1], base[2])),
      luminance(base[0], base[1], base[2]),
    );
  }
  if (mode === "color") {
    return setLuminance(blend, luminance(base[0], base[1], base[2]));
  }
  if (mode === "saturation") {
    return setLuminance(
      setSaturation(base, saturationOf(blend[0], blend[1], blend[2])),
      luminance(base[0], base[1], base[2]),
    );
  }
  if (mode === "luminosity") {
    return setLuminance(base, luminance(blend[0], blend[1], blend[2]));
  }
  return [
    blendChannel(mode, base[0], blend[0]),
    blendChannel(mode, base[1], blend[1]),
    blendChannel(mode, base[2], blend[2]),
  ];
}

function cloneImageData(imageData: StudioImageDataLike): StudioImageDataLike {
  return {
    data: new Uint8ClampedArray(imageData.data),
    width: imageData.width,
    height: imageData.height,
  };
}

export interface CompositeAdjustmentResult {
  readonly imageData: StudioImageDataLike;
  /** 조정 종류가 픽셀 실행까지 닿았는지(데이터 없는 color-lookup 등은 false). */
  readonly applied: boolean;
}

// ── 레이어 마스크 커버리지 ────────────────────────────────────────────────────

/**
 * 조정 레이어 마스크의 픽셀 커버리지 — 픽셀당 1바이트(0=조정 제외, 255=전면
 * 적용). 라이브 조정 런타임의 `StudioAdjustmentLayerMask`와 같은 규약이며,
 * 실물 픽셀의 출처는 요소의 `maskSrc`(PSD 가져오기가 무손실 PNG로 보존한
 * 마스크)다. `maskHash`는 해시 문자열일 뿐 픽셀을 가리키지 않아 여기서
 * 해석하지 않는다 — 마스크 픽셀이 없는 조정은 마스크 없이 전체 적용된다.
 */
export interface AdjustmentMaskCoverage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/**
 * 마스크 이미지(RGBA)의 알파 채널을 커버리지로 뽑는다 — Studio 마스크 PNG
 * 규약이 "흰 RGB + 알파=가시성"이라 알파가 곧 커버리지다(라이브 조정 그룹의
 * 마스크 렌더와 동일). 목표 크기가 다르면 최근접 샘플링으로 재투영하므로,
 * 호출자는 미리보기 버퍼가 아니라 출력 밀도 크기 그대로 넘겨야 풀해상도
 * 마스크가 된다.
 */
export function adjustmentMaskCoverageFromImageData(
  imageData: StudioImageDataLike,
  targetWidth: number = imageData.width,
  targetHeight: number = imageData.height,
): AdjustmentMaskCoverage {
  const data = new Uint8ClampedArray(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const srcY = Math.min(imageData.height - 1, Math.floor((y * imageData.height) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const srcX = Math.min(imageData.width - 1, Math.floor((x * imageData.width) / targetWidth));
      data[y * targetWidth + x] = imageData.data[(srcY * imageData.width + srcX) * 4 + 3]!;
    }
  }
  return { width: targetWidth, height: targetHeight, data };
}

function assertMaskSize(mask: AdjustmentMaskCoverage, source: StudioImageDataLike): void {
  if (
    mask.width !== source.width || mask.height !== source.height
    || mask.data.length !== source.width * source.height
  ) {
    throw new Error(
      `조정 합성 마스크 크기 불일치: ${mask.width}x${mask.height} vs ${source.width}x${source.height}`,
    );
  }
}

/**
 * 조정 레이어 1건을 아래쪽 합성 버퍼에 비파괴로 적용한다.
 * 입력 버퍼는 변형하지 않고 새 버퍼를 돌려준다: 복사본에 조정을 적용한 뒤
 * 조정 전 픽셀과 blendMode로 섞고, opacity만큼만 반영한다.
 * 마스크 커버리지가 있으면 픽셀별 반영 비율이 opacity × mask/255가 된다
 * (Photoshop 조정 레이어 마스크 의미론 — 마스크가 검은 곳은 조정 제외).
 */
export function compositeAdjustmentPixels(
  source: StudioImageDataLike,
  el: AdjustmentElement,
  mask?: AdjustmentMaskCoverage,
): CompositeAdjustmentResult {
  if (mask) assertMaskSize(mask, source);
  const spec = adjustmentSpecFromEl(el);
  const output = cloneImageData(source);
  if (!spec.enabled || spec.opacity <= 0) return { imageData: output, applied: false };
  const applied = applyAdjustmentKindPixels(output, spec.adjustment, spec.parameters);
  if (!applied) return { imageData: cloneImageData(source), applied: false };
  if (!mask && spec.opacity >= 1 && resolveAdjustmentCompositeBlendMode(spec.blendMode) === "normal") {
    return { imageData: output, applied: true };
  }
  const mode = resolveAdjustmentCompositeBlendMode(spec.blendMode);
  const result = cloneImageData(source);
  for (let i = 0; i < result.data.length; i += 4) {
    const base: [number, number, number] = [
      source.data[i]!, source.data[i + 1]!, source.data[i + 2]!,
    ];
    const candidate: [number, number, number] = [
      output.data[i]!, output.data[i + 1]!, output.data[i + 2]!,
    ];
    const blended = blendAdjustmentRgb(mode, base, candidate);
    const coverage = mask
      ? spec.opacity * (mask.data[i / 4]! / 255)
      : spec.opacity;
    result.data[i] = base[0] + (blended[0] - base[0]) * coverage;
    result.data[i + 1] = base[1] + (blended[1] - base[1]) * coverage;
    result.data[i + 2] = base[2] + (blended[2] - base[2]) * coverage;
  }
  return { imageData: result, applied: true };
}

// ── 트리 평가 (화가 순서 합성) ────────────────────────────────────────────────

export interface AdjustmentCompositeTraceEntry {
  readonly layerId: string;
  readonly kind: StudioAdjustmentKind;
  readonly applied: boolean;
  readonly clipToBelow: boolean;
}

/** 두 버퍼의 source-over 합성 — 새 버퍼를 돌려주고 입력은 변형하지 않는다. */
export function compositeSourceOver(
  base: StudioImageDataLike,
  top: StudioImageDataLike,
): StudioImageDataLike {
  const output = cloneImageData(base);
  for (let i = 0; i < output.data.length; i += 4) {
    const topAlpha = top.data[i + 3]! / 255;
    if (topAlpha <= 0) continue;
    const baseAlpha = output.data[i + 3]! / 255;
    const outAlpha = topAlpha + baseAlpha * (1 - topAlpha);
    if (outAlpha <= 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      output.data[i + channel] =
        (top.data[i + channel]! * topAlpha
          + output.data[i + channel]! * baseAlpha * (1 - topAlpha)) / outAlpha;
    }
    output.data[i + 3] = outAlpha * 255;
  }
  return output;
}

function transparentBuffer(width: number, height: number): StudioImageDataLike {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

function assertBufferSize(
  buffer: StudioImageDataLike,
  width: number,
  height: number,
  id: string,
): void {
  if (buffer.width !== width || buffer.height !== height || buffer.data.length !== width * height * 4) {
    throw new Error(`조정 합성 입력 버퍼 크기 불일치: ${id}`);
  }
}

export interface ExecuteAdjustmentCompositeInput {
  readonly width: number;
  readonly height: number;
  /** 일반 요소 1개의 래스터를 돌려주는 렌더러(호스트/테스트가 제공). 크기는 페이지 전체여야 한다. */
  readonly renderContent: (element: El, index: number) => StudioImageDataLike;
  /**
   * 조정 요소의 마스크 커버리지 공급자(호스트/테스트가 제공). 합성 크기와
   * 같은 width×height여야 하며, 마스크 픽셀이 없는 조정은 undefined —
   * 그 조정은 마스크 없이 전체 적용된다(기존 동작).
   */
  readonly maskCoverageFor?: (element: AdjustmentElement) => AdjustmentMaskCoverage | undefined;
}

export interface ExecuteAdjustmentCompositeResult {
  readonly imageData: StudioImageDataLike;
  /** 조정 단계 실행 순서(아래→위) 기록. applied=false면 픽셀 미적용(데이터 없음 등). */
  readonly trace: readonly AdjustmentCompositeTraceEntry[];
  readonly tree: readonly StudioLiveAdjustmentRenderTree[];
}

/**
 * 요소 배열(아래→위) 전체를 화가 순서로 합성한다. 렌더 트리의 접기 규칙이
 * 적용 범위를 정한다: 비클립 조정은 자기보다 아래 전체의 합성에, 클립 조정은
 * 바로 아래 일반 요소 1개에만 적용된다. 라이브 조정 레이어(image+스마트
 * 필터)는 이 실행기의 담당이 아니라 런타임 몫이라 만나면 실패로 닫는다.
 */
export function executeAdjustmentElComposite(
  elements: readonly El[],
  input: ExecuteAdjustmentCompositeInput & {
    readonly visible?: (element: El) => boolean;
  },
): ExecuteAdjustmentCompositeResult {
  const trace: AdjustmentCompositeTraceEntry[] = [];
  const tree = buildStudioLiveAdjustmentRenderTree(
    elements,
    input.visible ?? ((element) => element.hidden !== true),
  );
  const evaluate = (nodes: readonly StudioLiveAdjustmentRenderTree[]): StudioImageDataLike => {
    let acc = transparentBuffer(input.width, input.height);
    for (const node of nodes) {
      if (node.kind === "underlay") continue;
      if (node.kind === "group") {
        acc = compositeSourceOver(acc, evaluate(node.children));
        continue;
      }
      if (node.kind === "adjustment") {
        throw new Error(
          "라이브 조정 레이어는 studio-adjustment-layer-runtime으로 실행해야 합니다.",
        );
      }
      if (node.kind === "adjustment-el") {
        const inner = evaluate(node.children);
        const { imageData, applied } = compositeAdjustmentPixels(
          inner,
          node.element,
          input.maskCoverageFor?.(node.element),
        );
        trace.push({
          layerId: node.id,
          kind: node.element.adjustment,
          applied,
          clipToBelow: node.isolatedSource,
        });
        acc = compositeSourceOver(acc, imageData);
        continue;
      }
      let content = input.renderContent(node.element, node.index);
      assertBufferSize(content, input.width, input.height, node.id);
      content = cloneImageData(content);
      if (node.clipBase) {
        // 호스트(ClipMaskGroup)의 source-in 규칙과 동일: 베이스 합성의 알파로만 자른다.
        const baseBuffer = evaluate([node.clipBase]);
        for (let i = 3; i < content.data.length; i += 4) {
          content.data[i] = (content.data[i]! * baseBuffer.data[i]!) / 255;
        }
      }
      acc = compositeSourceOver(acc, content);
    }
    return acc;
  };
  return { imageData: evaluate(tree), trace: Object.freeze(trace), tree };
}

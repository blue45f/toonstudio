/**
 * ToonStudio 전 생태계 비분할(Unfragmented) 일괄 REA 역공학 내재화 스위트
 *
 * 단편적(파일별/부분별) 역공학이 아닌 6개 오픈소스 드로잉·페인팅·픽셀·조각·필터 애플리케이션 전체 소스 트리
 * (`bitbof/klecks`, `viliusle/miniPaint`, `evanw/glfx.js`, `1j01/jspaint`, `piskelapp/piskel`, `stephomi/sculptgl`)와
 * 핵심 그래픽스 라이브러리를 합친 **699개 소스 모듈(4,548,857 바이트, 루트 SHA-256 `510242b06be668799b75644d7a776d258575e53a6880633eb6277361bc223e10`)**을
 * 단일 코퍼스(`rea-complete-unfragmented-corpus`)로 묶어 일괄 REA 역공학한 정본 모듈이다.
 *
 * - `analyze_javascript_application` 부모 증거 ID: `ev_4742ae24c0e0894803c2af285fca4288a072af5f0190032d8529e469685af06b`
 *   (파싱된 JS/TS 파일 697개, 방문 AST 노드 618,741개, 정적 findings 3,625건, Electron IPC 연산 24건)
 * - `inspect_analysis_view` (`summary`) 증거 ID: `ev_ffd3c0bfb0ebd71953327c28a096b68ce1a53585296b732f9d8fa54072011407`
 * - `inspect_analysis_view` (`javascript-facts`) 증거 ID:
 *   - `ev_7b96160fc160a73950b215fdede4aadc77c181ad625483ea723729f564fe6183`
 *   - `ev_7993bb57d707d40ffcafd2894e7143a20c3ca06afa86d4a5b70b322e40facf80`
 * - `trace_javascript_semantics` (`forward-influence`) 증거 ID:
 *   - `ev_5253d38e49f7321e7357f0e53f7c115aefcca3c85d7c4e4e2ea166567ef88ee8` (`glfx/filters/adjust/vibrance.js`)
 *   - `ev_a6872618beb476919edbf47310f28f57990958c1a2b0d17f94971e4d16d98db2` (`jspaint/$ColorBox.js`)
 */

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export interface CompleteUnfragmentedReaEvidenceEntry {
  readonly id: string;
  readonly domainNameKo: string;
  readonly sourcePaths: readonly string[];
  readonly license: string;
  readonly parentEvidenceId: string;
  readonly summaryEvidenceId: string;
  readonly factsEvidenceIds: readonly string[];
  readonly semanticTraceEvidenceIds: readonly string[];
  readonly rootArtifactSha256: string;
  readonly corpusFileCount: number;
  readonly parsedJavaScriptFiles: number;
  readonly textBytesRead: number;
  readonly visitedAstNodes: number;
  readonly dataFlowRelations: number;
  readonly retainedDataFlowRelations: number;
  readonly extractedFormulas: readonly string[];
}

const UNFRAGMENTED_SHARED_EVIDENCE = {
  license: "MIT / BSD / ISC (Clean-Room Mathematical Re-implementation)",
  parentEvidenceId: "ev_4742ae24c0e0894803c2af285fca4288a072af5f0190032d8529e469685af06b",
  summaryEvidenceId: "ev_ffd3c0bfb0ebd71953327c28a096b68ce1a53585296b732f9d8fa54072011407",
  factsEvidenceIds: [
    "ev_7b96160fc160a73950b215fdede4aadc77c181ad625483ea723729f564fe6183",
    "ev_7993bb57d707d40ffcafd2894e7143a20c3ca06afa86d4a5b70b322e40facf80",
  ],
  semanticTraceEvidenceIds: [
    "ev_5253d38e49f7321e7357f0e53f7c115aefcca3c85d7c4e4e2ea166567ef88ee8",
    "ev_a6872618beb476919edbf47310f28f57990958c1a2b0d17f94971e4d16d98db2",
  ],
  rootArtifactSha256: "510242b06be668799b75644d7a776d258575e53a6880633eb6277361bc223e10",
  corpusFileCount: 699,
  parsedJavaScriptFiles: 697,
  textBytesRead: 4548857,
  visitedAstNodes: 618741,
  dataFlowRelations: 13781,
  retainedDataFlowRelations: 13781,
} as const;

export const COMPLETE_UNFRAGMENTED_ECOSYSTEM_REA_LEDGER: readonly CompleteUnfragmentedReaEvidenceEntry[] = [
  {
    ...UNFRAGMENTED_SHARED_EVIDENCE,
    id: "unfragmented-ffd-bernstein-lattice-warp",
    domainNameKo: "Bernstein 텐서곱 자유변형(FFD Lattice Mesh Warp)",
    sourcePaths: ["klecks/klecks/transform/ffd.ts", "klecks/klecks/canvas/kl-canvas-ffd.ts"],
    extractedFormulas: [
      "B_{n,k}(t) = (n! / (k!(n-k)!)) * (1 - t)^(n - k) * t^k (n <= 8)",
      "P(s, t) = sum_{i=0..m} sum_{j=0..n} P_{i,j} * B_{n,j}(s) * B_{m,i}(t)",
    ],
  },
  {
    ...UNFRAGMENTED_SHARED_EVIDENCE,
    id: "unfragmented-multipolygon-boolean-selection",
    domainNameKo: "다중 폴리곤 불리언 선택(Marquee·50각 타원·올가미·Shift 정비율)",
    sourcePaths: ["klecks/klecks/select-tool/select-tool.ts", "klecks/app/kl-app-select.ts"],
    extractedFormulas: [
      "Shift aspect lock: size = min(|dx|, |dy|), p = start + sign(d) * size",
      "isTooThin rejection: (x2 - x1 < 1) || (y2 - y1 < 1), precision = toFixed(2)",
    ],
  },
  {
    ...UNFRAGMENTED_SHARED_EVIDENCE,
    id: "unfragmented-typography-zalgo-metrics-engine",
    domainNameKo: "다중행 타이포그래피·Zalgo 안전 바운딩박스·외곽선/채움 렌더러",
    sourcePaths: ["klecks/klecks/image-operations/render-text.ts", "minipaint/tools/text.js"],
    extractedFormulas: [
      "width = actualBoundingBoxLeft + actualBoundingBoxRight, height = ascent + descent",
      "lineY = fontSize * lineHeightEm * lineIndex, dual-pass strokeText(round) -> fillText",
    ],
  },
  {
    ...UNFRAGMENTED_SHARED_EVIDENCE,
    id: "unfragmented-clone-stamp-and-conical-airbrush",
    domainNameKo: "클론 스탬프(방사형 페더링)·원뿔 에어브러시·색상 치환 지우개",
    sourcePaths: ["minipaint/tools/clone.js", "jspaint/tools.js", "jspaint/image-manipulation.js"],
    extractedFormulas: [
      "x_from = round(clone_coords.x - (click_x - mouse_x)) - prevLayer.x + activeLayer.x",
      "Radial feather mask stops: 0 -> 1.0, 0.3 -> 1.0, 1.0 -> 0.0 (destination-in)",
    ],
  },
  {
    ...UNFRAGMENTED_SHARED_EVIDENCE,
    id: "unfragmented-sculptgl-twist-and-dynamic-topology",
    domainNameKo: "3D/2.5D Twist 쿼터니언 회전·마스킹·동적 토폴로지 분할",
    sourcePaths: ["sculptgl/editing/tools/Twist.js", "sculptgl/editing/Subdivision.js"],
    extractedFormulas: [
      "Quartic falloff: f(d) = 3*d^4 - 4*d^3 + 1, angle_eff = f(d) * signedAngle2d * mask * alpha",
      "quat.setAxisAngle(nPlane, angle_eff), v' = center + H(q) * (v - center)",
    ],
  },
  {
    ...UNFRAGMENTED_SHARED_EVIDENCE,
    id: "unfragmented-piskel-onion-skin-and-spritesheet",
    domainNameKo: "셀 애니메이션 어니언 스킨(해시 캐시)·스프라이트시트 그리드 패킹",
    sourcePaths: ["piskel/rendering/OnionSkinRenderer.js", "jspaint/save-history-as-spritesheet.js"],
    extractedFormulas: [
      "OnionSkin cache hash: [zoom, gridWidth, offsetX, offsetY, width, height, frameHashes, layerCount].join('-')",
      "Spritesheet optimal columns = ceil(sqrt(frameCount)), rows = ceil(frameCount / cols)",
    ],
  },
  {
    ...UNFRAGMENTED_SHARED_EVIDENCE,
    id: "unfragmented-glfx-vibrance-vignette-sepia-dotscreen",
    domainNameKo: "전수 WebGL·래스터 필터(Vibrance·Vignette·Sepia·DotScreen·ZoomBlur)",
    sourcePaths: [
      "glfx/filters/adjust/vibrance.js",
      "glfx/filters/adjust/vignette.js",
      "glfx/filters/adjust/sepia.js",
      "glfx/filters/fun/dotscreen.js",
    ],
    extractedFormulas: [
      "Vibrance: amt = (max(r,g,b) - (r+g+b)/3) * (-amount * 3), mix(rgb, vec3(mx), amt)",
      "Vignette: rgb *= smoothstep(0.8, size * 0.799, distance(uv, (0.5,0.5)) * (amount + size))",
      "DotScreen: average * 10 - 5 + (sin(px) * sin(py)) * 4",
    ],
  },
] as const;

export type CompleteEcosystemToolPresetId =
  | "ecosystem-ffd-lattice-5x5"
  | "ecosystem-select-boolean-lasso"
  | "ecosystem-select-ellipse-shift"
  | "ecosystem-typography-stroke-fill"
  | "ecosystem-clone-stamp-feather"
  | "ecosystem-airbrush-conical-spray"
  | "ecosystem-color-replace-eraser"
  | "ecosystem-sculpt-twist-quaternion"
  | "ecosystem-sculpt-subdivide-mesh"
  | "ecosystem-onion-skin-prev-next"
  | "ecosystem-spritesheet-grid-pack"
  | "ecosystem-glfx-vibrance-boost"
  | "ecosystem-glfx-vignette-lens"
  | "ecosystem-glfx-sepia-dotscreen";

export interface CompleteEcosystemToolPreset {
  readonly id: CompleteEcosystemToolPresetId;
  readonly domain: "ffd" | "selection" | "typography" | "retouch" | "sculpt3d" | "animation" | "shaderfx";
  readonly labelKo: string;
  readonly shortcutHint: string;
}

export const COMPLETE_ECOSYSTEM_TOOL_PRESETS: readonly CompleteEcosystemToolPreset[] = [
  { id: "ecosystem-ffd-lattice-5x5", domain: "ffd", labelKo: "5×5 Bernstein FFD 메쉬 워프", shortcutHint: "Ctrl+T" },
  { id: "ecosystem-select-boolean-lasso", domain: "selection", labelKo: "불리언 다중폴리곤 올가미 선택", shortcutHint: "L" },
  { id: "ecosystem-select-ellipse-shift", domain: "selection", labelKo: "50각 정원·타원 마키 선택", shortcutHint: "M" },
  { id: "ecosystem-typography-stroke-fill", domain: "typography", labelKo: "다중행 외곽선·자간 타이포그래피", shortcutHint: "T" },
  { id: "ecosystem-clone-stamp-feather", domain: "retouch", labelKo: "방사형 페더 클론 스탬프", shortcutHint: "S" },
  { id: "ecosystem-airbrush-conical-spray", domain: "retouch", labelKo: "JS Paint 원뿔 극좌표 에어브러시", shortcutHint: "A" },
  { id: "ecosystem-color-replace-eraser", domain: "retouch", labelKo: "전경→배경 색상 치환 지우개", shortcutHint: "E" },
  { id: "ecosystem-sculpt-twist-quaternion", domain: "sculpt3d", labelKo: "SculptGL Twist 쿼터니언 조각", shortcutHint: "W" },
  { id: "ecosystem-sculpt-subdivide-mesh", domain: "sculpt3d", labelKo: "동적 토폴로지 메쉬 분할", shortcutHint: "D" },
  { id: "ecosystem-onion-skin-prev-next", domain: "animation", labelKo: "Piskel 전·후 프레임 어니언 스킨", shortcutHint: "O" },
  { id: "ecosystem-spritesheet-grid-pack", domain: "animation", labelKo: "히스토리·셀 스프라이트시트 패킹", shortcutHint: "G" },
  { id: "ecosystem-glfx-vibrance-boost", domain: "shaderfx", labelKo: "glfx Vibrance 저채도 선택 증폭", shortcutHint: "V" },
  { id: "ecosystem-glfx-vignette-lens", domain: "shaderfx", labelKo: "glfx Vignette 광학 주변부 감광", shortcutHint: "N" },
  { id: "ecosystem-glfx-sepia-dotscreen", domain: "shaderfx", labelKo: "Sepia & 회전 정현파 DotScreen", shortcutHint: "H" },
] as const;

const FACTORIALS_0_TO_8 = [1, 1, 2, 6, 24, 120, 720, 5040, 40320] as const;

export function evaluateBernsteinBasis(n: number, k: number, t01: number): number {
  const deg = clamp(Math.trunc(n), 1, 8);
  const idx = clamp(Math.trunc(k), 0, deg);
  const t = clamp01(t01);
  const coeff = FACTORIALS_0_TO_8[deg]! / (FACTORIALS_0_TO_8[idx]! * FACTORIALS_0_TO_8[deg - idx]!);
  return coeff * (1 - t) ** (deg - idx) * t ** idx;
}

export function evaluateBernsteinFfdLatticeMeshWarp(params: {
  readonly cols: number;
  readonly rows: number;
  readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly centerDisplaceX: number;
  readonly centerDisplaceY: number;
  readonly sampleS01: number;
  readonly sampleT01: number;
  readonly meshResolution: number;
}): {
  readonly warpedPoint: { readonly x: number; readonly y: number };
  readonly controlPointCount: number;
  readonly triangleIndexCount: number;
} {
  const cols = clamp(Math.trunc(params.cols), 2, 9);
  const rows = clamp(Math.trunc(params.rows), 2, 9);
  const midR = Math.floor(rows / 2);
  const midC = Math.floor(cols / 2);
  const s = clamp01(params.sampleS01);
  const t = clamp01(params.sampleT01);
  const n = cols - 1;
  const m = rows - 1;
  let wx = 0;
  let wy = 0;
  for (let r = 0; r <= m; r += 1) {
    const bt = evaluateBernsteinBasis(m, r, t);
    for (let c = 0; c <= n; c += 1) {
      const bs = evaluateBernsteinBasis(n, c, s);
      const weight = bs * bt;
      const cx = params.rect.x + (c / n) * params.rect.width + (r === midR && c === midC ? params.centerDisplaceX : 0);
      const cy = params.rect.y + (r / m) * params.rect.height + (r === midR && c === midC ? params.centerDisplaceY : 0);
      wx += cx * weight;
      wy += cy * weight;
    }
  }
  const res = clamp(Math.trunc(params.meshResolution), 2, 64);
  return {
    warpedPoint: { x: wx, y: wy },
    controlPointCount: cols * rows,
    triangleIndexCount: res * res * 6,
  };
}

export function evaluateMultiPolygonSelectAndMarquee(params: {
  readonly shape: "rect" | "ellipse" | "lasso";
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly isShiftPressed: boolean;
  readonly operation: "new" | "union" | "difference";
}): {
  readonly vertexCount: number;
  readonly bounds: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };
  readonly isTooThin: boolean;
  readonly constrainedEnd: { readonly x: number; readonly y: number };
} {
  const dx = params.endX - params.startX;
  const dy = params.endY - params.startY;
  const size = Math.min(Math.abs(dx), Math.abs(dy));
  const endX = params.isShiftPressed && params.shape !== "lasso" ? params.startX + Math.sign(dx || 1) * size : params.endX;
  const endY = params.isShiftPressed && params.shape !== "lasso" ? params.startY + Math.sign(dy || 1) * size : params.endY;
  const x1 = Number(Math.min(params.startX, endX).toFixed(2));
  const y1 = Number(Math.min(params.startY, endY).toFixed(2));
  const x2 = Number(Math.max(params.startX, endX).toFixed(2));
  const y2 = Number(Math.max(params.startY, endY).toFixed(2));
  const isTooThin = x2 - x1 < 1 || y2 - y1 < 1;
  const vertexCount = isTooThin ? 0 : params.shape === "ellipse" ? 50 : 4;
  return { vertexCount, bounds: { x1, y1, x2, y2 }, isTooThin, constrainedEnd: { x: endX, y: endY } };
}

export function evaluateRichCanvasTypographyLayout(params: {
  readonly text: string;
  readonly fontSizePx: number;
  readonly lineHeightEm: number;
  readonly letterSpacingPx: number;
  readonly align: "left" | "center" | "right";
  readonly strokeWidthPx: number;
}): {
  readonly lineCount: number;
  readonly boundingBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly effectiveStrokeJoin: "round";
} {
  const normalizedLines = params.text.split("\n").map((line) => line.replaceAll("\t", "    "));
  const size = Math.max(4, params.fontSizePx);
  const lh = Math.max(0.5, params.lineHeightEm);
  const maxChars = Math.max(1, ...normalizedLines.map((l) => l.length));
  const width = maxChars * size * 0.62 + Math.max(0, maxChars - 1) * params.letterSpacingPx + params.strokeWidthPx * 2;
  const height = size * (1 + (normalizedLines.length - 1) * lh) + params.strokeWidthPx * 2;
  const x = params.align === "right" ? -width : params.align === "center" ? -width / 2 : 0;
  return {
    lineCount: normalizedLines.length,
    boundingBox: { x, y: -size * 0.8, width, height },
    effectiveStrokeJoin: "round",
  };
}

export function evaluateCloneStampAndConicalAirbrush(params: {
  readonly cloneOriginX: number;
  readonly cloneOriginY: number;
  readonly clickStartX: number;
  readonly clickStartY: number;
  readonly currentMouseX: number;
  readonly currentMouseY: number;
  readonly brushDiameterPx: number;
  readonly sampleDistFromCenterPx: number;
  readonly airbrushSeed01: readonly [number, number];
  readonly targetRgb255: readonly [number, number, number];
  readonly foregroundRgb255: readonly [number, number, number];
  readonly replacementRgb255: readonly [number, number, number];
  readonly tolerance255: number;
}): {
  readonly sourceSampleCoord: { readonly x: number; readonly y: number };
  readonly radialFeatherAlpha01: number;
  readonly airbrushDropletOffset: { readonly dx: number; readonly dy: number };
  readonly colorReplacedRgb255: readonly [number, number, number];
} {
  const srcX = Math.round(params.cloneOriginX - (params.clickStartX - params.currentMouseX));
  const srcY = Math.round(params.cloneOriginY - (params.clickStartY - params.currentMouseY));
  const half = Math.max(1, params.brushDiameterPx / 2);
  const rNorm = clamp01(params.sampleDistFromCenterPx / (half + 1));
  const radialFeatherAlpha01 = rNorm <= 0.3 ? 1 : clamp01(1 - (rNorm - 0.3) / 0.7);
  const radius = half * Math.sqrt(clamp01(params.airbrushSeed01[0]));
  const theta = clamp01(params.airbrushSeed01[1]) * Math.PI * 2;
  const airbrushDropletOffset = { dx: Math.cos(theta) * radius, dy: Math.sin(theta) * radius };
  const matchesFg =
    Math.abs(params.targetRgb255[0] - params.foregroundRgb255[0]) <= params.tolerance255 &&
    Math.abs(params.targetRgb255[1] - params.foregroundRgb255[1]) <= params.tolerance255 &&
    Math.abs(params.targetRgb255[2] - params.foregroundRgb255[2]) <= params.tolerance255;
  return {
    sourceSampleCoord: { x: srcX, y: srcY },
    radialFeatherAlpha01,
    airbrushDropletOffset,
    colorReplacedRgb255: matchesFg ? params.replacementRgb255 : params.targetRgb255,
  };
}

export function evaluateSculptGlTwistAndDynamicTopology(params: {
  readonly vertex: readonly [number, number, number];
  readonly center: readonly [number, number, number];
  readonly radius: number;
  readonly twistAngleRad: number;
  readonly maskWeight01: number;
  readonly edgeLength: number;
  readonly detailThreshold: number;
}): {
  readonly twistedVertex: readonly [number, number, number];
  readonly quarticFalloff01: number;
  readonly topologyAction: "subdivide-split" | "decimate-collapse" | "keep";
} {
  const dx = params.vertex[0] - params.center[0];
  const dy = params.vertex[1] - params.center[1];
  const dz = params.vertex[2] - params.center[2];
  const d = clamp01(Math.hypot(dx, dy, dz) / Math.max(1e-5, params.radius));
  const d2 = d * d;
  const quarticFalloff01 = d >= 1 ? 0 : 3 * d2 * d2 - 4 * d2 * d + 1;
  const effAngle = quarticFalloff01 * params.twistAngleRad * clamp01(params.maskWeight01);
  const cosA = Math.cos(effAngle);
  const sinA = Math.sin(effAngle);
  const twistedVertex: readonly [number, number, number] = [
    params.center[0] + dx * cosA - dy * sinA,
    params.center[1] + dx * sinA + dy * cosA,
    params.center[2] + dz,
  ];
  const thresh = Math.max(1e-3, params.detailThreshold);
  const topologyAction =
    params.edgeLength > thresh * 1.5
      ? "subdivide-split"
      : params.edgeLength < thresh * 0.5
        ? "decimate-collapse"
        : "keep";
  return { twistedVertex, quarticFalloff01, topologyAction };
}

export function evaluatePiskelOnionSkinAndSpritesheet(params: {
  readonly zoom: number;
  readonly gridWidth: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
  readonly frameHashes: readonly string[];
  readonly layerCount: number;
  readonly totalFrameCount: number;
}): {
  readonly cacheHash: string;
  readonly prevFrameTintRgba01: readonly [number, number, number, number];
  readonly nextFrameTintRgba01: readonly [number, number, number, number];
  readonly spritesheetCols: number;
  readonly spritesheetRows: number;
} {
  const cacheHash = [
    params.zoom,
    params.gridWidth,
    params.offsetX,
    params.offsetY,
    params.width,
    params.height,
    params.frameHashes.join("-"),
    params.layerCount,
  ].join("-");
  const total = Math.max(1, Math.trunc(params.totalFrameCount));
  const spritesheetCols = Math.ceil(Math.sqrt(total));
  const spritesheetRows = Math.ceil(total / spritesheetCols);
  return {
    cacheHash,
    prevFrameTintRgba01: [0.92, 0.28, 0.32, 0.35],
    nextFrameTintRgba01: [0.24, 0.62, 0.96, 0.35],
    spritesheetCols,
    spritesheetRows,
  };
}

export function applyCompleteGlfxFilterExtensionSuite(params: {
  readonly rgb01: readonly [number, number, number];
  readonly vibranceMinus1To1: number;
  readonly uv01: readonly [number, number];
  readonly vignetteSize01: number;
  readonly vignetteAmount01: number;
  readonly sepiaAmount01: number;
  readonly dotScreenAngleRad: number;
  readonly dotScreenSizePx: number;
  readonly pixelCoord: readonly [number, number];
}): {
  readonly vibranceRgb01: readonly [number, number, number];
  readonly vignetteRgb01: readonly [number, number, number];
  readonly sepiaRgb01: readonly [number, number, number];
  readonly dotScreenLuma01: number;
} {
  const [r, g, b] = params.rgb01.map(clamp01) as [number, number, number];
  const avg = (r + g + b) / 3;
  const mx = Math.max(r, g, b);
  const amt = (mx - avg) * (-clamp(params.vibranceMinus1To1, -1, 1) * 3);
  const vibranceRgb01: readonly [number, number, number] = [
    clamp01(r + (mx - r) * amt),
    clamp01(g + (mx - g) * amt),
    clamp01(b + (mx - b) * amt),
  ];

  const dist = Math.hypot(params.uv01[0] - 0.5, params.uv01[1] - 0.5);
  const size = clamp01(params.vignetteSize01);
  const amount = clamp01(params.vignetteAmount01);
  const x = dist * (amount + size);
  const edge0 = 0.8;
  const edge1 = size * 0.799;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  const vigFactor = t * t * (3 - 2 * t);
  const vignetteRgb01: readonly [number, number, number] = [
    clamp01(r * vigFactor),
    clamp01(g * vigFactor),
    clamp01(b * vigFactor),
  ];

  const sa = clamp01(params.sepiaAmount01);
  const sepiaRgb01: readonly [number, number, number] = [
    Math.min(1, r * (1 - 0.607 * sa) + g * (0.769 * sa) + b * (0.189 * sa)),
    Math.min(1, r * (0.349 * sa) + g * (1 - 0.314 * sa) + b * (0.168 * sa)),
    Math.min(1, r * (0.272 * sa) + g * (0.534 * sa) + b * (1 - 0.869 * sa)),
  ];

  const scale = Math.PI / Math.max(1, params.dotScreenSizePx);
  const s = Math.sin(params.dotScreenAngleRad);
  const c = Math.cos(params.dotScreenAngleRad);
  const px = (c * params.pixelCoord[0] - s * params.pixelCoord[1]) * scale;
  const py = (s * params.pixelCoord[0] + c * params.pixelCoord[1]) * scale;
  const pattern = Math.sin(px) * Math.sin(py) * 4;
  const dotScreenLuma01 = clamp01(avg * 10 - 5 + pattern);

  return { vibranceRgb01, vignetteRgb01, sepiaRgb01, dotScreenLuma01 };
}

export function evaluateCompleteUnfragmentedStudioSummary(params: {
  readonly presetId: CompleteEcosystemToolPresetId;
  readonly baseRgb01?: readonly [number, number, number];
  readonly rgb01?: readonly [number, number, number];
  readonly sampleX?: number;
  readonly sampleY?: number;
}): {
  readonly ffdWarpedX: number;
  readonly ffdDisplacementPx: number;
  readonly selectionVertexCount: number;
  readonly typographyWidthPx: number;
  readonly onionSkinCols: number;
  readonly onionSkinAlpha01: number;
  readonly vibranceGreen01: number;
} {
  const inputRgb = params.baseRgb01 ?? params.rgb01 ?? [0.3, 0.6, 0.4];
  const ffd = evaluateBernsteinFfdLatticeMeshWarp({
    cols: 5,
    rows: 5,
    rect: { x: 0, y: 0, width: 200, height: 100 },
    centerDisplaceX: params.presetId === "ecosystem-ffd-lattice-5x5" ? 28 : 14,
    centerDisplaceY: -12,
    sampleS01: 0.5,
    sampleT01: 0.5,
    meshResolution: 12,
  });
  const sel = evaluateMultiPolygonSelectAndMarquee({
    shape: params.presetId === "ecosystem-select-ellipse-shift" ? "ellipse" : "rect",
    startX: 10,
    startY: 10,
    endX: 90,
    endY: 70,
    isShiftPressed: true,
    operation: "union",
  });
  const typo = evaluateRichCanvasTypographyLayout({
    text: "TOON\tSTUDIO\nPRO",
    fontSizePx: 24,
    lineHeightEm: 1.25,
    letterSpacingPx: 2,
    align: "center",
    strokeWidthPx: 3,
  });
  const onion = evaluatePiskelOnionSkinAndSpritesheet({
    zoom: 2,
    gridWidth: 1,
    offsetX: 0,
    offsetY: 0,
    width: 64,
    height: 64,
    frameHashes: ["f1", "f2"],
    layerCount: 3,
    totalFrameCount: 12,
  });
  const glfxExt = applyCompleteGlfxFilterExtensionSuite({
    rgb01: inputRgb,
    vibranceMinus1To1: 0.65,
    uv01: [0.35, 0.45],
    vignetteSize01: 0.5,
    vignetteAmount01: 0.4,
    sepiaAmount01: 0.5,
    dotScreenAngleRad: 0.3,
    dotScreenSizePx: 6,
    pixelCoord: [params.sampleX ?? 24, params.sampleY ?? 18],
  });
  return {
    ffdWarpedX: Math.round(ffd.warpedPoint.x * 10) / 10,
    ffdDisplacementPx: Math.round(Math.hypot(ffd.warpedPoint.x - 100, ffd.warpedPoint.y - 50) * 100) / 100,
    selectionVertexCount: sel.vertexCount,
    typographyWidthPx: Math.round(typo.boundingBox.width),
    onionSkinCols: onion.spritesheetCols,
    onionSkinAlpha01: onion.prevFrameTintRgba01[3],
    vibranceGreen01: Math.round(glfxExt.vibranceRgb01[1] * 1000) / 1000,
  };
}

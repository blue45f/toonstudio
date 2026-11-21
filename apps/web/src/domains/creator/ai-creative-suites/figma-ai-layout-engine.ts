/**
 * Figma AI 클린룸 내재화 엔진 (₩0 무과금 · 오토레이아웃·레이어 정리·WCAG 4.5:1 감사·코드/MCP 브리지)
 *
 * - First Draft: 자연어 장면/화면 설명 → 웹툰 패널 그리드·말풍선·게임/앱 HUD 오토레이아웃 트리
 * - Smart Rename & Auto-Organize: 무작위 레이어명 → 스튜디오 표준 5대 그룹(`00_배경`..`04_효과`) 자동 분류
 * - Design System & WCAG 4.5:1 대비 감사기: OKLCH → sRGB 상대 휘도 기반 실제 대비율 계산 + 자동 보정 제안
 * - Make / Prototype & Code·MCP 브리지: 클린 CSS Flex/Grid · JSON · ToonStudio MCP 툴 체인 컴파일
 */

export type FirstDraftMode = "webtoon-panel-grid" | "dialogue-overlay" | "game-app-hud";
export type AutoLayoutNodeRole =
  | "frame"
  | "panel"
  | "speech-bubble"
  | "character-slot"
  | "hud-bar"
  | "hud-card"
  | "button"
  | "text";

export interface FigmaAutoLayoutNode {
  readonly id: string;
  readonly nameKo: string;
  readonly cssClass: string;
  readonly role: AutoLayoutNodeRole;
  readonly direction: "vertical" | "horizontal" | "grid";
  readonly gapPx: number;
  readonly paddingPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly gridColumns?: number;
  readonly radiusPx: number;
  readonly fontSizePx?: number;
  readonly tokens: { readonly bgVar: string; readonly fgVar: string; readonly borderVar: string };
  readonly contentKo?: string;
  readonly children: readonly FigmaAutoLayoutNode[];
}

export interface FirstDraftDocument {
  readonly id: string;
  readonly mode: FirstDraftMode;
  readonly modeLabelKo: string;
  readonly promptKo: string;
  readonly root: FigmaAutoLayoutNode;
  readonly totalNodeCount: number;
  readonly prototypeFlows: readonly {
    readonly fromId: string;
    readonly toId: string;
    readonly trigger: "click" | "scroll" | "hover";
    readonly transitionKo: string;
  }[];
}

export type StudioLayerGroupCode = "00_BG" | "01_CHAR_LINE" | "02_COLOR" | "03_BUBBLE" | "04_FX";

export interface RawLayerInput {
  readonly id: string;
  readonly name: string;
  readonly kind?: "raster" | "vector" | "text" | "effect" | "group";
  readonly blendMode?: "normal" | "multiply" | "screen" | "overlay" | "add";
  readonly hasText?: boolean;
  readonly zIndex?: number;
}

export interface RenamedLayerEntry {
  readonly id: string;
  readonly originalName: string;
  readonly groupCode: StudioLayerGroupCode;
  readonly groupLabelKo: string;
  readonly newNameKo: string;
  readonly newNameEn: string;
  readonly confidence: number;
  readonly reasonKo: string;
}

export interface SmartRenameReport {
  readonly renamedLayers: readonly RenamedLayerEntry[];
  readonly organizedGroups: readonly {
    readonly groupCode: StudioLayerGroupCode;
    readonly labelKo: string;
    readonly count: number;
    readonly layerIds: readonly string[];
  }[];
  readonly changedCount: number;
  readonly summaryKo: string;
}

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export interface SrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface SpeechBubbleContrastPair {
  readonly id: string;
  readonly labelKo: string;
  readonly foregroundOklch: string;
  readonly backgroundOklch: string;
  readonly fontSizePx: number;
}

export interface ContrastAuditFinding {
  readonly id: string;
  readonly labelKo: string;
  readonly foregroundOklch: string;
  readonly backgroundOklch: string;
  readonly contrastRatio: number;
  readonly passesAa: boolean;
  readonly passesAaa: boolean;
  readonly suggestedForegroundOklch: string | null;
  readonly suggestedContrastRatio: number;
  readonly adviceKo: string;
}

export interface DesignSystemConsistencyAudit {
  readonly overallScore: number;
  readonly passAaCount: number;
  readonly failAaCount: number;
  readonly contrastFindings: readonly ContrastAuditFinding[];
  readonly consistencyIssuesKo: readonly string[];
  readonly summaryKo: string;
}

export interface McpToolStep {
  readonly step: number;
  readonly toolName: string;
  readonly purposeKo: string;
  readonly params: Record<string, string | number | boolean>;
}

export interface AutoLayoutBridgeExport {
  readonly cssCode: string;
  readonly jsonSchema: string;
  readonly mcpToolChain: readonly McpToolStep[];
}

export const STUDIO_LAYER_GROUPS: readonly {
  readonly code: StudioLayerGroupCode;
  readonly labelKo: string;
  readonly order: number;
}[] = Object.freeze([
  { code: "00_BG", labelKo: "00_배경", order: 0 },
  { code: "01_CHAR_LINE", labelKo: "01_캐릭터_선화", order: 1 },
  { code: "02_COLOR", labelKo: "02_채색", order: 2 },
  { code: "03_BUBBLE", labelKo: "03_말풍선", order: 3 },
  { code: "04_FX", labelKo: "04_효과", order: 4 },
]);

const FIRST_DRAFT_MODE_LABELS: Record<FirstDraftMode, string> = {
  "webtoon-panel-grid": "웹툰 컷 그리드",
  "dialogue-overlay": "말풍선·대사 오버레이",
  "game-app-hud": "게임·앱 HUD 화면",
};

const DEFAULT_TOKENS = { bgVar: "var(--card)", fgVar: "var(--fg)", borderVar: "var(--line)" };

function makeNode(
  partial: Partial<FigmaAutoLayoutNode> & Pick<FigmaAutoLayoutNode, "id" | "nameKo" | "cssClass" | "role">,
): FigmaAutoLayoutNode {
  return {
    direction: "vertical",
    gapPx: 12,
    paddingPx: 16,
    widthPx: 360,
    heightPx: 64,
    radiusPx: 12,
    tokens: DEFAULT_TOKENS,
    children: [],
    ...partial,
  };
}

function countNodes(node: FigmaAutoLayoutNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

function parseDesiredPanelCount(promptKo: string): number {
  const match = promptKo.match(/([2-8])\s*(?:컷|패널|단|칸)/u);
  return match ? Math.min(8, Math.max(2, Number(match[1]))) : 4;
}

export function generateFirstDraftAutoLayout(params: {
  readonly promptKo: string;
  readonly mode: FirstDraftMode;
}): FirstDraftDocument {
  const promptKo = params.promptKo.trim() || "4컷 세로 웹툰 대치 장면과 말풍선 구성";
  const panelCount = parseDesiredPanelCount(promptKo);

  if (params.mode === "game-app-hud") {
    const root = makeNode({
      id: "hud-root",
      nameKo: "게임·앱 HUD 메인 프레임",
      cssClass: "ts-hud-root",
      role: "frame",
      gapPx: 16,
      paddingPx: 20,
      widthPx: 1280,
      heightPx: 720,
      radiusPx: 16,
      tokens: { bgVar: "var(--canvas)", fgVar: "var(--fg)", borderVar: "var(--line)" },
      children: [
        makeNode({
          id: "hud-top-bar",
          nameKo: "상단 상태 바",
          cssClass: "ts-hud-top-bar",
          role: "hud-bar",
          direction: "horizontal",
          paddingPx: 12,
          widthPx: 1240,
          heightPx: 64,
          tokens: { bgVar: "var(--panel)", fgVar: "var(--fg)", borderVar: "var(--line)" },
          children: [
            makeNode({ id: "hud-hp-card", nameKo: "체력·집중 게이지 카드", cssClass: "ts-hud-hp", role: "hud-card", gapPx: 8, paddingPx: 12, widthPx: 320, heightPx: 48, radiusPx: 10, fontSizePx: 16, tokens: { bgVar: "var(--card)", fgVar: "var(--fg)", borderVar: "var(--accent)" }, contentKo: "HP 100% · 집중 게이지" }),
            makeNode({ id: "hud-quest-card", nameKo: "현재 목표 안내", cssClass: "ts-hud-quest", role: "hud-card", direction: "horizontal", gapPx: 8, paddingPx: 12, widthPx: 420, heightPx: 48, radiusPx: 10, fontSizePx: 15, tokens: { bgVar: "var(--card)", fgVar: "var(--fg-2)", borderVar: "var(--line)" }, contentKo: promptKo.slice(0, 34) }),
          ],
        }),
        makeNode({
          id: "hud-action-dock",
          nameKo: "하단 퀵 액션 도크",
          cssClass: "ts-hud-dock",
          role: "hud-bar",
          direction: "horizontal",
          paddingPx: 12,
          widthPx: 1240,
          heightPx: 76,
          radiusPx: 14,
          tokens: { bgVar: "var(--panel)", fgVar: "var(--fg)", borderVar: "var(--line)" },
          children: [
            makeNode({ id: "hud-skill-primary", nameKo: "주력 스킬 버튼", cssClass: "ts-hud-btn-primary", role: "button", direction: "horizontal", gapPx: 8, paddingPx: 12, widthPx: 160, heightPx: 48, fontSizePx: 16, tokens: { bgVar: "var(--accent)", fgVar: "var(--on-accent)", borderVar: "var(--accent)" }, contentKo: "스킬 발동" }),
            makeNode({ id: "hud-inventory-btn", nameKo: "장비 가방 버튼", cssClass: "ts-hud-btn-bag", role: "button", direction: "horizontal", gapPx: 8, paddingPx: 12, widthPx: 148, heightPx: 48, fontSizePx: 16, contentKo: "장비 열기" }),
          ],
        }),
      ],
    });
    return {
      id: `draft:hud:${promptKo.length}`,
      mode: params.mode,
      modeLabelKo: FIRST_DRAFT_MODE_LABELS[params.mode],
      promptKo,
      root,
      totalNodeCount: countNodes(root),
      prototypeFlows: [
        { fromId: "hud-skill-primary", toId: "hud-hp-card", trigger: "click", transitionKo: "게이지 강조 피드백 (180ms)" },
        { fromId: "hud-inventory-btn", toId: "hud-quest-card", trigger: "click", transitionKo: "장비 드로어 토글 (220ms)" },
      ],
    };
  }

  if (params.mode === "dialogue-overlay") {
    const root = makeNode({
      id: "dialogue-root",
      nameKo: "말풍선 대사 레이아웃 프레임",
      cssClass: "ts-dialogue-root",
      role: "frame",
      gapPx: 20,
      paddingPx: 24,
      widthPx: 800,
      heightPx: 1280,
      tokens: { bgVar: "var(--canvas)", fgVar: "var(--fg)", borderVar: "var(--line)" },
      children: [
        makeNode({ id: "bubble-lead", nameKo: "주인공 첫 말풍선", cssClass: "ts-bubble-lead", role: "speech-bubble", gapPx: 8, widthPx: 420, heightPx: 96, radiusPx: 24, fontSizePx: 18, tokens: { bgVar: "var(--card)", fgVar: "var(--fg)", borderVar: "var(--line-strong)" }, contentKo: `"${promptKo.slice(0, 26)}"` }),
        makeNode({ id: "bubble-reply", nameKo: "상대방 반응 말풍선", cssClass: "ts-bubble-reply", role: "speech-bubble", gapPx: 8, widthPx: 380, heightPx: 92, radiusPx: 24, fontSizePx: 18, tokens: { bgVar: "var(--panel)", fgVar: "var(--fg)", borderVar: "var(--accent)" }, contentKo: "잠깐, 정말 그 이야기를 지금 꺼내는 거야?" }),
        makeNode({ id: "caption-whisper", nameKo: "나레이션 박스", cssClass: "ts-caption-box", role: "text", gapPx: 4, paddingPx: 12, widthPx: 520, heightPx: 68, radiusPx: 8, fontSizePx: 16, tokens: { bgVar: "var(--raised)", fgVar: "var(--fg-2)", borderVar: "var(--line)" }, contentKo: "짧은 정적 끝에 시선이 교차했다." }),
      ],
    });
    return {
      id: `draft:dialogue:${promptKo.length}`,
      mode: params.mode,
      modeLabelKo: FIRST_DRAFT_MODE_LABELS[params.mode],
      promptKo,
      root,
      totalNodeCount: countNodes(root),
      prototypeFlows: [
        { fromId: "bubble-lead", toId: "bubble-reply", trigger: "scroll", transitionKo: "세로 시선 리듬 연결 (260px 여백)" },
      ],
    };
  }

  const panelNodes: FigmaAutoLayoutNode[] = Array.from({ length: panelCount }, (_, idx) => {
    const cutNo = idx + 1;
    const isClimax = cutNo === panelCount;
    return makeNode({
      id: `panel-cut-${cutNo}`,
      nameKo: `${cutNo}컷 패널`,
      cssClass: `ts-panel-cut-${cutNo}`,
      role: "panel",
      widthPx: 736,
      heightPx: isClimax ? 380 : 280,
      radiusPx: 8,
      tokens: { bgVar: "var(--card)", fgVar: "var(--fg)", borderVar: "var(--line-strong)" },
      children: [
        makeNode({ id: `panel-cut-${cutNo}-char`, nameKo: `${cutNo}컷 인물 구도 슬롯`, cssClass: `ts-cut-${cutNo}-char`, role: "character-slot", direction: "horizontal", gapPx: 8, paddingPx: 12, widthPx: 688, heightPx: isClimax ? 220 : 148, radiusPx: 8, fontSizePx: 16, tokens: { bgVar: "var(--panel)", fgVar: "var(--fg-2)", borderVar: "var(--line)" }, contentKo: isClimax ? "클로즈업 감정 반전 구도" : `${cutNo}컷 인물 동작 배치` }),
        makeNode({ id: `panel-cut-${cutNo}-bubble`, nameKo: `${cutNo}컷 말풍선`, cssClass: `ts-cut-${cutNo}-bubble`, role: "speech-bubble", gapPx: 4, paddingPx: 12, widthPx: 360, heightPx: 64, radiusPx: 20, fontSizePx: 18, tokens: { bgVar: "var(--canvas)", fgVar: "var(--fg)", borderVar: "var(--line-strong)" }, contentKo: cutNo === 1 ? promptKo.slice(0, 22) : `${cutNo}컷 대사 자리` }),
      ],
    });
  });

  const root = makeNode({
    id: "webtoon-grid-root",
    nameKo: `세로 웹툰 ${panelCount}컷 오토레이아웃`,
    cssClass: "ts-webtoon-grid-root",
    role: "frame",
    direction: "grid",
    gridColumns: 1,
    gapPx: 32,
    paddingPx: 32,
    widthPx: 800,
    heightPx: panelCount * 320 + 180,
    tokens: { bgVar: "var(--canvas)", fgVar: "var(--fg)", borderVar: "var(--line)" },
    children: panelNodes,
  });

  return {
    id: `draft:grid:${panelCount}:${promptKo.length}`,
    mode: params.mode,
    modeLabelKo: FIRST_DRAFT_MODE_LABELS[params.mode],
    promptKo,
    root,
    totalNodeCount: countNodes(root),
    prototypeFlows: panelNodes.slice(0, -1).map((node, idx) => ({
      fromId: node.id,
      toId: panelNodes[idx + 1].id,
      trigger: "scroll" as const,
      transitionKo: idx === panelNodes.length - 2 ? "클라이맥스 낙하 여백 전개" : "자연스러운 세로 스크롤 전환",
    })),
  };
}

function classifySingleLayer(layer: RawLayerInput): { readonly groupCode: StudioLayerGroupCode; readonly confidence: number; readonly reasonKo: string } {
  const lower = layer.name.trim().toLowerCase();
  if (layer.hasText || layer.kind === "text" || /bubble|balloon|text|dialog|speech|caption|말풍선|대사|식자|자막/u.test(lower)) {
    return { groupCode: "03_BUBBLE", confidence: 0.96, reasonKo: "텍스트·말풍선 속성 감지" };
  }
  if (layer.kind === "effect" || layer.blendMode === "screen" || layer.blendMode === "add" || layer.blendMode === "overlay" || /fx|glow|bloom|flare|light|spark|blur|particle|효과|광선|빛|이펙트/u.test(lower)) {
    return { groupCode: "04_FX", confidence: 0.94, reasonKo: "발광·합성 효과 키워드/블렌드 감지" };
  }
  if (/bg|background|sky|room|wall|street|3d|scene|backdrop|배경|하늘|실내|바닥/u.test(lower) || (/^rectangle\s*\d*/u.test(lower) && (layer.zIndex ?? 0) === 0)) {
    return { groupCode: "00_BG", confidence: 0.92, reasonKo: "배경 공간 요소 또는 최하단 판별" };
  }
  if (layer.blendMode === "multiply" || /color|fill|paint|shade|shadow|skin|hair|base|tone|채색|밑색|명암|그림자|피부/u.test(lower)) {
    return { groupCode: "02_COLOR", confidence: 0.91, reasonKo: "채색·명암·곱하기(Multiply) 속성 감지" };
  }
  if (layer.kind === "vector" || /line|ink|sketch|pen|char|outline|vector|선화|스케치|펜선|인물|캐릭터/u.test(lower)) {
    return { groupCode: "01_CHAR_LINE", confidence: 0.89, reasonKo: "벡터·선화·인물 레이어 판별" };
  }
  return (layer.zIndex ?? 1) <= 0
    ? { groupCode: "00_BG", confidence: 0.72, reasonKo: "최하단 스택 위치 기준 배경 추정" }
    : { groupCode: "02_COLOR", confidence: 0.7, reasonKo: "일반 래스터 레이어 기본 채색군 분류" };
}

export function smartRenameAndOrganizeLayers(layers: readonly RawLayerInput[]): SmartRenameReport {
  const counters: Record<StudioLayerGroupCode, number> = { "00_BG": 0, "01_CHAR_LINE": 0, "02_COLOR": 0, "03_BUBBLE": 0, "04_FX": 0 };
  const labelByCode: Record<StudioLayerGroupCode, string> = { "00_BG": "00_배경", "01_CHAR_LINE": "01_캐릭터_선화", "02_COLOR": "02_채색", "03_BUBBLE": "03_말풍선", "04_FX": "04_효과" };

  const renamedLayers: RenamedLayerEntry[] = layers.map((layer) => {
    const { groupCode, confidence, reasonKo } = classifySingleLayer(layer);
    counters[groupCode] += 1;
    const seq = String(counters[groupCode]).padStart(2, "0");
    const groupLabelKo = labelByCode[groupCode];
    return { id: layer.id, originalName: layer.name, groupCode, groupLabelKo, newNameKo: `${groupLabelKo}_${seq}`, newNameEn: `${groupCode}_${seq}`, confidence, reasonKo };
  });

  const organizedGroups = STUDIO_LAYER_GROUPS.map((group) => {
    const matched = renamedLayers.filter((item) => item.groupCode === group.code);
    return { groupCode: group.code, labelKo: group.labelKo, count: matched.length, layerIds: matched.map((item) => item.id) };
  });

  const changedCount = renamedLayers.filter((item) => item.originalName.trim() !== item.newNameKo).length;
  return {
    renamedLayers,
    organizedGroups,
    changedCount,
    summaryKo: `총 ${layers.length}개 레이어 중 ${changedCount}개를 스튜디오 표준 5대 폴더 구조로 정리했습니다.`,
  };
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function parseOklchString(css: string): OklchColor | null {
  const match = css.trim().match(/^oklch\(\s*([0-9.]+)(%?)\s+([0-9.]+)\s+([0-9.]+)(?:deg)?(?:\s*\/\s*[0-9.%]+)?\s*\)$/iu);
  if (!match) return null;
  const rawL = Number(match[1]);
  const l = match[2] === "%" ? rawL / 100 : rawL;
  const c = Number(match[3]);
  const h = Number(match[4]);
  if (!Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(h)) return null;
  return { l: clamp01(l), c: Math.max(0, c), h: ((h % 360) + 360) % 360 };
}

export function formatOklchColor(color: OklchColor): string {
  const l = Math.round(clamp01(color.l) * 1000) / 1000;
  const c = Math.round(Math.max(0, color.c) * 1000) / 1000;
  const h = Math.round((((color.h % 360) + 360) % 360) * 10) / 10;
  return `oklch(${l} ${c} ${h})`;
}

/** Björn Ottosson OKLCH → OKLab → linear sRGB → 감마 인코딩 sRGB (0~255) */
export function oklchToSrgb(color: OklchColor): SrgbColor {
  const hRad = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(hRad);
  const b = color.c * Math.sin(hRad);
  const lComp = color.l + 0.3963377774 * a + 0.2158037573 * b;
  const mComp = color.l - 0.1055613458 * a - 0.0638541728 * b;
  const sComp = color.l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = lComp * lComp * lComp;
  const m3 = mComp * mComp * mComp;
  const s3 = sComp * sComp * sComp;

  const encode = (channel: number): number => {
    const clamped = clamp01(channel);
    const gamma = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    return Math.round(clamp01(gamma) * 255);
  };
  return {
    r: encode(+4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    g: encode(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    b: encode(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  };
}

/** WCAG 2.1 표준 sRGB 상대 휘도(Relative Luminance) 계산 */
export function computeRelativeLuminance(rgb: SrgbColor): number {
  const lin = (v: number): number => {
    const c = clamp01(v / 255);
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

function resolveToSrgb(input: OklchColor | SrgbColor | string): SrgbColor {
  if (typeof input === "string") {
    const parsed = parseOklchString(input);
    return parsed ? oklchToSrgb(parsed) : { r: 30, g: 30, b: 34 };
  }
  return "r" in input ? input : oklchToSrgb(input);
}

/** WCAG 2.1 대비율 계산: (L1 + 0.05) / (L2 + 0.05) */
export function computeWcagContrastRatio(
  foreground: OklchColor | SrgbColor | string,
  background: OklchColor | SrgbColor | string,
): number {
  const lFg = computeRelativeLuminance(resolveToSrgb(foreground));
  const lBg = computeRelativeLuminance(resolveToSrgb(background));
  return Math.round(((Math.max(lFg, lBg) + 0.05) / (Math.min(lFg, lBg) + 0.05)) * 100) / 100;
}

export function suggestAccessibleOklchForeground(
  fg: OklchColor,
  bg: OklchColor,
  targetRatio = 4.5,
): { readonly color: OklchColor; readonly ratio: number } {
  const currentRatio = computeWcagContrastRatio(fg, bg);
  if (currentRatio >= targetRatio) return { color: fg, ratio: currentRatio };

  let bestColor: OklchColor = fg;
  let bestRatio = currentRatio;
  let minShift = Number.POSITIVE_INFINITY;

  for (let step = 0; step <= 100; step += 1) {
    const candidateL = step / 100;
    const chromaFactor = candidateL < 0.2 || candidateL > 0.88 ? 0.35 : 0.85;
    const candidate: OklchColor = { l: candidateL, c: Math.min(fg.c, fg.c * chromaFactor), h: fg.h };
    const ratio = computeWcagContrastRatio(candidate, bg);
    const shift = Math.abs(candidateL - fg.l);
    if (ratio >= targetRatio && shift < minShift) {
      minShift = shift;
      bestColor = candidate;
      bestRatio = ratio;
    } else if (minShift === Number.POSITIVE_INFINITY && ratio > bestRatio) {
      bestColor = candidate;
      bestRatio = ratio;
    }
  }
  return { color: bestColor, ratio: bestRatio };
}

function collectNodesFlat(node: FigmaAutoLayoutNode, out: FigmaAutoLayoutNode[] = []): FigmaAutoLayoutNode[] {
  out.push(node);
  for (const child of node.children) collectNodesFlat(child, out);
  return out;
}

export function auditDesignSystemAndBubbleContrast(
  draft: FirstDraftDocument,
  contrastPairs: readonly SpeechBubbleContrastPair[],
): DesignSystemConsistencyAudit {
  const consistencyIssuesKo: string[] = [];
  for (const node of collectNodesFlat(draft.root)) {
    if (node.gapPx % 4 !== 0 || node.paddingPx % 4 !== 0) {
      consistencyIssuesKo.push(`'${node.nameKo}' 여백(${node.gapPx}/${node.paddingPx}px)이 4px 디자인 그리드에서 벗어났습니다.`);
    }
    if (node.role === "speech-bubble" && (node.fontSizePx ?? 18) < 16) {
      consistencyIssuesKo.push(`'${node.nameKo}' 말풍선 글자 크기(${node.fontSizePx}px)는 모바일 가독성 최소 16px 이상을 권장합니다.`);
    }
    if (node.role === "button" && node.heightPx < 44) {
      consistencyIssuesKo.push(`'${node.nameKo}' 터치 영역 높이(${node.heightPx}px)를 44px 이상으로 확보하세요.`);
    }
  }

  const contrastFindings: ContrastAuditFinding[] = contrastPairs.map((pair) => {
    const parsedFg = parseOklchString(pair.foregroundOklch) ?? { l: 0.48, c: 0.04, h: 250 };
    const parsedBg = parseOklchString(pair.backgroundOklch) ?? { l: 0.96, c: 0.01, h: 90 };
    const ratio = computeWcagContrastRatio(parsedFg, parsedBg);
    const passesAa = ratio >= 4.5;
    const passesAaa = ratio >= 7.0;
    if (passesAa) {
      return {
        id: pair.id,
        labelKo: pair.labelKo,
        foregroundOklch: pair.foregroundOklch,
        backgroundOklch: pair.backgroundOklch,
        contrastRatio: ratio,
        passesAa,
        passesAaa,
        suggestedForegroundOklch: null,
        suggestedContrastRatio: ratio,
        adviceKo: passesAaa
          ? `명도 대비 ${ratio}:1 — 최상급 가독성 기준을 충족합니다.`
          : `명도 대비 ${ratio}:1 — 모바일 말풍선 표준 대비(4.5:1)를 충족합니다.`,
      };
    }
    const fix = suggestAccessibleOklchForeground(parsedFg, parsedBg, 4.5);
    const suggestedCss = formatOklchColor(fix.color);
    return {
      id: pair.id,
      labelKo: pair.labelKo,
      foregroundOklch: pair.foregroundOklch,
      backgroundOklch: pair.backgroundOklch,
      contrastRatio: ratio,
      passesAa: false,
      passesAaa: false,
      suggestedForegroundOklch: suggestedCss,
      suggestedContrastRatio: fix.ratio,
      adviceKo: `현재 대비 ${ratio}:1로 4.5:1 미만입니다. 글자색을 ${suggestedCss}(대비 ${fix.ratio}:1)로 보정하세요.`,
    };
  });

  const passAaCount = contrastFindings.filter((item) => item.passesAa).length;
  const failAaCount = contrastFindings.length - passAaCount;
  const overallScore = Math.max(0, Math.min(100, 100 - failAaCount * 18 - consistencyIssuesKo.length * 10));

  return {
    overallScore,
    passAaCount,
    failAaCount,
    contrastFindings,
    consistencyIssuesKo,
    summaryKo:
      failAaCount === 0 && consistencyIssuesKo.length === 0
        ? `디자인 일관성 ${overallScore}점 · 모든 말풍선 대비가 4.5:1 기준을 통과했습니다.`
        : `디자인 일관성 ${overallScore}점 · 대비 보정 필요 ${failAaCount}건, 규격 개선 ${consistencyIssuesKo.length}건이 감지되었습니다.`,
  };
}

function renderNodeCss(node: FigmaAutoLayoutNode, rules: string[]): void {
  const layoutLines = node.direction === "grid"
    ? ["  display: grid;", `  grid-template-columns: repeat(${node.gridColumns ?? 1}, minmax(0, 1fr));`]
    : ["  display: flex;", `  flex-direction: ${node.direction === "horizontal" ? "row" : "column"};`];
  rules.push(
    [
      `.${node.cssClass} {`,
      ...layoutLines,
      `  gap: ${node.gapPx}px;`,
      `  padding: ${node.paddingPx}px;`,
      `  border-radius: ${node.radiusPx}px;`,
      `  background: ${node.tokens.bgVar};`,
      `  color: ${node.tokens.fgVar};`,
      `  border: 1px solid ${node.tokens.borderVar};`,
      ...(node.fontSizePx ? [`  font-size: ${node.fontSizePx}px;`] : []),
      "}",
    ].join("\n"),
  );
  for (const child of node.children) renderNodeCss(child, rules);
}

export function exportAutoLayoutBridge(draft: FirstDraftDocument): AutoLayoutBridgeExport {
  const cssRules: string[] = [];
  renderNodeCss(draft.root, cssRules);
  const flatNodes = collectNodesFlat(draft.root);
  const panelCount = flatNodes.filter((item) => item.role === "panel").length;
  const bubbleCount = flatNodes.filter((item) => item.role === "speech-bubble").length;

  const mcpToolChain: McpToolStep[] = [
    { step: 1, toolName: "studio.canvas.create", purposeKo: `${draft.root.widthPx}×${draft.root.heightPx} 작업 캔버스 생성`, params: { width: draft.root.widthPx, height: draft.root.heightPx, mode: draft.mode } },
    { step: 2, toolName: "studio.panel.apply_autolayout", purposeKo: `${Math.max(1, panelCount)}개 오토레이아웃 프레임·패널 트리 배치`, params: { direction: draft.root.direction, gapPx: draft.root.gapPx, paddingPx: draft.root.paddingPx, nodeCount: draft.totalNodeCount } },
    { step: 3, toolName: "studio.layer.organize_standard", purposeKo: "00_배경~04_효과 5대 레이어 구조 잠금", params: { standard: "kwebtoon-5-group", enforceLock: true } },
    ...(bubbleCount > 0 ? [{ step: 4, toolName: "studio.lettering.place_bubbles", purposeKo: `${bubbleCount}개 말풍선 배치 및 4.5:1 대비 검증`, params: { bubbleCount, minContrastRatio: 4.5 } }] : []),
    { step: bubbleCount > 0 ? 5 : 4, toolName: "studio.export.preflight_check", purposeKo: "출고 규격 및 디자인 토큰 일관성 최종 확인", params: { zeroPaidApi: true, checkContrast: true } },
  ];

  return {
    cssCode: cssRules.join("\n\n"),
    jsonSchema: JSON.stringify({ schemaVersion: "toonstudio-autolayout-v1", draftId: draft.id, mode: draft.mode, root: draft.root, prototypeFlows: draft.prototypeFlows }, null, 2),
    mcpToolChain,
  };
}

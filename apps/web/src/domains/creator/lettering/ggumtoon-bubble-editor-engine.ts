/**
 * ggumtoon-bubble-editor-engine.ts
 *
 * https://www.ggumtoon.com/studio (`0-du3dytc8ifq.js` 내 `BubbleEditor` 및 `087envq-b9~k8.js` Fabric.js 연동)
 * REA 역공학 분석으로 추출한 말풍선·효과·40종 한글 서체·8종 도형 클립 프레임·6방향 정렬·60단계 히스토리 엔진.
 */

export interface GgumtoonBubbleAssetTemplate {
  readonly id: number;
  readonly assetNumber: number;
  readonly src: string;
  readonly label: string;
  readonly category: "bubble" | "effect";
}

/**
 * 0-du3dytc8ifq.js (오프셋 27900)에서 관측된 66종 말풍선 에셋 순서:
 * [57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 1..56] -> id 1..66, `/bubbles/bubble-${e}.png`
 */
const BUBBLE_ASSET_ORDER: readonly number[] = [
  57,
  58,
  59,
  60,
  61,
  62,
  63,
  64,
  65,
  66,
  ...Array.from({ length: 56 }, (_, idx) => idx + 1),
];

export const GGUMTOON_BUBBLE_TEMPLATES: readonly GgumtoonBubbleAssetTemplate[] =
  BUBBLE_ASSET_ORDER.map((assetNumber, idx) => ({
    id: idx + 1,
    assetNumber,
    src: `/bubbles/bubble-${assetNumber}.png`,
    label: `말풍선 ${idx + 1}`,
    category: "bubble",
  }));

export const GGUMTOON_EFFECT_TEMPLATES: readonly GgumtoonBubbleAssetTemplate[] = [
  "effect-1",
  "effect-2",
  "effect-3",
].map((name, idx) => ({
  id: idx + 1,
  assetNumber: idx + 1,
  src: `/effects/${name}.png`,
  label: `효과 ${idx + 1}`,
  category: "effect",
}));

export interface GgumtoonBubbleFontSpec {
  readonly family: string;
  readonly label: string;
  readonly group: "nanum" | "google-kr" | "chosun" | "kmu80" | "moneygraphy";
}

/**
 * 0-du3dytc8ifq.js (오프셋 28060)에서 관측된 40종 한국어 웹툰·식자 폰트 카탈로그 정본
 */
export const GGUMTOON_BUBBLE_FONTS: readonly GgumtoonBubbleFontSpec[] = [
  { family: "NanumGothic", label: "나눔고딕", group: "nanum" },
  { family: "NanumBarunGothic", label: "나눔바른고딕", group: "nanum" },
  { family: "NanumSquare", label: "나눔스퀘어", group: "nanum" },
  { family: "NanumSquareRound", label: "나눔스퀘어라운드", group: "nanum" },
  { family: "NanumSquareNeo", label: "나눔스퀘어네오", group: "nanum" },
  { family: "NanumMyeongjo", label: "나눔명조", group: "nanum" },
  { family: "NanumBarunPen", label: "나눔바른펜", group: "nanum" },
  { family: "Noto Sans KR", label: "노토 산스", group: "google-kr" },
  { family: "Gothic A1", label: "고딕 A1", group: "google-kr" },
  { family: "Black Han Sans", label: "검은 고딕", group: "google-kr" },
  { family: "Jua", label: "주아", group: "google-kr" },
  { family: "Do Hyeon", label: "도현", group: "google-kr" },
  { family: "Noto Serif KR", label: "노토 세리프", group: "google-kr" },
  { family: "Gowun Batang", label: "고운바탕", group: "google-kr" },
  { family: "Song Myung", label: "송명", group: "google-kr" },
  { family: "Hahmlet", label: "함렛", group: "google-kr" },
  { family: "Nanum Brush Script", label: "나눔 붓", group: "google-kr" },
  { family: "Nanum Pen Script", label: "나눔 펜", group: "google-kr" },
  { family: "Gaegu", label: "개구", group: "google-kr" },
  { family: "Hi Melody", label: "하이멜로디", group: "google-kr" },
  { family: "Gamja Flower", label: "감자꽃", group: "google-kr" },
  { family: "Dokdo", label: "독도", group: "google-kr" },
  { family: "Cute Font", label: "귀여운폰트", group: "google-kr" },
  { family: "Sunflower", label: "해바라기", group: "google-kr" },
  { family: "ChosunBg", label: "조선 Bg", group: "chosun" },
  { family: "ChosunCentennial", label: "조선 창간체", group: "chosun" },
  { family: "ChosunGs", label: "조선 Gs", group: "chosun" },
  { family: "ChosunGu", label: "조선 Gu", group: "chosun" },
  { family: "ChosunKg", label: "조선 Kg", group: "chosun" },
  { family: "ChosunKm", label: "조선 Km", group: "chosun" },
  { family: "ChosunLo", label: "조선 Lo", group: "chosun" },
  { family: "ChosunNm", label: "조선 Nm", group: "chosun" },
  { family: "ChosunSg", label: "조선 Sg", group: "chosun" },
  { family: "ChosunSm", label: "조선 Sm", group: "chosun" },
  { family: "KMU80HaeongSans", label: "해옹 산스", group: "kmu80" },
  { family: "KMU80HaeongSemiSans", label: "해옹 세미산스", group: "kmu80" },
  { family: "KMU80SungkokSemiSerif", label: "성곡 세미세리프", group: "kmu80" },
  { family: "KMU80SungkokSerif", label: "성곡 세리프", group: "kmu80" },
  { family: "MoneygraphyPixel", label: "머니그래피 픽셀", group: "moneygraphy" },
  { family: "MoneygraphyRounded", label: "머니그래피 라운드", group: "moneygraphy" },
] as const;

export const GGUMTOON_DEFAULT_CANVAS_FONT = "NanumSquare";
export const GGUMTOON_DEFAULT_ITEXT_FONT = "NanumGothic";
export const GGUMTOON_FONT_PRELOAD_SAMPLE_TEXT =
  "가나다라마바사아자차카타파하텍스트를입력하세요힘꿈웹툰만화력텍";
export const GGUMTOON_FAV_FONTS_STORAGE_KEY = "dreamtoon_fav_fonts";
export const GGUMTOON_CANVAS_BASE_WIDTH = 600;
export const GGUMTOON_MAX_HISTORY_STEPS = 60;

export type GgumtoonClipFrameType =
  | "none"
  | "circle"
  | "rect"
  | "roundRect"
  | "hexagon"
  | "pentagon"
  | "triangle"
  | "diamond"
  | "star";

export interface GgumtoonClipFrameSpec {
  readonly id: GgumtoonClipFrameType;
  readonly label: string;
  readonly verticesCount: number;
}

/**
 * 0-du3dytc8ifq.js (오프셋 72100)에서 관측된 삽입 이미지(`custom-image`) 9종 도형 클립 프레임
 */
export const GGUMTOON_CLIP_FRAMES: readonly GgumtoonClipFrameSpec[] = [
  { id: "none", label: "원본", verticesCount: 4 },
  { id: "circle", label: "원형", verticesCount: 32 },
  { id: "rect", label: "사각형", verticesCount: 4 },
  { id: "roundRect", label: "둥근사각", verticesCount: 8 },
  { id: "hexagon", label: "육각형", verticesCount: 6 },
  { id: "pentagon", label: "오각형", verticesCount: 5 },
  { id: "triangle", label: "삼각형", verticesCount: 3 },
  { id: "diamond", label: "마름모", verticesCount: 4 },
  { id: "star", label: "별", verticesCount: 10 },
] as const;

export type GgumtoonCanvasAlignType =
  | "left"
  | "center-h"
  | "right"
  | "top"
  | "center-v"
  | "bottom";

export interface GgumtoonCanvasAlignSpec {
  readonly id: GgumtoonCanvasAlignType;
  readonly label: string;
}

export const GGUMTOON_CANVAS_ALIGNMENTS: readonly GgumtoonCanvasAlignSpec[] = [
  { id: "left", label: "좌측 정렬" },
  { id: "center-h", label: "가로 중앙" },
  { id: "right", label: "우측 정렬" },
  { id: "top", label: "상단 정렬" },
  { id: "center-v", label: "세로 중앙" },
  { id: "bottom", label: "하단 정렬" },
] as const;

/**
 * 말풍선·효과 번호 검색 필터 (`$.trim() ? ts.filter(e => e.id.toString().includes(w)) : ts`)
 */
export function filterGgumtoonBubbleOrEffectTemplates(
  category: "bubble" | "effect",
  searchNumberQuery: string,
): readonly GgumtoonBubbleAssetTemplate[] {
  const source =
    category === "bubble" ? GGUMTOON_BUBBLE_TEMPLATES : GGUMTOON_EFFECT_TEMPLATES;
  const trimmed = searchNumberQuery.trim();
  if (!trimmed) return source;
  return source.filter((item) => item.id.toString().includes(trimmed));
}

/**
 * 즐겨찾기 폰트 토글 및 상단 고정 분할 (`dreamtoon_fav_fonts`)
 */
export function toggleGgumtoonFavoriteFont(
  favoriteFamilies: readonly string[],
  targetFamily: string,
): readonly string[] {
  if (favoriteFamilies.includes(targetFamily)) {
    return favoriteFamilies.filter((fam) => fam !== targetFamily);
  }
  return [...favoriteFamilies, targetFamily];
}

export function partitionGgumtoonFontsByFavorite(
  favoriteFamilies: readonly string[],
): {
  readonly favorites: readonly GgumtoonBubbleFontSpec[];
  readonly others: readonly GgumtoonBubbleFontSpec[];
} {
  const favSet = new Set(favoriteFamilies);
  return {
    favorites: GGUMTOON_BUBBLE_FONTS.filter((f) => favSet.has(f.family)),
    others: GGUMTOON_BUBBLE_FONTS.filter((f) => !favSet.has(f.family)),
  };
}

/**
 * 도형 프레임(`clipFrame`) 정다각형/별 꼭짓점 좌표 생성기 (정규화 범위 `-0.5 .. +0.5`)
 */
export function computeGgumtoonClipFramePolygon(
  frame: GgumtoonClipFrameType,
): readonly { readonly x: number; readonly y: number }[] {
  switch (frame) {
    case "none":
    case "rect":
    case "roundRect":
      return [
        { x: -0.5, y: -0.5 },
        { x: 0.5, y: -0.5 },
        { x: 0.5, y: 0.5 },
        { x: -0.5, y: 0.5 },
      ];
    case "triangle":
      return [
        { x: 0, y: -0.5 },
        { x: 0.5, y: 0.5 },
        { x: -0.5, y: 0.5 },
      ];
    case "diamond":
      return [
        { x: 0, y: -0.5 },
        { x: 0.5, y: 0 },
        { x: 0, y: 0.5 },
        { x: -0.5, y: 0 },
      ];
    case "pentagon":
    case "hexagon":
    case "circle": {
      const sides = frame === "pentagon" ? 5 : frame === "hexagon" ? 6 : 32;
      return Array.from({ length: sides }, (_, idx) => {
        const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / sides;
        return {
          x: Math.round(0.5 * Math.cos(angle) * 1000) / 1000,
          y: Math.round(0.5 * Math.sin(angle) * 1000) / 1000,
        };
      });
    }
    case "star": {
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? 0.5 : 0.22;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        points.push({
          x: Math.round(radius * Math.cos(angle) * 1000) / 1000,
          y: Math.round(radius * Math.sin(angle) * 1000) / 1000,
        });
      }
      return points;
    }
  }
}

export type GgumtoonCanvasObjectDataType =
  | "scene-bg"
  | "bubble"
  | "speech-text"
  | "custom-image";

export interface GgumtoonCanvasLayerObject {
  readonly id: string;
  readonly dataType: GgumtoonCanvasObjectDataType;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly opacity: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly text?: string;
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontWeight?: "normal" | "bold";
  readonly fontStyle?: "normal" | "italic";
  readonly underline?: boolean;
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly textAlign?: "left" | "center" | "right";
  readonly clipFrame?: GgumtoonClipFrameType;
}

/**
 * 캔버스 레이어 6방향 위치 정렬 계산기 (`left`, `center-h`, `right`, `top`, `center-v`, `bottom`)
 */
export function computeGgumtoonAlignedObjectPosition(params: {
  readonly object: Pick<
    GgumtoonCanvasLayerObject,
    "left" | "top" | "width" | "height" | "scaleX" | "scaleY"
  >;
  readonly align: GgumtoonCanvasAlignType;
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
}): { readonly left: number; readonly top: number } {
  const cw = params.canvasWidth ?? GGUMTOON_CANVAS_BASE_WIDTH;
  const ch = params.canvasHeight ?? 900;
  const scaledW = params.object.width * params.object.scaleX;
  const scaledH = params.object.height * params.object.scaleY;

  switch (params.align) {
    case "left":
      return { left: 16, top: params.object.top };
    case "center-h":
      return { left: Math.round((cw - scaledW) / 2), top: params.object.top };
    case "right":
      return { left: Math.round(cw - scaledW - 16), top: params.object.top };
    case "top":
      return { left: params.object.left, top: 16 };
    case "center-v":
      return { left: params.object.left, top: Math.round((ch - scaledH) / 2) };
    case "bottom":
      return { left: params.object.left, top: Math.round(ch - scaledH - 16) };
  }
}

/**
 * `Ctrl+D` 복제 시 `+20px` 오프셋 적용 및 `scene-bg` 삭제 방지 규칙
 */
export function cloneGgumtoonCanvasObjectWithOffset(
  obj: GgumtoonCanvasLayerObject,
  newId: string,
): GgumtoonCanvasLayerObject {
  return {
    ...obj,
    id: newId,
    left: obj.left + 20,
    top: obj.top + 20,
  };
}

export function canDeleteGgumtoonCanvasObject(
  obj: Pick<GgumtoonCanvasLayerObject, "dataType">,
): boolean {
  return obj.dataType !== "scene-bg";
}

export interface GgumtoonCanvasHistoryState {
  readonly snapshots: readonly string[];
  readonly currentIndex: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

/**
 * 0-du3dytc8ifq.js `ta`/`ti`/`tn` (60단계 링 버퍼 `r.length > 60 && r.shift()`) 히스토리 상태 머신
 */
export function createEmptyGgumtoonCanvasHistory(
  initialSnapshot?: string,
): GgumtoonCanvasHistoryState {
  if (!initialSnapshot) {
    return {
      snapshots: [],
      currentIndex: -1,
      canUndo: false,
      canRedo: false,
    };
  }
  return {
    snapshots: [initialSnapshot],
    currentIndex: 0,
    canUndo: false,
    canRedo: false,
  };
}

export function pushGgumtoonCanvasHistorySnapshot(
  state: GgumtoonCanvasHistoryState,
  snapshotJson: string,
): GgumtoonCanvasHistoryState {
  const nextList = state.snapshots.slice(0, state.currentIndex + 1);
  nextList.push(snapshotJson);
  while (nextList.length > GGUMTOON_MAX_HISTORY_STEPS) {
    nextList.shift();
  }
  const nextIndex = nextList.length - 1;
  return {
    snapshots: nextList,
    currentIndex: nextIndex,
    canUndo: nextIndex > 0,
    canRedo: false,
  };
}

export function undoGgumtoonCanvasHistory(
  state: GgumtoonCanvasHistoryState,
): {
  readonly state: GgumtoonCanvasHistoryState;
  readonly snapshot: string | null;
} {
  if (state.currentIndex <= 0) {
    return { state, snapshot: state.snapshots[state.currentIndex] ?? null };
  }
  const nextIndex = state.currentIndex - 1;
  return {
    state: {
      snapshots: state.snapshots,
      currentIndex: nextIndex,
      canUndo: nextIndex > 0,
      canRedo: true,
    },
    snapshot: state.snapshots[nextIndex] ?? null,
  };
}

export function redoGgumtoonCanvasHistory(
  state: GgumtoonCanvasHistoryState,
): {
  readonly state: GgumtoonCanvasHistoryState;
  readonly snapshot: string | null;
} {
  if (state.currentIndex >= state.snapshots.length - 1) {
    return { state, snapshot: state.snapshots[state.currentIndex] ?? null };
  }
  const nextIndex = state.currentIndex + 1;
  return {
    state: {
      snapshots: state.snapshots,
      currentIndex: nextIndex,
      canUndo: true,
      canRedo: nextIndex < state.snapshots.length - 1,
    },
    snapshot: state.snapshots[nextIndex] ?? null,
  };
}

export type GgumtoonBubbleTailDirection =
  | "bottom-left"
  | "bottom-right"
  | "top-left"
  | "top-right"
  | "none";

/**
 * 0-du3dytc8ifq.js (함수 `S(e,t,r,s)`, 오프셋 94271)에서 관측된
 * 라운드 말풍선 및 방향별 꼬리(`bottom-left`, `bottom-right`, `top-left`, `top-right`, `none`) SVG Path 생성기
 */
export function buildGgumtoonBubbleTailSvgPath(params: {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly tail: GgumtoonBubbleTailDirection;
}): string {
  const sx = params.scaleX ?? 1;
  const sy = params.scaleY ?? 1;
  const l = params.x * sx;
  const a = params.y * sy;
  const o = params.w * sx;
  const i = params.h * sy;
  const r = Math.min(12 * sx, 0.1 * o, 0.1 * i);
  const d = 18 * sy;
  const c = Math.min(28 * sx, 0.2 * o);

  if (params.tail === "bottom-left") {
    return [
      `M ${l + r} ${a}`,
      `L ${l + o - r} ${a}`,
      `Q ${l + o} ${a} ${l + o} ${a + r}`,
      `L ${l + o} ${a + i - r}`,
      `Q ${l + o} ${a + i} ${l + o - r} ${a + i}`,
      `L ${l + c + 16 * sx} ${a + i}`,
      `L ${l + c - 6 * sx} ${a + i + d}`,
      `L ${l + c} ${a + i}`,
      `L ${l + r} ${a + i}`,
      `Q ${l} ${a + i} ${l} ${a + i - r}`,
      `L ${l} ${a + r}`,
      `Q ${l} ${a} ${l + r} ${a}`,
      "Z",
    ].join(" ");
  }

  if (params.tail === "bottom-right") {
    return [
      `M ${l + r} ${a}`,
      `L ${l + o - r} ${a}`,
      `Q ${l + o} ${a} ${l + o} ${a + r}`,
      `L ${l + o} ${a + i - r}`,
      `Q ${l + o} ${a + i} ${l + o - r} ${a + i}`,
      `L ${l + o - c} ${a + i}`,
      `L ${l + o - c + 6 * sx} ${a + i + d}`,
      `L ${l + o - c - 16 * sx} ${a + i}`,
      `L ${l + r} ${a + i}`,
      `Q ${l} ${a + i} ${l} ${a + i - r}`,
      `L ${l} ${a + r}`,
      `Q ${l} ${a} ${l + r} ${a}`,
      "Z",
    ].join(" ");
  }

  return [
    `M ${l + r} ${a}`,
    `L ${l + o - r} ${a}`,
    `Q ${l + o} ${a} ${l + o} ${a + r}`,
    `L ${l + o} ${a + i - r}`,
    `Q ${l + o} ${a + i} ${l + o - r} ${a + i}`,
    `L ${l + r} ${a + i}`,
    `Q ${l} ${a + i} ${l} ${a + i - r}`,
    `L ${l} ${a + r}`,
    `Q ${l} ${a} ${l + r} ${a}`,
    "Z",
  ].join(" ");
}

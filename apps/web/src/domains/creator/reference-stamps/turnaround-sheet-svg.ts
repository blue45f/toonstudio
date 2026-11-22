/**
 * 캐릭터 4방향 턴어라운드 비율 시트 벡터 SVG 밑그림 생성기.
 *
 * 정면·반측면·측면·후면 4방향 와이어프레임 인체 비율 가이드와
 * 6~8등신 선택에 따른 눈·턱·어깨·허리·무릎 기준선을 순수 SVG 문자열로 생성한다.
 */

export const TURNAROUND_HEAD_RATIOS = [6, 6.5, 7, 7.5, 8] as const;
export type TurnaroundHeadRatio = (typeof TURNAROUND_HEAD_RATIOS)[number];

export type TurnaroundViewId = "front" | "three-quarter" | "side" | "back";

export interface TurnaroundViewDescriptor {
  readonly id: TurnaroundViewId;
  readonly labelKo: string;
  readonly noteKo: string;
}

export const TURNAROUND_VIEWS: readonly TurnaroundViewDescriptor[] = [
  { id: "front", labelKo: "정면", noteKo: "좌우 대칭·어깨 폭 기준" },
  { id: "three-quarter", labelKo: "반측면", noteKo: "3/4 회전·입체 중심축" },
  { id: "side", labelKo: "측면", noteKo: "두개골 깊이·S자 척추선" },
  { id: "back", labelKo: "후면", noteKo: "견갑골·척추·오금 정렬" },
] as const;

export type TurnaroundGuideLineId =
  | "crown"
  | "eyes"
  | "chin"
  | "shoulders"
  | "waist"
  | "pelvis"
  | "knees"
  | "ankles";

export interface TurnaroundGuideLine {
  readonly id: TurnaroundGuideLineId;
  readonly labelKo: string;
  /** 정수리(0)부터 발바닥(headRatio)까지의 등신 단위 위치. */
  readonly headUnit: number;
  /** SVG 내부 Y 좌표(px). */
  readonly yPx: number;
  readonly emphasis: "primary" | "secondary";
}

export type ReferenceStampInkStyle = "blueprint" | "graphite" | "magenta-rough";

export interface ReferenceStampPalette {
  readonly id: ReferenceStampInkStyle;
  readonly labelKo: string;
  readonly strokePrimary: string;
  readonly strokeSecondary: string;
  readonly guideLine: string;
  readonly guideLabel: string;
  readonly jointFill: string;
  readonly background: string;
}

export const REFERENCE_STAMP_PALETTES: Readonly<
  Record<ReferenceStampInkStyle, ReferenceStampPalette>
> = {
  blueprint: {
    id: "blueprint",
    labelKo: "청사진 블루",
    strokePrimary: "#2563eb",
    strokeSecondary: "#60a5fa",
    guideLine: "#3b82f6",
    guideLabel: "#1d4ed8",
    jointFill: "#93c5fd",
    background: "#f8fbff",
  },
  graphite: {
    id: "graphite",
    labelKo: "흑연 러프",
    strokePrimary: "#334155",
    strokeSecondary: "#64748b",
    guideLine: "#94a3b8",
    guideLabel: "#334155",
    jointFill: "#cbd5e1",
    background: "#fafafa",
  },
  "magenta-rough": {
    id: "magenta-rough",
    labelKo: "밑그림 마젠타",
    strokePrimary: "#be185d",
    strokeSecondary: "#f472b6",
    guideLine: "#ec4899",
    guideLabel: "#9d174d",
    jointFill: "#fbcfe8",
    background: "#fff8fb",
  },
};

export interface TurnaroundSheetOptions {
  readonly headRatio: TurnaroundHeadRatio;
  readonly views?: readonly TurnaroundViewId[];
  readonly style?: ReferenceStampInkStyle;
  readonly showLabels?: boolean;
  readonly showGrid?: boolean;
  readonly showJoints?: boolean;
  readonly title?: string;
}

export interface TurnaroundSheetResult {
  readonly svg: string;
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly headRatio: TurnaroundHeadRatio;
  readonly views: readonly TurnaroundViewId[];
  readonly guideLines: readonly TurnaroundGuideLine[];
}

const SHEET_HEIGHT = 760;
const TOP_MARGIN = 76;
const BOTTOM_MARGIN = 54;
const LEFT_LABEL_GUTTER = 104;
const RIGHT_MARGIN = 36;
const COLUMN_WIDTH = 200;

function fmt(value: number): string {
  return Number(value.toFixed(1)).toString();
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 선택한 등신(6~8등신)에 맞춰 눈·턱·어깨·허리·무릎 핵심 기준선과 보조 기준선을 계산한다.
 */
export function computeTurnaroundGuideLines(
  headRatio: TurnaroundHeadRatio,
  sheetHeight = SHEET_HEIGHT,
  topMargin = TOP_MARGIN,
  bottomMargin = BOTTOM_MARGIN,
): readonly TurnaroundGuideLine[] {
  const figureHeight = sheetHeight - topMargin - bottomMargin;
  const unitPx = figureHeight / headRatio;
  const toY = (headUnit: number) => topMargin + headUnit * unitPx;

  const shoulderUnit = headRatio <= 6.5 ? 1.42 : 1.5;
  const waistUnit = Number((1.5 + (headRatio - 1.5) * 0.24).toFixed(2));
  const pelvisUnit = Number((headRatio * 0.5).toFixed(2));
  const kneeUnit = Number((headRatio * 0.74).toFixed(2));
  const ankleUnit = Number((headRatio - 0.32).toFixed(2));

  return [
    { id: "crown", labelKo: "정수리", headUnit: 0, yPx: toY(0), emphasis: "secondary" },
    { id: "eyes", labelKo: "눈", headUnit: 0.5, yPx: toY(0.5), emphasis: "primary" },
    { id: "chin", labelKo: "턱", headUnit: 1, yPx: toY(1), emphasis: "primary" },
    {
      id: "shoulders",
      labelKo: "어깨",
      headUnit: shoulderUnit,
      yPx: toY(shoulderUnit),
      emphasis: "primary",
    },
    { id: "waist", labelKo: "허리", headUnit: waistUnit, yPx: toY(waistUnit), emphasis: "primary" },
    {
      id: "pelvis",
      labelKo: "골반",
      headUnit: pelvisUnit,
      yPx: toY(pelvisUnit),
      emphasis: "secondary",
    },
    { id: "knees", labelKo: "무릎", headUnit: kneeUnit, yPx: toY(kneeUnit), emphasis: "primary" },
    {
      id: "ankles",
      labelKo: "발목",
      headUnit: ankleUnit,
      yPx: toY(ankleUnit),
      emphasis: "secondary",
    },
  ];
}

function guideY(guides: readonly TurnaroundGuideLine[], id: TurnaroundGuideLineId): number {
  return guides.find((line) => line.id === id)?.yPx ?? TOP_MARGIN;
}

function renderJoints(
  points: readonly (readonly [number, number])[],
  palette: ReferenceStampPalette,
): string {
  return points
    .map(
      ([x, y]) =>
        `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="3.4" fill="${palette.jointFill}" stroke="${palette.strokePrimary}" stroke-width="1.2" />`,
    )
    .join("");
}

function renderFigureColumn(
  view: TurnaroundViewId,
  centerX: number,
  guides: readonly TurnaroundGuideLine[],
  unitPx: number,
  floorY: number,
  palette: ReferenceStampPalette,
  showJoints: boolean,
): string {
  const crownY = guideY(guides, "crown");
  const eyesY = guideY(guides, "eyes");
  const chinY = guideY(guides, "chin");
  const shoulderY = guideY(guides, "shoulders");
  const waistY = guideY(guides, "waist");
  const pelvisY = guideY(guides, "pelvis");
  const kneeY = guideY(guides, "knees");
  const ankleY = guideY(guides, "ankles");

  const headCenterY = (crownY + chinY) / 2;
  const headRy = unitPx * 0.5;
  const headRx = view === "side" ? unitPx * 0.42 : unitPx * 0.36;
  const shoulderHalf =
    view === "side" ? unitPx * 0.22 : view === "three-quarter" ? unitPx * 0.68 : unitPx * 0.82;
  const waistHalf =
    view === "side" ? unitPx * 0.24 : view === "three-quarter" ? unitPx * 0.44 : unitPx * 0.5;
  const pelvisHalf =
    view === "side" ? unitPx * 0.3 : view === "three-quarter" ? unitPx * 0.56 : unitPx * 0.64;
  const elbowY = waistY - unitPx * 0.06;
  const wristY = pelvisY + unitPx * 0.16;

  const parts: string[] = [];
  parts.push(`<g data-turnaround-view="${view}">`);
  // 중심 수직축
  parts.push(
    `<line x1="${fmt(centerX)}" y1="${fmt(crownY - 12)}" x2="${fmt(centerX)}" y2="${fmt(floorY + 8)}" stroke="${palette.guideLine}" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="4 4" />`,
  );

  // 두개골 외곽선
  parts.push(
    `<ellipse cx="${fmt(centerX)}" cy="${fmt(headCenterY)}" rx="${fmt(headRx)}" ry="${fmt(headRy)}" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.8" />`,
  );

  if (view === "front") {
    parts.push(
      `<line x1="${fmt(centerX - headRx)}" y1="${fmt(eyesY)}" x2="${fmt(centerX + headRx)}" y2="${fmt(eyesY)}" stroke="${palette.strokeSecondary}" stroke-width="1.1" />`,
      `<line x1="${fmt(centerX)}" y1="${fmt(crownY)}" x2="${fmt(centerX)}" y2="${fmt(chinY)}" stroke="${palette.strokeSecondary}" stroke-width="1" />`,
      `<line x1="${fmt(centerX - headRx * 0.28)}" y1="${fmt(chinY - headRy * 0.28)}" x2="${fmt(centerX + headRx * 0.28)}" y2="${fmt(chinY - headRy * 0.28)}" stroke="${palette.strokeSecondary}" stroke-width="1" />`,
    );
  } else if (view === "three-quarter") {
    const shiftX = headRx * 0.34;
    parts.push(
      `<path d="M ${fmt(centerX + shiftX * 0.5)} ${fmt(crownY)} Q ${fmt(centerX + shiftX * 1.45)} ${fmt(eyesY)} ${fmt(centerX + shiftX * 0.7)} ${fmt(chinY)}" fill="none" stroke="${palette.strokeSecondary}" stroke-width="1.2" />`,
      `<path d="M ${fmt(centerX - headRx * 0.92)} ${fmt(eyesY)} Q ${fmt(centerX + shiftX)} ${fmt(eyesY + 3)} ${fmt(centerX + headRx * 0.98)} ${fmt(eyesY - 1)}" fill="none" stroke="${palette.strokeSecondary}" stroke-width="1.1" />`,
      `<ellipse cx="${fmt(centerX - headRx * 0.85)}" cy="${fmt(eyesY + 4)}" rx="3.2" ry="7.5" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.2" />`,
    );
  } else if (view === "side") {
    const noseX = centerX + headRx * 1.18;
    parts.push(
      `<path d="M ${fmt(centerX + headRx * 0.6)} ${fmt(eyesY - 8)} L ${fmt(noseX)} ${fmt(eyesY + 9)} L ${fmt(centerX + headRx * 0.82)} ${fmt(eyesY + 13)} L ${fmt(centerX + headRx * 0.72)} ${fmt(chinY)}" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.6" />`,
      `<line x1="${fmt(centerX - headRx * 0.8)}" y1="${fmt(eyesY)}" x2="${fmt(centerX + headRx * 0.96)}" y2="${fmt(eyesY)}" stroke="${palette.strokeSecondary}" stroke-width="1.1" />`,
      `<ellipse cx="${fmt(centerX - headRx * 0.14)}" cy="${fmt(eyesY + 5)}" rx="3.4" ry="8" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.2" />`,
    );
  } else {
    // 후면: 후두부 곡선 + 양쪽 귀
    parts.push(
      `<path d="M ${fmt(centerX - headRx * 0.78)} ${fmt(eyesY + 8)} Q ${fmt(centerX)} ${fmt(chinY - 6)} ${fmt(centerX + headRx * 0.78)} ${fmt(eyesY + 8)}" fill="none" stroke="${palette.strokeSecondary}" stroke-width="1.1" stroke-dasharray="3 3" />`,
      `<ellipse cx="${fmt(centerX - headRx * 1.02)}" cy="${fmt(eyesY + 4)}" rx="2.8" ry="7.5" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.2" />`,
      `<ellipse cx="${fmt(centerX + headRx * 1.02)}" cy="${fmt(eyesY + 4)}" rx="2.8" ry="7.5" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.2" />`,
    );
  }

  // 목
  const neckHalf = view === "side" ? unitPx * 0.17 : unitPx * 0.18;
  parts.push(
    `<line x1="${fmt(centerX - neckHalf)}" y1="${fmt(chinY - 2)}" x2="${fmt(centerX - neckHalf * 1.1)}" y2="${fmt(shoulderY)}" stroke="${palette.strokePrimary}" stroke-width="1.5" />`,
    `<line x1="${fmt(centerX + neckHalf)}" y1="${fmt(chinY - 2)}" x2="${fmt(centerX + neckHalf * 1.1)}" y2="${fmt(shoulderY)}" stroke="${palette.strokePrimary}" stroke-width="1.5" />`,
  );

  // 몸통 (흉곽 + 허리 + 골반)
  if (view === "side") {
    const chestBack = centerX - unitPx * 0.34;
    const chestFront = centerX + unitPx * 0.34;
    parts.push(
      `<path d="M ${fmt(centerX - 4)} ${fmt(shoulderY)} C ${fmt(chestBack - 6)} ${fmt(shoulderY + unitPx * 0.55)} ${fmt(centerX - waistHalf * 0.9)} ${fmt(waistY)} ${fmt(centerX - pelvisHalf * 1.08)} ${fmt(pelvisY)} L ${fmt(centerX + pelvisHalf * 0.92)} ${fmt(pelvisY)} C ${fmt(centerX + waistHalf * 0.85)} ${fmt(waistY)} ${fmt(chestFront + 6)} ${fmt(shoulderY + unitPx * 0.55)} ${fmt(centerX + 8)} ${fmt(shoulderY)} Z" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.7" />`,
      // S자 척추 안내선
      `<path d="M ${fmt(centerX - 4)} ${fmt(chinY)} C ${fmt(centerX - 16)} ${fmt(shoulderY + unitPx * 0.4)} ${fmt(centerX + 6)} ${fmt(waistY)} ${fmt(centerX - 6)} ${fmt(pelvisY)}" fill="none" stroke="${palette.strokeSecondary}" stroke-width="1.2" stroke-dasharray="4 3" />`,
      // 측면 팔
      `<polyline points="${fmt(centerX - 2)},${fmt(shoulderY + 5)} ${fmt(centerX - 8)},${fmt(elbowY)} ${fmt(centerX + 6)},${fmt(wristY)}" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.7" />`,
      // 측면 다리 + 발
      `<polyline points="${fmt(centerX - 2)},${fmt(pelvisY)} ${fmt(centerX + 5)},${fmt(kneeY)} ${fmt(centerX - 4)},${fmt(ankleY)}" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.9" />`,
      `<path d="M ${fmt(centerX - 10)} ${fmt(ankleY)} L ${fmt(centerX - 12)} ${fmt(floorY)} L ${fmt(centerX + unitPx * 0.42)} ${fmt(floorY)} L ${fmt(centerX + 5)} ${fmt(ankleY)}" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.6" />`,
    );
    if (showJoints) {
      parts.push(
        renderJoints(
          [
            [centerX - 2, shoulderY + 5],
            [centerX - 8, elbowY],
            [centerX + 6, wristY],
            [centerX - 2, pelvisY],
            [centerX + 5, kneeY],
            [centerX - 4, ankleY],
          ],
          palette,
        ),
      );
    }
  } else {
    const leftScale = view === "three-quarter" ? 0.78 : 1;
    const rightScale = view === "three-quarter" ? 1.08 : 1;
    const shL = centerX - shoulderHalf * leftScale;
    const shR = centerX + shoulderHalf * rightScale;
    const waL = centerX - waistHalf * leftScale;
    const waR = centerX + waistHalf * rightScale;
    const peL = centerX - pelvisHalf * leftScale;
    const peR = centerX + pelvisHalf * rightScale;

    // 상체 사다리꼴(흉곽) + 하체 골반 블록
    parts.push(
      `<polygon points="${fmt(shL)},${fmt(shoulderY)} ${fmt(shR)},${fmt(shoulderY)} ${fmt(waR)},${fmt(waistY)} ${fmt(waL)},${fmt(waistY)}" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.7" />`,
      `<polygon points="${fmt(waL)},${fmt(waistY)} ${fmt(waR)},${fmt(waistY)} ${fmt(peR)},${fmt(pelvisY)} ${fmt(peL)},${fmt(pelvisY)}" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.7" />`,
    );

    if (view === "back") {
      // 후면 견갑골·척추 와이어프레임
      parts.push(
        `<line x1="${fmt(centerX)}" y1="${fmt(shoulderY)}" x2="${fmt(centerX)}" y2="${fmt(pelvisY)}" stroke="${palette.strokeSecondary}" stroke-width="1.3" />`,
        `<polygon points="${fmt(centerX - 6)},${fmt(shoulderY + 8)} ${fmt(shL + 8)},${fmt(shoulderY + 12)} ${fmt(centerX - 12)},${fmt(waistY - 14)}" fill="none" stroke="${palette.strokeSecondary}" stroke-width="1" />`,
        `<polygon points="${fmt(centerX + 6)},${fmt(shoulderY + 8)} ${fmt(shR - 8)},${fmt(shoulderY + 12)} ${fmt(centerX + 12)},${fmt(waistY - 14)}" fill="none" stroke="${palette.strokeSecondary}" stroke-width="1" />`,
      );
    } else if (view === "three-quarter") {
      parts.push(
        `<line x1="${fmt(centerX + 8)}" y1="${fmt(shoulderY)}" x2="${fmt(centerX + 6)}" y2="${fmt(pelvisY)}" stroke="${palette.strokeSecondary}" stroke-width="1.1" stroke-dasharray="4 3" />`,
      );
    }

    // 양팔
    const armOut = unitPx * 0.14;
    const elL = shL - armOut * leftScale;
    const elR = shR + armOut * rightScale;
    const wrL = elL - armOut * 0.45 * leftScale;
    const wrR = elR + armOut * 0.45 * rightScale;
    parts.push(
      `<polyline points="${fmt(shL)},${fmt(shoulderY + 3)} ${fmt(elL)},${fmt(elbowY)} ${fmt(wrL)},${fmt(wristY)}" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.7" />`,
      `<polyline points="${fmt(shR)},${fmt(shoulderY + 3)} ${fmt(elR)},${fmt(elbowY)} ${fmt(wrR)},${fmt(wristY)}" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.7" />`,
    );

    // 양다리 + 발
    const hipL = centerX - pelvisHalf * 0.56 * leftScale;
    const hipR = centerX + pelvisHalf * 0.56 * rightScale;
    const kneeL = hipL - 3 * leftScale;
    const kneeR = hipR + 3 * rightScale;
    const ankL = hipL - 1;
    const ankR = hipR + 1;
    const footSpread = view === "three-quarter" ? 13 : 10;

    parts.push(
      `<polyline points="${fmt(hipL)},${fmt(pelvisY)} ${fmt(kneeL)},${fmt(kneeY)} ${fmt(ankL)},${fmt(ankleY)}" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.9" />`,
      `<polyline points="${fmt(hipR)},${fmt(pelvisY)} ${fmt(kneeR)},${fmt(kneeY)} ${fmt(ankR)},${fmt(ankleY)}" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.9" />`,
      `<polygon points="${fmt(ankL - 6)},${fmt(ankleY)} ${fmt(ankL + 5)},${fmt(ankleY)} ${fmt(ankL + footSpread)},${fmt(floorY)} ${fmt(ankL - 10)},${fmt(floorY)}" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.5" />`,
      `<polygon points="${fmt(ankR - 5)},${fmt(ankleY)} ${fmt(ankR + 6)},${fmt(ankleY)} ${fmt(ankR + footSpread + 2)},${fmt(floorY)} ${fmt(ankR - 8)},${fmt(floorY)}" fill="none" stroke="${palette.strokePrimary}" stroke-width="1.5" />`,
    );

    if (showJoints) {
      parts.push(
        renderJoints(
          [
            [shL, shoulderY + 3],
            [shR, shoulderY + 3],
            [elL, elbowY],
            [elR, elbowY],
            [wrL, wristY],
            [wrR, wristY],
            [hipL, pelvisY],
            [hipR, pelvisY],
            [kneeL, kneeY],
            [kneeR, kneeY],
            [ankL, ankleY],
            [ankR, ankleY],
          ],
          palette,
        ),
      );
    }
  }

  parts.push("</g>");
  return parts.join("");
}

/**
 * 4방향 턴어라운드 비율 시트 SVG를 생성한다.
 */
export function buildTurnaroundSheetSvg(options: TurnaroundSheetOptions): TurnaroundSheetResult {
  const views: readonly TurnaroundViewId[] =
    options.views && options.views.length > 0
      ? options.views
      : ["front", "three-quarter", "side", "back"];
  const palette = REFERENCE_STAMP_PALETTES[options.style ?? "blueprint"];
  const showLabels = options.showLabels ?? true;
  const showGrid = options.showGrid ?? true;
  const showJoints = options.showJoints ?? true;

  const width = LEFT_LABEL_GUTTER + views.length * COLUMN_WIDTH + RIGHT_MARGIN;
  const height = SHEET_HEIGHT;
  const floorY = height - BOTTOM_MARGIN;
  const figureHeight = floorY - TOP_MARGIN;
  const unitPx = figureHeight / options.headRatio;
  const guideLines = computeTurnaroundGuideLines(
    options.headRatio,
    height,
    TOP_MARGIN,
    BOTTOM_MARGIN,
  );
  const titleText =
    options.title?.trim() || `캐릭터 4방향 턴어라운드 비율 시트 (${options.headRatio}등신)`;

  const gridLines: string[] = [];
  if (showGrid) {
    const wholeHeads = Math.floor(options.headRatio);
    for (let unit = 0; unit <= wholeHeads; unit += 1) {
      const y = TOP_MARGIN + unit * unitPx;
      gridLines.push(
        `<line x1="${LEFT_LABEL_GUTTER}" y1="${fmt(y)}" x2="${width - RIGHT_MARGIN}" y2="${fmt(y)}" stroke="${palette.guideLine}" stroke-opacity="0.2" stroke-width="1" />`,
      );
      if (showLabels) {
        gridLines.push(
          `<text x="${width - RIGHT_MARGIN + 6}" y="${fmt(y + 3)}" font-size="10" fill="${palette.guideLabel}" opacity="0.7">${unit}H</text>`,
        );
      }
    }
    gridLines.push(
      `<line x1="${LEFT_LABEL_GUTTER}" y1="${fmt(floorY)}" x2="${width - RIGHT_MARGIN}" y2="${fmt(floorY)}" stroke="${palette.strokePrimary}" stroke-opacity="0.55" stroke-width="1.4" />`,
    );
  }

  const anatomyGuides = guideLines
    .map((line) => {
      const dash = line.emphasis === "primary" ? 'stroke-dasharray="6 4"' : 'stroke-dasharray="2 4"';
      const opacity = line.emphasis === "primary" ? "0.7" : "0.38";
      const labelMarkup = showLabels
        ? `<text x="${LEFT_LABEL_GUTTER - 10}" y="${fmt(line.yPx + 4)}" text-anchor="end" font-size="${line.emphasis === "primary" ? "11" : "10"}" font-weight="${line.emphasis === "primary" ? "700" : "500"}" fill="${palette.guideLabel}">${escapeXml(line.labelKo)} (${line.headUnit}H)</text>`
        : "";
      return [
        `<g data-guide-line="${line.id}">`,
        `<line x1="${LEFT_LABEL_GUTTER}" y1="${fmt(line.yPx)}" x2="${width - RIGHT_MARGIN}" y2="${fmt(line.yPx)}" stroke="${palette.guideLine}" stroke-opacity="${opacity}" stroke-width="${line.emphasis === "primary" ? "1.2" : "0.9"}" ${dash} />`,
        labelMarkup,
        "</g>",
      ].join("");
    })
    .join("");

  const viewColumns = views
    .map((viewId, index) => {
      const centerX = LEFT_LABEL_GUTTER + index * COLUMN_WIDTH + COLUMN_WIDTH / 2;
      const meta = TURNAROUND_VIEWS.find((candidate) => candidate.id === viewId);
      const header = showLabels
        ? `<text x="${fmt(centerX)}" y="52" text-anchor="middle" font-size="13" font-weight="700" fill="${palette.guideLabel}">${escapeXml(meta?.labelKo ?? viewId)}</text>`
        : "";
      const body = renderFigureColumn(
        viewId,
        centerX,
        guideLines,
        unitPx,
        floorY,
        palette,
        showJoints,
      );
      return `${header}${body}`;
    })
    .join("");

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(titleText)}">`,
    `<title>${escapeXml(titleText)}</title>`,
    `<rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="${palette.background}" />`,
    showLabels
      ? `<text x="20" y="28" font-size="14" font-weight="700" fill="${palette.guideLabel}">${escapeXml(titleText)}</text>`
      : "",
    `<g data-layer="head-grid">${gridLines.join("")}</g>`,
    `<g data-layer="anatomy-guides">${anatomyGuides}</g>`,
    `<g data-layer="turnaround-figures">${viewColumns}</g>`,
    "</svg>",
  ].join("");

  return {
    svg,
    dataUrl: svgToDataUrl(svg),
    width,
    height,
    headRatio: options.headRatio,
    views,
    guideLines,
  };
}

/**
 * CSP 중철 밀림 보정(viewsaddlestitching), 좌철·우철 제본(pagebookbindingmode),
 * 양면 펼침면 결합·분할 및 판면 바깥 여백 작품명·회차·쪽번호 스탬프 엔진.
 *
 * 역공학 근거(REA evidence_id):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_4571415adae1548e2078cdaf17fdc17fc7b43d1c9bdbbb5a58461c885bbdd64d
 *
 * 클린룸 수학 구현 원칙:
 * - 중철(saddle-stitch) 제본 시 겹쳐 접힌 종이 두께로 안쪽 시트가 바깥 재단선 쪽으로 밀려 나오는
 *   현상(creep)을 보정하기 위해 시트 인덱스 s(0=겉장..S-1=가운데장)에 비례해 제본선(척추) 안쪽으로 이동시킨다.
 * - 좌철(ltr: 왼쪽 제본, 왼쪽→오른쪽 넘김)과 우철(rtl: 일본 출판 만화식 오른쪽 제본, 오른쪽→왼쪽 넘김)의
 *   시트 앞·뒷면 물리 배치를 정확히 대칭 구성한다.
 */

export type MangaBindingDirection = "ltr" | "rtl";

export interface SaddleStitchCreepConfig {
  /** 전체 원고 페이지 수(1 이상; 내부에서 4의 배수로 자동 패딩). */
  readonly pageCount: number;
  /** 좌철("ltr", 기본) 또는 우철("rtl"). */
  readonly bindingDirection?: MangaBindingDirection;
  /** 가운데 시트 최대 안쪽 이동 보정량(mm). 미지정 시 paperThicknessMm으로 계산한다. */
  readonly maxCreepMm?: number;
  /** 종이 1장 두께(mm, 예: 모조지 100g ≈ 0.12mm). maxCreepMm 미지정 시 시트당 두께로 누적한다. */
  readonly paperThicknessMm?: number;
}

export interface ImposedHalfSlot {
  /** 0-based 원고 페이지 인덱스(패딩 빈 페이지면 null). */
  readonly pageIndex: number | null;
  readonly sideSlot: "left" | "right";
  /** 이 슬롯에 적용할 척추(안쪽) 방향 가로 이동량(mm; 왼쪽 면은 +값, 오른쪽 면은 -값). */
  readonly shiftXMm: number;
  readonly shiftXPt: number;
  /** 시트 기준 절대 밀림 크기(mm, >= 0). */
  readonly creepMagnitudeMm: number;
}

export interface ImposedBookletSheetPlan {
  /** 0 = 가장 바깥 겉장 시트, sheetCount - 1 = 한가운데 시트. */
  readonly sheetIndex: number;
  readonly creepMm: number;
  readonly front: readonly [ImposedHalfSlot, ImposedHalfSlot];
  readonly back: readonly [ImposedHalfSlot, ImposedHalfSlot];
}

export interface SpreadPageItem {
  readonly pageId: string;
  readonly pageIndex: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface SpreadJoinRecord {
  readonly spreadId: string;
  readonly bindingDirection: MangaBindingDirection;
  readonly leftPage: SpreadPageItem | null;
  readonly rightPage: SpreadPageItem | null;
  readonly combinedWidthPx: number;
  readonly heightPx: number;
}

export interface SplitSpreadResult {
  readonly firstReadingPageRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly secondReadingPageRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface RunningMarginStampOptions {
  readonly pageCount: number;
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly bindingDirection?: MangaBindingDirection;
  readonly storyTitle?: string;
  readonly episodeLabel?: string;
  readonly startFolioNumber?: number;
  /** 표지 등 앞쪽 N페이지는 쪽번호·기둥 제목 스탬프를 생략한다(기본 0). */
  readonly skipLeadingPages?: number;
  readonly outerMarginMm?: number;
  readonly bottomMarginMm?: number;
}

export interface RunningMarginStampDescriptor {
  readonly pageIndex: number;
  readonly folioNumber: number;
  readonly text: string;
  readonly align: "left" | "right";
  readonly xMm: number;
  readonly yMm: number;
  readonly xPt: number;
  readonly yPt: number;
}

const MM_TO_PT = 72 / 25.4;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * 시트 인덱스(0..sheetCount-1)에 대한 중철 밀림 폭(mm, >= 0)을 계산한다.
 * 가장 바깥 시트(sheetIndex = 0)는 항상 0mm이며, 안쪽 시트로 갈수록 선형 증가한다.
 */
export function computeSaddleStitchSheetCreepMm(params: {
  readonly sheetIndex: number;
  readonly sheetCount: number;
  readonly maxCreepMm?: number;
  readonly paperThicknessMm?: number;
}): number {
  const count = Math.max(1, Math.floor(params.sheetCount));
  const idx = clamp(Math.floor(params.sheetIndex), 0, count - 1);
  if (count <= 1 || idx === 0) return 0;

  if (params.maxCreepMm !== undefined) {
    const safeMax = clamp(params.maxCreepMm, 0, 25);
    return round3((safeMax * idx) / (count - 1));
  }
  const thickness = clamp(params.paperThicknessMm ?? 0, 0, 2);
  // 중철 접지 시 안쪽 시트 1장 추가마다 접힌 두께(약 2 × 종이 두께)만큼 밀림이 누적된다.
  return round3(idx * thickness * 2);
}

/**
 * 좌철(ltr)·우철(rtl) 및 중철 밀림 보정(creep)을 모두 반영한 시트 배열 계획을 수립한다.
 */
export function planMangaBookletImposition(
  config: SaddleStitchCreepConfig,
): ImposedBookletSheetPlan[] {
  if (!Number.isFinite(config.pageCount) || config.pageCount <= 0) {
    throw new Error("제본 배열할 페이지 수는 1 이상이어야 합니다.");
  }
  const totalPages = Math.floor(config.pageCount);
  const padded = Math.ceil(totalPages / 4) * 4;
  const sheetCount = padded / 4;
  const dir: MangaBindingDirection = config.bindingDirection ?? "ltr";
  const pageAt = (i: number): number | null => (i < totalPages ? i : null);

  const makeSlot = (
    pageIndex: number | null,
    sideSlot: "left" | "right",
    creepMm: number,
  ): ImposedHalfSlot => {
    // 척추(접지선) 안쪽으로 당긴다: 왼쪽 반쪽은 오른쪽(+X)으로, 오른쪽 반쪽은 왼쪽(-X)으로 이동.
    const signedMm = creepMm === 0 ? 0 : sideSlot === "left" ? creepMm : -creepMm;
    return {
      pageIndex,
      sideSlot,
      shiftXMm: round3(signedMm),
      shiftXPt: round3(signedMm * MM_TO_PT),
      creepMagnitudeMm: creepMm,
    };
  };

  const sheets: ImposedBookletSheetPlan[] = [];
  for (let s = 0; s < sheetCount; s += 1) {
    const creepMm = computeSaddleStitchSheetCreepMm({
      sheetIndex: s,
      sheetCount,
      maxCreepMm: config.maxCreepMm,
      paperThicknessMm: config.paperThicknessMm,
    });

    // 좌철(ltr): 겉면 [마지막-2s, 2s], 안쪽면 [2s+1, 마지막-2s-1]
    // 우철(rtl): 오른쪽 척추 제본이므로 좌우 배치를 거울 반전해 앞표지(0쪽)가 겉면 왼쪽에 놓이고,
    //            뒤집었을 때 그 뒷면(오른쪽)에 1쪽이 인쇄되어 오른쪽→왼쪽 순서로 정확히 읽힌다.
    const frontIndices: readonly [number | null, number | null] =
      dir === "ltr"
        ? [pageAt(padded - 1 - 2 * s), pageAt(2 * s)]
        : [pageAt(2 * s), pageAt(padded - 1 - 2 * s)];

    const backIndices: readonly [number | null, number | null] =
      dir === "ltr"
        ? [pageAt(2 * s + 1), pageAt(padded - 2 - 2 * s)]
        : [pageAt(padded - 2 - 2 * s), pageAt(2 * s + 1)];

    sheets.push({
      sheetIndex: s,
      creepMm,
      front: [makeSlot(frontIndices[0], "left", creepMm), makeSlot(frontIndices[1], "right", creepMm)],
      back: [makeSlot(backIndices[0], "left", creepMm), makeSlot(backIndices[1], "right", creepMm)],
    });
  }

  return sheets;
}

/**
 * 단면 원고 페이지 목록을 제본 방향(ltr/rtl)에 맞춰 양면 펼침면(2-page spread)으로 짝짓는다.
 * 첫 페이지(표지·도비라, index 0)를 단독 면으로 둘지 여부를 coverSolo로 제어한다.
 */
export function joinPagesIntoSpreads(
  pages: readonly SpreadPageItem[],
  options: {
    readonly bindingDirection?: MangaBindingDirection;
    readonly coverSolo?: boolean;
  } = {},
): SpreadJoinRecord[] {
  const dir: MangaBindingDirection = options.bindingDirection ?? "ltr";
  const coverSolo = options.coverSolo ?? false;
  const spreads: SpreadJoinRecord[] = [];
  let cursor = 0;

  if (coverSolo && pages.length > 0) {
    const cover = pages[0]!;
    spreads.push({
      spreadId: `spread-cover-${cover.pageId}`,
      bindingDirection: dir,
      leftPage: dir === "rtl" ? cover : null,
      rightPage: dir === "ltr" ? cover : null,
      combinedWidthPx: cover.widthPx * 2,
      heightPx: cover.heightPx,
    });
    cursor = 1;
  }

  while (cursor < pages.length) {
    const first = pages[cursor]!;
    const second = cursor + 1 < pages.length ? pages[cursor + 1]! : null;
    const leftPage = dir === "ltr" ? first : second;
    const rightPage = dir === "ltr" ? second : first;
    const halfWidth = Math.max(first.widthPx, second?.widthPx ?? first.widthPx);
    const heightPx = Math.max(first.heightPx, second?.heightPx ?? first.heightPx);

    spreads.push({
      spreadId: `spread-${first.pageId}-${second?.pageId ?? "blank"}`,
      bindingDirection: dir,
      leftPage,
      rightPage,
      combinedWidthPx: halfWidth * 2,
      heightPx,
    });
    cursor += 2;
  }

  return spreads;
}

/** 가로 2배 폭 양면 펼침면 이미지를 제본 읽기 순서의 두 단면 영역으로 분할한다. */
export function splitSpreadIntoReadingOrderRects(
  spreadWidthPx: number,
  spreadHeightPx: number,
  bindingDirection: MangaBindingDirection = "ltr",
): SplitSpreadResult {
  const halfW = Math.max(1, Math.floor(spreadWidthPx / 2));
  const h = Math.max(1, Math.round(spreadHeightPx));
  const leftRect = { x: 0, y: 0, width: halfW, height: h };
  const rightRect = { x: halfW, y: 0, width: spreadWidthPx - halfW, height: h };

  return bindingDirection === "rtl"
    ? { firstReadingPageRect: rightRect, secondReadingPageRect: leftRect }
    : { firstReadingPageRect: leftRect, secondReadingPageRect: rightRect };
}

/**
 * 단행본 각 페이지의 바깥 여백(fore-edge)에 찍힐 작품명·회차·쪽번호(논블, folio) 스탬프 배치를 생성한다.
 */
export function planRunningMarginStamps(
  options: RunningMarginStampOptions,
): RunningMarginStampDescriptor[] {
  const count = Math.max(0, Math.floor(options.pageCount));
  const dir: MangaBindingDirection = options.bindingDirection ?? "ltr";
  const skip = clamp(Math.floor(options.skipLeadingPages ?? 0), 0, count);
  const startFolio = Math.max(1, Math.floor(options.startFolioNumber ?? 1));
  const outerMarginMm = clamp(options.outerMarginMm ?? 8, 2, 40);
  const bottomMarginMm = clamp(options.bottomMarginMm ?? 7, 2, 40);
  const titleParts = [options.storyTitle?.trim(), options.episodeLabel?.trim()].filter(
    (s): s is string => Boolean(s && s.length > 0),
  );
  const headerPrefix = titleParts.join(" · ");

  const stamps: RunningMarginStampDescriptor[] = [];

  for (let pageIndex = skip; pageIndex < count; pageIndex += 1) {
    const folioNumber = startFolio + pageIndex;
    // 좌철(ltr): 짝수 index(1쪽, 3쪽... 오른쪽 면)의 바깥 여백은 오른쪽; 홀수 index(왼쪽 면)는 왼쪽.
    // 우철(rtl): 짝수 index(1쪽, 오른쪽 시작 또는 왼쪽 끝)에서 바깥 여백 방향이 반대다.
    const isEvenIndex = pageIndex % 2 === 0;
    const outerIsRight = dir === "ltr" ? isEvenIndex : !isEvenIndex;

    const xMm = outerIsRight
      ? Math.max(0, options.trimWidthMm - outerMarginMm)
      : outerMarginMm;
    const yMm = bottomMarginMm;
    const text =
      headerPrefix.length > 0
        ? outerIsRight
          ? `${headerPrefix}  ${folioNumber}`
          : `${folioNumber}  ${headerPrefix}`
        : String(folioNumber);

    stamps.push({
      pageIndex,
      folioNumber,
      text,
      align: outerIsRight ? "right" : "left",
      xMm: round3(xMm),
      yMm: round3(yMm),
      xPt: round3(xMm * MM_TO_PT),
      yPt: round3(yMm * MM_TO_PT),
    });
  }

  return stamps;
}

/**
 * PDF 워크벤치 상태 모델 — 가져온 PDF들의 페이지 목록을 다루는 순수 상태와 연산.
 *
 * 배경: PrintCraft(경쟁 분석 cat7 §5·T3) 대조에서 확인된 공백 — toonstudio는 PDF를
 * "만드는 쪽"(studio-pdf-export 등)은 갖췄지만, 만들어진·가져온 PDF를 열어 페이지를
 * 재배열·병합·분할하는 후단 워크벤치가 없었다. 이 모델이 그 워크벤치의 상태 정본이다.
 *
 * 경계:
 * - 이 파일은 순수 함수만 둔다. PDF 바이트 파싱·생성은 pdf-workbench-engine(pdf-lib
 *   어댑터)이, 썸네일 렌더는 pdf-workbench-thumbnails(pdfjs 어댑터)가 맡는다.
 * - 페이지 항목은 "어느 소스의 몇 번째 페이지인가 + 추가 회전"만 안다. 썸네일·바이트는
 *   상태에 넣지 않는다 — 상태가 직렬화·비교 가능한 최소 형태로 남아야 테스트가 쉽다.
 * - 출력 순서는 `pages` 배열 순서 그 자체다. 병합은 별도 연산이 아니라 "여러 소스의
 *   페이지를 한 목록에 넣는 것"으로 표현한다 (addPdfSource가 곧 병합의 전부).
 *
 * 사용자 노출 문자열은 한글로 둔다.
 */

/** 워크벤치에 올라온 원본 PDF 한 개. */
export interface PdfWorkbenchSource {
  /** 호출자가 발급하는 안정 id (파일 지문 기반 권장 — 같은 파일 재추가 판정에 쓴다). */
  readonly id: string;
  /** 표시용 파일 이름 (예: "단행본-1권.pdf"). */
  readonly name: string;
  /** 원본 바이트 크기. */
  readonly sizeBytes: number;
  /** 원본 페이지 수 (엔진이 로드 시점에 확정한다). */
  readonly pageCount: number;
}

/** 출력 목록의 페이지 한 장 — 원본 페이지에 대한 참조 + 추가 회전. */
export interface PdfWorkbenchPageEntry {
  /** `${sourceId}#${sourcePageIndex}` — 소스 안에서 유일하고 재배열해도 불변이다. */
  readonly id: string;
  readonly sourceId: string;
  /** 원본 PDF 기준 0-based 페이지 번호. */
  readonly sourcePageIndex: number;
  /** 원본 페이지 회전에 더해지는 추가 회전 (0·90·180·270 중 하나). */
  readonly rotationDelta: number;
}

export interface PdfWorkbenchState {
  readonly sources: readonly PdfWorkbenchSource[];
  /** 출력 순서 = 배열 순서. */
  readonly pages: readonly PdfWorkbenchPageEntry[];
}

/** 출력 한 걸음 — 엔진이 이 순서대로 페이지를 복사한다. */
export interface PdfOutputStep {
  readonly sourceId: string;
  readonly sourcePageIndex: number;
  readonly rotationDelta: number;
}

/** 1-based inclusive 페이지 범위 (화면에 보이는 결합 순서 기준). */
export interface PdfPageRange {
  readonly start: number;
  readonly end: number;
}

export type PdfRangeParseResult =
  | { readonly ok: true; readonly ranges: readonly PdfPageRange[] }
  | { readonly ok: false; readonly error: string };

export interface PdfSplitPlan {
  /** 파일 이름 접미사로 쓰는 범위 라벨 (예: "1-3", "5"). */
  readonly label: string;
  readonly steps: readonly PdfOutputStep[];
}

export function createPdfWorkbenchState(): PdfWorkbenchState {
  return { sources: [], pages: [] };
}

export function makePdfWorkbenchPageId(sourceId: string, sourcePageIndex: number): string {
  return `${sourceId}#${sourcePageIndex}`;
}

/** 회전값을 0·90·180·270 중 하나로 정규화한다. 90의 배수가 아니면 가장 가까운 값으로 스냅한다. */
export function normalizeRotationDelta(value: number): number {
  const wrapped = ((value % 360) + 360) % 360;
  return Math.round(wrapped / 90) * 90 % 360;
}

/**
 * 소스와 그 페이지 전부를 출력 목록 끝에 붙인다 — 병합의 기본 연산.
 * 같은 id의 소스가 이미 있으면 상태를 그대로 반환한다 (중복 추가 방지).
 */
export function addPdfSource(
  state: PdfWorkbenchState,
  source: PdfWorkbenchSource,
): PdfWorkbenchState {
  if (state.sources.some((candidate) => candidate.id === source.id)) return state;
  const entries: PdfWorkbenchPageEntry[] = [];
  for (let index = 0; index < source.pageCount; index += 1) {
    entries.push({
      id: makePdfWorkbenchPageId(source.id, index),
      sourceId: source.id,
      sourcePageIndex: index,
      rotationDelta: 0,
    });
  }
  return {
    sources: [...state.sources, source],
    pages: [...state.pages, ...entries],
  };
}

/** 소스와 그 소스에 속한 페이지를 모두 제거한다. */
export function removePdfSource(
  state: PdfWorkbenchState,
  sourceId: string,
): PdfWorkbenchState {
  if (!state.sources.some((source) => source.id === sourceId)) return state;
  return {
    sources: state.sources.filter((source) => source.id !== sourceId),
    pages: state.pages.filter((page) => page.sourceId !== sourceId),
  };
}

function indexOfPage(state: PdfWorkbenchState, pageId: string): number {
  return state.pages.findIndex((page) => page.id === pageId);
}

/** 페이지를 앞/뒤로 한 칸 이동한다. 경계에서는 상태를 그대로 반환한다. */
export function movePdfPage(
  state: PdfWorkbenchState,
  pageId: string,
  direction: -1 | 1,
): PdfWorkbenchState {
  const from = indexOfPage(state, pageId);
  if (from < 0) return state;
  return movePdfPageTo(state, pageId, from + direction);
}

/** 페이지를 목표 위치(0-based, 현재 목록 기준)로 이동한다. 범위를 벗어나면 양끝으로 clamp한다. */
export function movePdfPageTo(
  state: PdfWorkbenchState,
  pageId: string,
  targetIndex: number,
): PdfWorkbenchState {
  const from = indexOfPage(state, pageId);
  if (from < 0) return state;
  const clamped = Math.max(0, Math.min(state.pages.length - 1, Math.trunc(targetIndex)));
  if (clamped === from) return state;
  const pages = [...state.pages];
  const [entry] = pages.splice(from, 1);
  if (!entry) return state;
  pages.splice(clamped, 0, entry);
  return { ...state, pages };
}

/** 페이지 한 장을 출력 목록에서 제거한다 (원본 소스는 남는다). */
export function removePdfPage(
  state: PdfWorkbenchState,
  pageId: string,
): PdfWorkbenchState {
  if (indexOfPage(state, pageId) < 0) return state;
  return { ...state, pages: state.pages.filter((page) => page.id !== pageId) };
}

/** 페이지의 추가 회전을 시계 방향(+1)·반시계 방향(-1)으로 90도 돌린다. */
export function rotatePdfPage(
  state: PdfWorkbenchState,
  pageId: string,
  direction: 1 | -1,
): PdfWorkbenchState {
  if (indexOfPage(state, pageId) < 0) return state;
  return {
    ...state,
    pages: state.pages.map((page) =>
      page.id === pageId
        ? { ...page, rotationDelta: normalizeRotationDelta(page.rotationDelta + direction * 90) }
        : page,
    ),
  };
}

/** 현재 목록을 엔진용 출력 계획으로 변환한다. */
export function buildPdfOutputPlan(state: PdfWorkbenchState): readonly PdfOutputStep[] {
  return state.pages.map((page) => ({
    sourceId: page.sourceId,
    sourcePageIndex: page.sourcePageIndex,
    rotationDelta: page.rotationDelta,
  }));
}

/**
 * "1-3, 5, 8-10" 형식의 범위 표기를 파싱한다.
 * - 번호는 화면에 보이는 1-based 결합 순서 기준이다.
 * - 전체 페이지 수를 넘는 번호, 역전된 범위, 빈 조각은 오류로 돌려준다 (조용한 clamp 금지 —
 *   사용자가 의도한 분할이 무엇인지 되묻는 편이 정직하다).
 */
export function parsePdfPageRanges(spec: string, pageCount: number): PdfRangeParseResult {
  const trimmed = spec.trim();
  if (!trimmed) return { ok: false, error: "페이지 범위를 입력해 주세요. 예: 1-3, 5" };
  if (pageCount <= 0) return { ok: false, error: "먼저 PDF를 추가해 주세요." };
  const ranges: PdfPageRange[] = [];
  for (const chunk of trimmed.split(",")) {
    const part = chunk.trim();
    if (!part) return { ok: false, error: "범위 사이에 빈 항목이 있어요. 쉼표 뒤를 확인해 주세요." };
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/u.exec(part);
    if (!match) return { ok: false, error: `"${part}" 형식을 읽지 못했어요. 숫자나 3-7 같은 범위로 적어 주세요.` };
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start < 1 || end < 1) {
      return { ok: false, error: "페이지 번호는 1부터 시작해요." };
    }
    if (end < start) {
      return { ok: false, error: `"${part}" 범위의 끝이 시작보다 앞에 있어요.` };
    }
    if (end > pageCount) {
      return { ok: false, error: `전체 ${pageCount}페이지까지만 지정할 수 있어요. "${part}"를 확인해 주세요.` };
    }
    ranges.push({ start, end });
  }
  return { ok: true, ranges };
}

/** 범위를 0-based 페이지 위치 목록으로 펼친다. */
export function expandPdfPageRange(range: PdfPageRange): readonly number[] {
  const indices: number[] = [];
  for (let page = range.start; page <= range.end; page += 1) indices.push(page - 1);
  return indices;
}

/** 범위별로 출력 계획을 나눈다 — 파일 하나가 범위 하나에 대응한다. */
export function buildPdfSplitPlans(
  state: PdfWorkbenchState,
  ranges: readonly PdfPageRange[],
): readonly PdfSplitPlan[] {
  const plan = buildPdfOutputPlan(state);
  return ranges.map((range) => ({
    label: range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`,
    steps: expandPdfPageRange(range)
      .map((index) => plan[index])
      .filter((step): step is PdfOutputStep => step !== undefined),
  }));
}

/** 출력 파일 이름 — 접미사가 있으면 "이름-접미사.pdf", 없으면 "이름.pdf"로 정리한다. */
export function suggestPdfOutputName(baseName: string, suffix?: string): string {
  const stem = baseName.replace(/\.pdf$/iu, "").trim() || "워크벤치";
  return suffix ? `${stem}-${suffix}.pdf` : `${stem}.pdf`;
}

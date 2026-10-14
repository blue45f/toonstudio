/**
 * PDF 워크벤치 아웃라인(책갈피) — 병합 결과에 소스 파일별 목차를 만든다.
 *
 * 배경: artcraft-features REPORT §1.2(PdfCraft 병합 책갈피) 대조에서 남은 공백.
 * pdf-lib에는 아웃라인 읽기·쓰기 API가 없어 카탈로그 객체(Outlines 딕셔너리)를
 * 직접 구성해야 한다. 이 모듈이 그 저수준 구성을 한곳에 가둔다.
 *
 * 구성:
 * - 순수 계획(buildPdfMergeOutline): 출력 걸음 + 소스별 원본 아웃라인 →
 *   "파일 항목 아래 원본 목차가 중첩된" 병합 아웃라인 트리. 바이트를 모른다.
 * - 읽기(readPdfOutline): 소스 문서의 Outlines 트리를 평탄 목록(깊이 포함)으로.
 *   명시 목적지 배열과 이름 목적지(Dests 딕셔너리·이름 트리), GoTo 액션을 해석한다.
 *   깨진 아웃라인은 예외 없이 빈 목록으로 떨어진다 — 아웃라인 없는/깨진 소스가
 *   병합 전체를 깨면 안 된다.
 * - 쓰기(applyPdfOutline): 계획 트리를 Outlines 딕셔너리 체인으로 문서 카탈로그에
 *   단다. 제목은 PDFHexString(UTF-16BE)이라 한글 파일 이름이 그대로 산다.
 *   PageMode=UseOutlines를 함께 걸어 뷰어가 책갈피 패널을 열어 보여주게 한다.
 */

import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFRef,
  PDFString,
  type PDFDocument,
  type PDFObject,
} from "pdf-lib";

import type { PdfOutputStep, PdfWorkbenchSource } from "./pdf-workbench-model";

/** 소스 문서에서 읽은 아웃라인 항목 하나 (문서 순서 = 트리 전위 순회). */
export interface PdfSourceOutlineItem {
  readonly title: string;
  /** 0 = 최상위 항목. */
  readonly depth: number;
  /** 소스 문서 기준 0-based 목적지 페이지. 해석할 수 없으면 null. */
  readonly sourcePageIndex: number | null;
}

/** 병합 결과에 실제로 심을 아웃라인 항목 (재귀 트리). */
export interface PdfMergeOutlineEntry {
  readonly title: string;
  /** 출력 문서 기준 0-based 목적지 페이지. */
  readonly outputPageIndex: number;
  readonly children: readonly PdfMergeOutlineEntry[];
}

/** 순환·손상 아웃라인에서 무한 순회를 막는 상한. */
const MAX_OUTLINE_ITEMS = 10_000;
const MAX_OUTLINE_DEPTH = 32;

function normalizeOutlineTitle(raw: string, fallback: string): string {
  const cleaned = raw.replace(/\s+/gu, " ").trim();
  return cleaned || fallback;
}

/** 소스 파일 이름에서 책갈피 제목을 만든다 — 확장자 ".pdf"를 떼고 빈 이름은 대체한다. */
export function pdfSourceBookmarkTitle(sourceName: string): string {
  const stem = sourceName.replace(/\.pdf$/iu, "").trim();
  return stem || "이름 없는 PDF";
}

/**
 * 병합 아웃라인 계획을 만든다.
 *
 * - 출력에 실제로 들어간 소스마다 항목 하나 (첫 등장 위치 기준, 출력 순서).
 * - 원본 아웃라인 항목 중 출력에 포함된 페이지를 가리키는 것만 그 파일 항목 아래에
 *   중첩한다. 빠진 페이지를 가리키는 항목은 버리고, 부모가 버려진 자식은 가장 가까운
 *   살아남은 조상(없으면 파일 항목) 아래로 승격한다 — 깊이 상대 관계를 유지한다.
 * - 아웃라인이 없는 소스도 파일 항목 하나는 받는다 (파일 단위 이동이 판정의 핵심).
 */
export function buildPdfMergeOutline(input: {
  readonly sources: readonly PdfWorkbenchSource[];
  readonly steps: readonly PdfOutputStep[];
  readonly outlinesBySourceId: ReadonlyMap<string, readonly PdfSourceOutlineItem[]>;
}): readonly PdfMergeOutlineEntry[] {
  const sourcesById = new Map(input.sources.map((source) => [source.id, source]));
  const firstOutputIndexBySourceId = new Map<string, number>();
  const outputIndexBySourcePage = new Map<string, Map<number, number>>();
  input.steps.forEach((step, outputIndex) => {
    if (!firstOutputIndexBySourceId.has(step.sourceId)) {
      firstOutputIndexBySourceId.set(step.sourceId, outputIndex);
    }
    let byPage = outputIndexBySourcePage.get(step.sourceId);
    if (!byPage) {
      byPage = new Map();
      outputIndexBySourcePage.set(step.sourceId, byPage);
    }
    if (!byPage.has(step.sourcePageIndex)) byPage.set(step.sourcePageIndex, outputIndex);
  });

  const entries: PdfMergeOutlineEntry[] = [];
  for (const [sourceId, firstOutputIndex] of firstOutputIndexBySourceId) {
    const source = sourcesById.get(sourceId);
    const title = pdfSourceBookmarkTitle(source?.name ?? sourceId);
    const byPage = outputIndexBySourcePage.get(sourceId) ?? new Map<number, number>();
    const sourceItems = input.outlinesBySourceId.get(sourceId) ?? [];
    entries.push({
      title,
      outputPageIndex: firstOutputIndex,
      children: nestSourceItems(sourceItems, byPage),
    });
  }
  return entries;
}

/** 평탄한 소스 항목 목록을 살아남은 항목만으로 다시 중첩한다. */
function nestSourceItems(
  items: readonly PdfSourceOutlineItem[],
  outputIndexBySourcePage: ReadonlyMap<number, number>,
): readonly PdfMergeOutlineEntry[] {
  interface MutableEntry {
    title: string;
    outputPageIndex: number;
    depth: number;
    children: MutableEntry[];
  }
  const roots: MutableEntry[] = [];
  const stack: MutableEntry[] = [];
  for (const item of items) {
    if (item.sourcePageIndex === null) continue;
    const outputPageIndex = outputIndexBySourcePage.get(item.sourcePageIndex);
    if (outputPageIndex === undefined) continue;
    const entry: MutableEntry = {
      title: normalizeOutlineTitle(item.title, "제목 없는 항목"),
      outputPageIndex,
      depth: item.depth,
      children: [],
    };
    while (stack.length > 0 && (stack[stack.length - 1]?.depth ?? -1) >= item.depth) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(entry);
    else roots.push(entry);
    stack.push(entry);
  }
  const freeze = (entry: MutableEntry): PdfMergeOutlineEntry => ({
    title: entry.title,
    outputPageIndex: entry.outputPageIndex,
    children: entry.children.map(freeze),
  });
  return roots.map(freeze);
}

/** 아웃라인 항목 총수 (파일 항목 포함) — 루트 Count와 테스트 판정에 쓴다. */
export function countPdfOutlineEntries(entries: readonly PdfMergeOutlineEntry[]): number {
  return entries.reduce(
    (sum, entry) => sum + 1 + countPdfOutlineEntries(entry.children),
    0,
  );
}

// ─── 읽기 ────────────────────────────────────────────────────────────────────

function lookupDict(doc: PDFDocument, object: PDFObject | undefined): PDFDict | undefined {
  if (!object) return undefined;
  const resolved = object instanceof PDFRef ? doc.context.lookup(object) : object;
  return resolved instanceof PDFDict ? resolved : undefined;
}

function lookupArray(doc: PDFDocument, object: PDFObject | undefined): PDFArray | undefined {
  if (!object) return undefined;
  const resolved = object instanceof PDFRef ? doc.context.lookup(object) : object;
  return resolved instanceof PDFArray ? resolved : undefined;
}

function pdfTextOf(object: PDFObject | undefined): string | undefined {
  if (object instanceof PDFHexString || object instanceof PDFString) {
    return object.decodeText();
  }
  return undefined;
}

function pageIndexByRef(doc: PDFDocument): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  doc.getPages().forEach((page, index) => {
    map.set(page.ref.toString(), index);
  });
  return map;
}

/** 이름 목적지 트리(Names→Dests)에서 이름으로 목적지를 찾는다. */
function findInNameTree(
  doc: PDFDocument,
  tree: PDFDict,
  name: string,
  depth: number,
): PDFObject | undefined {
  if (depth > MAX_OUTLINE_DEPTH) return undefined;
  const names = lookupArray(doc, tree.get(PDFName.of("Names")));
  if (names) {
    for (let index = 0; index + 1 < names.size(); index += 2) {
      const key = pdfTextOf(names.get(index));
      if (key === name) return names.get(index + 1);
    }
    return undefined;
  }
  const kids = lookupArray(doc, tree.get(PDFName.of("Kids")));
  if (kids) {
    for (let index = 0; index < kids.size(); index += 1) {
      const kid = lookupDict(doc, kids.get(index));
      if (!kid) continue;
      const found = findInNameTree(doc, kid, name, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

function resolveNamedDest(doc: PDFDocument, name: string): PDFObject | undefined {
  try {
    const catalog = doc.catalog;
    const legacy = lookupDict(doc, catalog.get(PDFName.of("Dests")));
    const direct = legacy?.get(PDFName.of(name));
    if (direct) return direct;
    const names = lookupDict(doc, catalog.get(PDFName.of("Names")));
    const destsTree = names ? lookupDict(doc, names.get(PDFName.of("Dests"))) : undefined;
    if (destsTree) return findInNameTree(doc, destsTree, name, 0);
  } catch {
    return undefined;
  }
  return undefined;
}

/** 목적지 값(배열·이름·{D} 딕셔너리·GoTo 액션)에서 목적지 페이지를 해석한다. */
function destPageIndex(
  doc: PDFDocument,
  byRef: ReadonlyMap<string, number>,
  dest: PDFObject | undefined,
  depth: number,
): number | null {
  if (!dest || depth > 4) return null;
  const resolved = dest instanceof PDFRef ? doc.context.lookup(dest) : dest;
  if (resolved instanceof PDFArray) {
    if (resolved.size() === 0) return null;
    const first = resolved.get(0);
    if (first instanceof PDFRef) return byRef.get(first.toString()) ?? null;
    if (first instanceof PDFNumber) {
      const pageNumber = Math.trunc(first.asNumber());
      return pageNumber >= 0 ? pageNumber : null;
    }
    return null;
  }
  if (resolved instanceof PDFDict) {
    return destPageIndex(doc, byRef, resolved.get(PDFName.of("D")), depth + 1);
  }
  const name = pdfTextOf(resolved) ?? (resolved instanceof PDFName ? resolved.decodeText() : undefined);
  if (name !== undefined) {
    return destPageIndex(doc, byRef, resolveNamedDest(doc, name), depth + 1);
  }
  return null;
}

function itemDestPageIndex(
  doc: PDFDocument,
  byRef: ReadonlyMap<string, number>,
  item: PDFDict,
): number | null {
  const direct = item.get(PDFName.of("Dest"));
  if (direct) return destPageIndex(doc, byRef, direct, 0);
  const action = lookupDict(doc, item.get(PDFName.of("A")));
  if (action) {
    const kind = action.get(PDFName.of("S"));
    // GoTo가 아닌 액션(외부 파일·URI 등)은 병합 결과에서 가리킬 곳이 없다.
    if (kind instanceof PDFName && kind.asString() !== "/GoTo") return null;
    return destPageIndex(doc, byRef, action.get(PDFName.of("D")), 0);
  }
  return null;
}

/**
 * 문서의 아웃라인을 문서 순서 평탄 목록으로 읽는다.
 * 아웃라인이 없거나 깨졌으면 빈 목록 — 호출자는 예외를 신경 쓰지 않아도 된다.
 */
export function readPdfOutline(doc: PDFDocument): readonly PdfSourceOutlineItem[] {
  try {
    const root = lookupDict(doc, doc.catalog.get(PDFName.of("Outlines")));
    if (!root) return [];
    const byRef = pageIndexByRef(doc);
    const items: PdfSourceOutlineItem[] = [];
    const visited = new Set<string>();

    const walkSiblings = (first: PDFObject | undefined, depth: number): void => {
      let current = first;
      while (current && items.length < MAX_OUTLINE_ITEMS) {
        const item = lookupDict(doc, current);
        if (!item) return;
        const guardKey = current instanceof PDFRef ? current.toString() : undefined;
        if (guardKey) {
          if (visited.has(guardKey)) return;
          visited.add(guardKey);
        }
        items.push({
          title: normalizeOutlineTitle(pdfTextOf(item.get(PDFName.of("Title"))) ?? "", "제목 없는 항목"),
          depth,
          sourcePageIndex: itemDestPageIndex(doc, byRef, item),
        });
        const firstChild = item.get(PDFName.of("First"));
        if (firstChild && depth < MAX_OUTLINE_DEPTH) walkSiblings(firstChild, depth + 1);
        current = item.get(PDFName.of("Next"));
      }
    };

    walkSiblings(root.get(PDFName.of("First")), 0);
    return items;
  } catch {
    return [];
  }
}

// ─── 쓰기 ────────────────────────────────────────────────────────────────────

/**
 * 계획 트리를 문서 카탈로그에 Outlines 딕셔너리 체인으로 단다.
 * 항목이 없거나 모든 목적지 페이지가 범위를 벗어나면 아무것도 하지 않는다.
 * (pdf-lib에 아웃라인 API가 없어 First/Next/Prev/Parent/Count를 직접 연결한다.)
 */
export function applyPdfOutline(doc: PDFDocument, entries: readonly PdfMergeOutlineEntry[]): void {
  const pageCount = doc.getPageCount();
  const valid = pruneInvalidEntries(entries, pageCount);
  if (valid.length === 0) return;

  const context = doc.context;
  const root = PDFDict.withContext(context);
  root.set(PDFName.of("Type"), PDFName.of("Outlines"));
  const rootRef = context.register(root);

  const buildLevel = (
    level: readonly PdfMergeOutlineEntry[],
    parentRef: PDFRef,
  ): { first: PDFRef; last: PDFRef; count: number } => {
    const refs = level.map((entry) => {
      const dict = PDFDict.withContext(context);
      dict.set(PDFName.of("Title"), PDFHexString.fromText(entry.title));
      dict.set(PDFName.of("Parent"), parentRef);
      const dest = PDFArray.withContext(context);
      dest.push(doc.getPage(entry.outputPageIndex).ref);
      dest.push(PDFName.of("XYZ"));
      dest.push(PDFNull);
      dest.push(PDFNull);
      dest.push(PDFNull);
      dict.set(PDFName.of("Dest"), dest);
      return { entry, dict, ref: context.register(dict) };
    });
    let total = 0;
    refs.forEach((current, index) => {
      const prev = refs[index - 1];
      const next = refs[index + 1];
      if (prev) current.dict.set(PDFName.of("Prev"), prev.ref);
      if (next) current.dict.set(PDFName.of("Next"), next.ref);
      total += 1;
      if (current.entry.children.length > 0) {
        const children = buildLevel(current.entry.children, current.ref);
        current.dict.set(PDFName.of("First"), children.first);
        current.dict.set(PDFName.of("Last"), children.last);
        current.dict.set(PDFName.of("Count"), PDFNumber.of(children.count));
        total += children.count;
      }
    });
    return {
      first: refs[0]?.ref as PDFRef,
      last: refs[refs.length - 1]?.ref as PDFRef,
      count: total,
    };
  };

  const top = buildLevel(valid, rootRef);
  root.set(PDFName.of("First"), top.first);
  root.set(PDFName.of("Last"), top.last);
  root.set(PDFName.of("Count"), PDFNumber.of(top.count));

  doc.catalog.set(PDFName.of("Outlines"), rootRef);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}

function pruneInvalidEntries(
  entries: readonly PdfMergeOutlineEntry[],
  pageCount: number,
): readonly PdfMergeOutlineEntry[] {
  return entries
    .filter(
      (entry) =>
        Number.isInteger(entry.outputPageIndex) &&
        entry.outputPageIndex >= 0 &&
        entry.outputPageIndex < pageCount,
    )
    .map((entry) => ({ ...entry, children: pruneInvalidEntries(entry.children, pageCount) }));
}

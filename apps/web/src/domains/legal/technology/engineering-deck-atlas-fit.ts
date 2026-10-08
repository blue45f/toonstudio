import { shortenDeckPath, visualWidth, wrappedLineCount, type FitBox } from "./engineering-deck-fit";

/**
 * 도감 카드 슬라이드(atlas)와 모듈 타일이 16:9 프레임 안에 담기도록 글자 크기를 정하는 계획 함수.
 *
 * 슬라이드는 `overflow: hidden`이라 넘쳐도 아무 경고가 없다. 카드 계약은 요점 최대 4개(각 64자), 사용처 최대 4개(경로 수 제한 없음),
 * 코드 최대 30줄처럼 상한이 넉넉하므로, 최악의 입력도 읽히게 줄이는 규칙을 둔다.
 * 모든 길이는 슬라이드 폭의 1%(cqw = `--u`)이며, 상수는 engineering-deck.css 의 값과 같아야 한다.
 */

/** 본문 영역의 높이와 폭: 슬라이드(100 × 56.25)에서 위 머리·아래 꼬리·여백·간격을 뺀 값. */
export const DECK_BODY = { width: 93.2, height: 43.5 } as const;

/** `bold`는 굵은 글꼴이 보통 글꼴보다 넓은 만큼(글자 폭 배수)이다. 제목은 가장 굵은 글꼴이라 줄 수를 넉넉하게 센다. */
const TITLE = { size: 2.7, lineHeight: 1.18, gap: 1.1, bold: 1.12 } as const;
const LEAD = { size: 1.5, lineHeight: 1.45 } as const;
const CAPTION = { size: 1.4, lineHeight: 1.5 } as const;

const round2 = (value: number): number => Math.round(value * 100) / 100;

function textHeight(text: string, size: number, lineHeight: number, width: number, bold = 1): number {
  return text ? wrappedLineCount(text, size * bold, width) * size * lineHeight : 0;
}

/**
 * 아래 꼬리의 기술 칩이 한 줄을 넘어 접히면 그만큼 본문이 줄어든다. 칩 하나의 폭은 글자 폭 + 안쪽 여백이고
 * 꼬리에서 사이트 주소(toonstudio.cloud)가 차지하는 폭을 뺀 나머지에 칩을 채운다.
 */
export function footerExtraHeight(stack: readonly string[] | undefined): number {
  if (!stack || stack.length === 0) return 0;
  const available = DECK_BODY.width - 11;
  let lines = 1;
  let used = 0;
  for (const chip of stack) {
    const width = visualWidth(chip) * 0.5 * 1.05 * 1.2 + 1.7;
    if (used > 0 && used + width + 0.5 > available) {
      lines += 1;
      used = width;
    } else used += used > 0 ? width + 0.5 : width;
  }
  return (lines - 1) * 2.7;
}

/** 제목·리드·캡션·꼬리가 차지하는 높이를 빼고 본문 블록에 남는 높이를 계산한다(한 줄이 둘로 접히는 경우를 반영한다). */
export function atlasBlockHeight(parts: {
  readonly title: string;
  readonly lead?: string;
  readonly caption?: string;
  readonly gaps: number;
  readonly stack?: readonly string[];
}): number {
  const heading = textHeight(parts.title, TITLE.size, TITLE.lineHeight, DECK_BODY.width, TITLE.bold);
  const lead = parts.lead ? textHeight(parts.lead, LEAD.size, LEAD.lineHeight, DECK_BODY.width) : 0;
  const caption = parts.caption ? textHeight(parts.caption, CAPTION.size, CAPTION.lineHeight, DECK_BODY.width) : 0;
  // 어림값이 실제보다 조금 작게 나오는 오차(약 3%)를 남긴다.
  return Math.max(10, (DECK_BODY.height - heading - lead - caption - parts.gaps * TITLE.gap - footerExtraHeight(parts.stack)) * 0.97);
}

/* ── 핵심 요점 목록(도식 면) ──────────────────────────────── */

const POINTS = { maxSize: 1.4, minSize: 0.95, step: 0.05, lineHeight: 1.4, padding: 2.4, paddingY: 2, badge: 2.2, badgeGap: 0.9, gap: 0.9, label: 2.1 } as const;

/** 핵심 요점 목록이 칸(`box`)에 모두 들어가는 가장 큰 글자 크기(cqw). 번호 배지는 글자 크기에 비례해 줄어든다. */
export function fitKeyPointsSize(points: readonly string[], box: FitBox): number {
  for (let size = POINTS.maxSize; size >= POINTS.minSize - 1e-9; size -= POINTS.step) {
    const badge = POINTS.badge * (size / POINTS.maxSize);
    const textWidth = box.width - POINTS.padding - badge - POINTS.badgeGap;
    // 요점 글은 줄 끝 손실이 커서(좁은 칸) 폭을 3% 더 넉넉하게 본다.
    const items = points.reduce((sum, point) => sum + wrappedLineCount(point, size * 1.03, textWidth) * size * POINTS.lineHeight + POINTS.paddingY, 0);
    const total = POINTS.label + items + Math.max(0, points.length - 1) * POINTS.gap;
    if (total <= box.height) return round2(size);
  }
  return POINTS.minSize;
}

/* ── 사용처 카드 ─────────────────────────────────────────── */

export interface UsageFitItem {
  readonly feature: string;
  readonly role: string;
  readonly paths: readonly string[];
  readonly hasRoute: boolean;
}

export interface UsagePlan {
  /** 글자·여백 배율(1 = 기본). */
  readonly scale: number;
  /** 카드마다 보여 줄 경로의 최대 수(나머지는 "외 N개"). */
  readonly maxPaths: number;
}

/** 사용처 개수별 기본 글자 크기: 적을수록 크게 보여 빈 화면처럼 보이지 않게 한다(CSS 의 data-count 규칙과 같다). */
function usageBase(count: number): { readonly feature: number; readonly role: number; readonly path: number } {
  if (count <= 1) return { feature: 2.4, role: 1.8, path: 1.3 };
  if (count === 2) return { feature: 2, role: 1.55, path: 1.2 };
  return { feature: 1.6, role: 1.3, path: 1.05 };
}

const USAGE = { cardPaddingX: 1.4, cardPaddingY: 1.2, gap: 1, innerGap: 0.5, pathGap: 0.3, pathPaddingY: 0.2, minScale: 0.74, step: 0.04 } as const;

/** 사용처 카드의 높이(`scale`·경로 상한 적용). 카드 너비는 열 수와 옆 열(facts·링크) 유무로 정한다. */
function usageCardHeight(item: UsageFitItem, base: ReturnType<typeof usageBase>, scale: number, textWidth: number, maxPaths: number): number {
  // 기능 이름은 굵은 글꼴(850)이라 보통 글꼴보다 넓다.
  const feature = wrappedLineCount(item.feature, base.feature * scale * 1.12, textWidth) * base.feature * scale * 1.3;
  const role = wrappedLineCount(item.role, base.role * scale, textWidth) * base.role * scale * 1.4;
  const shown = item.paths.slice(0, maxPaths);
  const pathFont = base.path * scale;
  const codeWidth = Math.max(4, textWidth - 1.2 * scale);
  const pathLines = shown.reduce((sum, path) => sum + wrappedLineCount(path, pathFont, codeWidth, "mono") * pathFont * 1.5 + (USAGE.pathPaddingY * 2) * scale, 0);
  const extra = item.paths.length > shown.length ? pathFont * 1.5 + USAGE.pathPaddingY * 2 * scale : 0;
  const route = item.hasRoute ? pathFont * 1.5 + USAGE.pathPaddingY * 2 * scale : 0;
  const pathCount = shown.length + (extra ? 1 : 0) + (item.hasRoute ? 1 : 0);
  const paths = pathLines + extra + route + Math.max(0, pathCount - 1) * USAGE.pathGap * scale;
  return USAGE.cardPaddingY * 2 * scale + feature + role + (paths > 0 ? paths + USAGE.innerGap * 2 * scale : USAGE.innerGap * scale);
}

/**
 * 사용처 카드들이 높이 `height` 안에 들어가는 글자 배율과 경로 상한을 정한다.
 * 먼저 경로를 모두 보여 주며 배율을 줄이고, 그래도 안 되면 경로를 3개 → 2개 → 1개로 줄인다.
 */
export function planUsageLayout(items: readonly UsageFitItem[], options: { readonly hasSide: boolean; readonly height: number }): UsagePlan {
  const count = items.length;
  if (count === 0) return { scale: 1, maxPaths: Number.POSITIVE_INFINITY };
  const base = usageBase(count);
  const gridWidth = options.hasSide ? DECK_BODY.width - 27 - 2 : DECK_BODY.width;
  const columns = count >= 3 ? 2 : 1;
  const cardWidth = (gridWidth - (columns - 1) * USAGE.gap) / columns;
  for (const maxPaths of [Number.POSITIVE_INFINITY, 3, 2, 1]) {
    for (let scale = 1; scale >= USAGE.minScale - 1e-9; scale -= USAGE.step) {
      const textWidth = cardWidth - USAGE.cardPaddingX * 2 * scale;
      const heights = items.map((item) => usageCardHeight(item, base, scale, textWidth, maxPaths));
      const rows = Array.from({ length: Math.ceil(count / columns) }, (_, row) => Math.max(...heights.slice(row * columns, row * columns + columns)));
      const total = rows.reduce((sum, value) => sum + value, 0) + Math.max(0, rows.length - 1) * USAGE.gap;
      // 어림값이 실제보다 조금 작게 나오는 오차(약 4%)를 남긴다.
      if (total * 1.04 <= options.height) return { scale: round2(scale), maxPaths };
    }
  }
  return { scale: USAGE.minScale, maxPaths: 1 };
}

/* ── 옆 열(facts·참고 링크) ─────────────────────────────── */

/** 사용처 슬라이드의 옆 열에 올리는 facts 의 최대 개수(나머지는 도감 카드 페이지에서 본다). */
export const DECK_USAGE_MAX_FACTS = 4;

export interface SideFitFact {
  readonly label: string;
  readonly value: string;
  readonly source: string;
}

export interface SideFitLink {
  readonly title: string;
  readonly kind: string;
}

export interface SidePlan {
  /** 글자·여백 배율(1 = 기본). */
  readonly scale: number;
  /** 보여 줄 facts 의 수(나머지는 "수치 N개는 도감 카드에서"). */
  readonly facts: number;
  /** 보여 줄 참고 링크의 수(나머지는 "참고 링크 N개는 도감 카드에서"). */
  readonly links: number;
}

/**
 * 옆 열의 치수(engineering-deck.css 의 `.deck-atlas__side` 규칙과 같아야 한다). 길이는 모두 슬라이드 폭의 %.
 * `line`은 줄 높이(글자 크기 배수), `bold`는 굵은 글꼴이 보통 글꼴보다 넓은 만큼이다(수치는 굵고 숫자 폭이 넓다).
 */
const SIDE = {
  width: 27,
  border: 0.16,
  factPadX: 1.1,
  factPadY: 0.9,
  linkPadX: 1.2,
  linkPadY: 0.9,
  factGap: 0.8,
  linkGap: 0.7,
  blockGap: 1.4,
  linkInnerGap: 0.2,
  /** "참고 링크" 라벨(크기 1 × 줄 높이 1.5 + 아래 여백 0.6)은 배율의 영향을 받지 않는다. */
  linksLabel: 2.1,
  note: { size: 1.05, line: 1.5 },
  label: { size: 1.1, line: 1.5, bold: 1.06 },
  value: { size: 2.2, line: 1.15, bold: 1.12 },
  source: { size: 0.95, line: 1.3, bold: 1 },
  title: { size: 1.3, line: 1.3, bold: 1.08 },
  kind: { size: 1.05, line: 1.5 },
  minScale: 0.75,
  lastResortScale: 0.7,
  step: 0.05,
  /** 어림값이 실제보다 조금 작게 나오는 오차를 남긴다. */
  margin: 1.03,
  slack: 0.3,
} as const;

function sideHeight(facts: readonly SideFitFact[], links: readonly SideFitLink[], hidden: { readonly facts: number; readonly links: number }, scale: number): number {
  const factWidth = SIDE.width - 2 * SIDE.factPadX * scale - SIDE.border;
  const linkWidth = SIDE.width - 2 * SIDE.linkPadX * scale - SIDE.border;
  const noteHeight = SIDE.note.size * scale * SIDE.note.line;
  const lines = (text: string, spec: { readonly size: number; readonly bold: number }, width: number): number => wrappedLineCount(text, spec.size * scale * spec.bold, width);

  const factHeights = facts.map((fact) =>
    2 * SIDE.factPadY * scale
    + SIDE.border
    + lines(fact.label, SIDE.label, factWidth) * SIDE.label.size * scale * SIDE.label.line
    + lines(fact.value, SIDE.value, factWidth) * SIDE.value.size * scale * SIDE.value.line
    + lines(shortenDeckPath(fact.source, 40), SIDE.source, factWidth) * SIDE.source.size * scale * SIDE.source.line,
  );
  const factItems = factHeights.length + (hidden.facts > 0 ? 1 : 0);
  const factsBlock = factItems === 0
    ? 0
    : factHeights.reduce((sum, value) => sum + value, 0) + (hidden.facts > 0 ? noteHeight : 0) + (factItems - 1) * SIDE.factGap * scale;

  const linkHeights = links.map((link) =>
    2 * SIDE.linkPadY * scale
    + SIDE.border
    + lines(link.title, SIDE.title, linkWidth) * SIDE.title.size * scale * SIDE.title.line
    + SIDE.linkInnerGap
    + SIDE.kind.size * scale * SIDE.kind.line,
  );
  const linkItems = linkHeights.length + (hidden.links > 0 ? 1 : 0);
  const linksBlock = linkItems === 0
    ? 0
    : (linkHeights.length > 0 ? SIDE.linksLabel : 0)
      + linkHeights.reduce((sum, value) => sum + value, 0)
      + (hidden.links > 0 ? noteHeight : 0)
      + (linkItems - 1) * SIDE.linkGap * scale;

  return factsBlock + linksBlock + (factsBlock > 0 && linksBlock > 0 ? SIDE.blockGap * scale : 0);
}

/**
 * 옆 열(facts + 참고 링크)이 높이 `height` 안에 들어가는 글자 배율과 보여 줄 개수를 정한다.
 * 항목마다 글이 몇 줄로 접히는지 세어 높이를 어림한다(수치 이름이 길면 세 줄까지 접힌다).
 * 먼저 내용을 모두 두고 배율을 줄이고(최소 0.75), 그래도 안 되면 참고 링크 → facts 순으로 줄여 도감 카드에서 보게 한다.
 */
export function planSideColumn(facts: readonly SideFitFact[], links: readonly SideFitLink[], height: number): SidePlan {
  const maxFacts = Math.min(facts.length, DECK_USAGE_MAX_FACTS);
  if (maxFacts === 0 && links.length === 0) return { scale: 1, facts: 0, links: 0 };
  const fits = (shownFacts: number, shownLinks: number, scale: number): boolean =>
    sideHeight(facts.slice(0, shownFacts), links.slice(0, shownLinks), { facts: facts.length - shownFacts, links: links.length - shownLinks }, scale) * SIDE.margin + SIDE.slack <= height;
  for (let shownFacts = maxFacts; shownFacts >= Math.min(1, maxFacts); shownFacts -= 1) {
    for (let shownLinks = links.length; shownLinks >= 0; shownLinks -= 1) {
      for (let scale = 1; scale >= SIDE.minScale - 1e-9; scale -= SIDE.step) {
        if (fits(shownFacts, shownLinks, scale)) return { scale: round2(scale), facts: shownFacts, links: shownLinks };
      }
    }
  }
  return { scale: SIDE.lastResortScale, facts: Math.min(1, maxFacts), links: 0 };
}

/* ── 코드 면의 설명 열 ──────────────────────────────────── */

/** 코드 면의 설명 열(제목·읽는 법·원본 경로)이 본문 높이 안에 들어가는 글자 배율. */
export function fitExplainScale(parts: {
  readonly title: string;
  readonly explain: string;
  readonly extra: readonly string[];
  readonly source?: string;
  readonly stack?: readonly string[];
}): number {
  const height = (DECK_BODY.height - footerExtraHeight(parts.stack)) * 0.97;
  const width = 33.2 - 3;
  const total = (scale: number): number => {
    const title = wrappedLineCount(parts.title, TITLE.size * scale * TITLE.bold, 33.2) * TITLE.size * scale * TITLE.lineHeight;
    const explain = wrappedLineCount(parts.explain, 1.5 * scale, width) * 1.5 * scale * 1.55 + 2.6 * scale + 1.0 * scale * 1.5;
    const extra = parts.extra.reduce((sum, text) => sum + wrappedLineCount(text, 1.3 * scale, width - 1.6) * 1.3 * scale * 1.45 + 0.5 * scale, 0);
    const source = parts.source ? wrappedLineCount(parts.source, 1.05 * scale, width, "mono") * 1.05 * scale * 1.4 + 0.7 * scale + 1.5 * scale + 0.4 * scale : 0;
    const label = 1.5 * scale;
    return label + title + explain + extra + source + 3 * 1.2 * scale;
  };
  for (let scale = 1; scale >= 0.7 - 1e-9; scale -= 0.05) {
    if (total(scale) <= height) return round2(scale);
  }
  return 0.7;
}

/* ── 모듈 타일(modules 레이아웃) ─────────────────────────── */

export interface ModuleFitItem {
  readonly title: string;
  readonly body: string;
  readonly stack: readonly string[];
  readonly hasHref: boolean;
}

/** `modules` 레이아웃에서 제목(3.4)·리드(1.72, 최대 폭 76)를 빼고 타일 격자에 남는 높이. */
export function modulesBodyHeight(title: string, lead: string, stack?: readonly string[]): number {
  const heading = wrappedLineCount(title, 3.4 * TITLE.bold, DECK_BODY.width) * 3.4 * 1.18;
  const leadHeight = lead ? wrappedLineCount(lead, 1.72, 76) * 1.72 * 1.55 : 0;
  return Math.max(12, (DECK_BODY.height - heading - leadHeight - 2 * 1.6 - footerExtraHeight(stack)) * 0.97);
}

/** 모듈 타일마다 보여 줄 기술 칩의 최대 수(나머지는 "+N"). 전체 목록은 발표자 노트·오프라인 발표본에 있다. */
export const DECK_MODULE_MAX_CHIPS = 5;

const MODULE = { title: 1.7, body: 1.35, chip: 0.95, href: 1.05, padding: 1.6, icon: 3.8, iconGap: 1.2, gap: 1.2, copyGap: 0.25, chipGap: 0.4, minScale: 0.7, step: 0.06 } as const;

/** 모듈 타일들이 높이 `height` 안에 들어가는 배율(타일이 3열로 놓일 때). */
export function fitModulesScale(items: readonly ModuleFitItem[], height: number): number {
  if (items.length === 0) return 1;
  const columns = 3;
  const tileWidth = (DECK_BODY.width - (columns - 1) * MODULE.gap) / columns;
  for (let scale = 1; scale >= MODULE.minScale - 1e-9; scale -= MODULE.step) {
    const copyWidth = tileWidth - 2 * MODULE.padding * scale - (MODULE.icon + MODULE.iconGap) * scale;
    const heights = items.map((item) => {
      const title = wrappedLineCount(item.title, MODULE.title * scale * 1.1, copyWidth) * MODULE.title * scale * 1.5;
      const body = wrappedLineCount(item.body, MODULE.body * scale, copyWidth) * MODULE.body * scale * 1.4;
      const chips = item.stack.slice(0, DECK_MODULE_MAX_CHIPS);
      const chipWidths = [...chips, ...(item.stack.length > chips.length ? [`+${item.stack.length - chips.length}`] : [])]
        .map((chip) => visualWidth(chip) * 0.5 * MODULE.chip * scale * 1.12 + 1.4 * scale);
      let lines = chipWidths.length > 0 ? 1 : 0;
      let used = 0;
      for (const width of chipWidths) {
        if (used > 0 && used + width + MODULE.chipGap * scale > copyWidth) {
          lines += 1;
          used = width;
        } else used += used > 0 ? width + MODULE.chipGap * scale : width;
      }
      const chipHeight = lines * (MODULE.chip * scale * 1.4 + 0.4 * scale) + Math.max(0, lines - 1) * MODULE.chipGap * scale + (lines > 0 ? 0.45 * scale : 0);
      const href = item.hasHref ? MODULE.href * scale * 1.5 : 0;
      const children = 2 + (chips.length > 0 ? 1 : 0) + (item.hasHref ? 1 : 0);
      return 2 * MODULE.padding * scale + title + body + chipHeight + href + (children - 1) * MODULE.copyGap * scale;
    });
    const rows = Array.from({ length: Math.ceil(items.length / columns) }, (_, row) => Math.max(...heights.slice(row * columns, row * columns + columns)));
    const total = rows.reduce((sum, value) => sum + value, 0) + Math.max(0, rows.length - 1) * MODULE.gap;
    if (total <= height) return round2(scale);
  }
  return MODULE.minScale;
}

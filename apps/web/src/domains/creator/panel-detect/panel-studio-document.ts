/**
 * 재배열한 컷을 Studio 문서(프로젝트 JSON)로 만든다 — 순수 규칙, 픽셀·DOM 을 만지지 않는다.
 *
 * 컷 하나는 두 요소로 들어간다.
 *  - 컷 프레임(FrameEl): 문서의 "컷" 구조. 대사 일괄 편집·홍보 컷 묶음 같은 기존 기능이 이 프레임을 컷으로 읽는다.
 *    프레임은 이미지 아래에 깔리고 테두리는 그리지 않는다(원고 그림의 테두리를 겹쳐 그리지 않는다).
 *  - 컷 이미지(ImageEl): 편집 가능한 래스터 레이어. 출처·권리 확인 기록(sourceRights)이 여기에 붙고, 기존 권리 명세가 읽는다.
 *
 * 원본은 읽기만 했다. 문서에는 계획 배율로 다시 그린 컷 이미지가 들어간다(손실 보고가 이를 알린다).
 */

import { STUDIO_CANVAS_WIDTH } from "../canvas/studio-canvas-constants";

import { panelImportReceiptText, type PanelImportRights } from "./panel-import-rights";
import type { PanelReflowPlan, ReflowPlacement } from "./panel-reflow-plan";

export interface PanelStudioImageElement {
  readonly id: string;
  readonly type: "image";
  readonly name: string;
  readonly src: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: 0;
  readonly sourceRights: PanelImportRights;
}

export interface PanelStudioFrameElement {
  readonly id: string;
  readonly type: "frame";
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly bgColor: string;
  readonly strokeWidth: 0;
}

export type PanelStudioElement = PanelStudioFrameElement | PanelStudioImageElement;

export interface PanelStudioPage {
  readonly id: string;
  readonly elements: readonly PanelStudioElement[];
  readonly bg: string;
  readonly bgGrad: null;
  readonly canvasH: number;
}

/** studio-project-file 의 현재 형식(version 2)을 따르는 프로젝트 파일. parseStudioProjectFile 이 그대로 받아들인다. */
export interface PanelStudioProject {
  readonly version: 2;
  readonly savedAt: string;
  readonly title: string;
  readonly description: string;
  readonly tagsText: string;
  readonly currentPageId: string;
  readonly webtoonTheme: "classic";
  readonly panelGutter: number;
  readonly pagesList: readonly PanelStudioPage[];
}

export interface PanelStudioLabels {
  readonly cut: (order: number) => string;
  readonly frame: (order: number) => string;
}

export const DEFAULT_PANEL_STUDIO_LABELS: PanelStudioLabels = Object.freeze({
  cut: (order: number) => `컷 ${order}`,
  frame: (order: number) => `컷 ${order} 프레임`,
});

export interface BuildPanelStudioProjectInput {
  readonly plan: PanelReflowPlan;
  /** 컷 id → 컷 이미지(data URL). 계획의 모든 컷이 있어야 한다. */
  readonly sources: ReadonlyMap<string, string>;
  readonly rights: PanelImportRights;
  readonly title: string;
  /** 페이지 바탕색(#rrggbb). 컷 사이 여백으로 보인다. */
  readonly background: string;
  readonly savedAt: string;
  readonly makeId: () => string;
  readonly labels?: PanelStudioLabels;
}

export class PanelStudioDocumentError extends Error {
  readonly code: "missing-cut-image" | "invalid-background" | "invalid-title";

  constructor(code: PanelStudioDocumentError["code"], message: string) {
    super(message);
    this.name = "PanelStudioDocumentError";
    this.code = code;
  }
}

const HEX_COLOR = /^#[0-9a-f]{6}$/iu;
export const PANEL_STUDIO_TITLE_MAX = 200;

/** 파일 이름에서 확장자를 떼고 제어 문자를 정리해 문서 제목으로 쓴다. 비면 대체 제목. */
export function panelStudioTitleFromFileName(fileName: string, fallback = "가져온 원고"): string {
  const stem = fileName.replace(/\.[^./\\]{1,8}$/u, "");
  let cleaned = "";
  for (const character of stem) {
    const codePoint = character.codePointAt(0) ?? 0;
    cleaned += codePoint <= 31 || (codePoint >= 127 && codePoint <= 159) ? " " : character;
  }
  const title = [...cleaned.replace(/\s+/gu, " ").trim()].slice(0, PANEL_STUDIO_TITLE_MAX).join("");
  return title || fallback;
}

/** 감지한 여백색을 페이지 바탕색(#rrggbb)으로 옮긴다. 투명·없음이면 흰색. */
export function panelStudioBackground(color: { readonly r: number; readonly g: number; readonly b: number } | null): string {
  if (!color) return "#ffffff";
  const hex = (value: number): string => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

function cutElements(
  placement: ReflowPlacement,
  src: string,
  input: BuildPanelStudioProjectInput,
  labels: PanelStudioLabels,
): readonly [PanelStudioFrameElement, PanelStudioImageElement] {
  const x = input.plan.documentOffsetX + placement.dest.x;
  const { y, width, height } = placement.dest;
  return [
    {
      id: input.makeId(),
      type: "frame",
      name: labels.frame(placement.order),
      x,
      y,
      width,
      height,
      bgColor: input.background,
      strokeWidth: 0,
    },
    {
      id: input.makeId(),
      type: "image",
      name: labels.cut(placement.order),
      src,
      x,
      y,
      width,
      height,
      rotation: 0,
      sourceRights: input.rights,
    },
  ];
}

export function buildPanelStudioProject(input: BuildPanelStudioProjectInput): PanelStudioProject {
  if (!HEX_COLOR.test(input.background)) {
    throw new PanelStudioDocumentError("invalid-background", "페이지 바탕색 형식이 올바르지 않아요.");
  }
  const title = input.title.trim();
  if (title === "" || [...title].length > PANEL_STUDIO_TITLE_MAX) {
    throw new PanelStudioDocumentError("invalid-title", `문서 제목은 1~${PANEL_STUDIO_TITLE_MAX}자여야 해요.`);
  }
  const labels = input.labels ?? DEFAULT_PANEL_STUDIO_LABELS;
  const pagesList: PanelStudioPage[] = input.plan.pages.map((page) => {
    const elements: PanelStudioElement[] = [];
    for (const placement of page.placements) {
      const src = input.sources.get(placement.panelId);
      if (!src) throw new PanelStudioDocumentError("missing-cut-image", `컷 ${placement.order} 의 이미지가 없어요.`);
      elements.push(...cutElements(placement, src, input, labels));
    }
    return { id: input.makeId(), elements, bg: input.background, bgGrad: null, canvasH: page.height };
  });
  const first = pagesList[0];
  if (!first) throw new PanelStudioDocumentError("missing-cut-image", "문서에 넣을 컷이 없어요.");
  return {
    version: 2,
    savedAt: input.savedAt,
    title,
    description: panelImportReceiptText(input.rights),
    tagsText: "",
    currentPageId: first.id,
    webtoonTheme: "classic",
    panelGutter: input.plan.options.gap,
    pagesList,
  };
}

/** 문서 안 컷 이미지들이 모두 Studio 캔버스 폭 안에 들어가는지(폭 규격 690/720 ≤ 720). */
export function panelStudioFitsCanvas(project: PanelStudioProject): boolean {
  return project.pagesList.every((page) =>
    page.elements.every((element) => element.x >= 0 && element.x + element.width <= STUDIO_CANVAS_WIDTH && element.y >= 0 && element.y + element.height <= page.canvasH));
}

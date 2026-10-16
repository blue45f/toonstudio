/**
 * 재배열 결과물 만들기 — Studio 문서용 파일 또는 PNG 묶음(ZIP).
 *
 * 두 경로 모두 원본(PanelDrawable)을 읽기만 하고, 취소 신호를 컷·페이지 하나가 끝날 때마다 확인한다.
 * Studio 문서는 컷마다 PNG 를 만들어 프로젝트 JSON(컷 프레임 + 컷 이미지 + 권리 기록)으로 묶고, ZIP 은 페이지마다 PNG 와 권리 확인 기록을 담는다.
 */

import { buildStudioDownloadBundle, type StudioDownloadBundleResult } from "../export/studio-download-bundle";

import { PANEL_IMPORT_RIGHTS_STATEMENT_KO, type PanelImportRights } from "./panel-import-rights";
import { blobToDataUrl } from "./panel-render-core";
import { renderReflowCuts, renderReflowPages } from "./panel-reflow-render";
import { buildPanelStudioProject, type PanelStudioLabels, type PanelStudioProject } from "./panel-studio-document";
import { createPanelStudioProjectFile } from "./panel-studio-handoff";

import type { StudioCrc32ExecutionMode } from "../studio-crc32-worker-client";
import type { PanelCanvasDeps, PanelDrawable } from "./panel-canvas-adapter";
import type { PanelReflowPlan } from "./panel-reflow-plan";

export interface ReflowOutputInput {
  readonly plan: PanelReflowPlan;
  readonly source: PanelDrawable;
  readonly deps: PanelCanvasDeps;
  readonly rights: PanelImportRights;
  readonly title: string;
  /** 페이지 바탕색(#rrggbb). */
  readonly background: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (done: number, total: number) => void;
  readonly yieldNow?: () => Promise<void>;
}

export interface StudioDocumentOutputInput extends ReflowOutputInput {
  readonly makeId: () => string;
  readonly now: () => Date;
  readonly labels?: PanelStudioLabels;
}

export interface StudioDocumentOutput {
  readonly file: File;
  readonly project: PanelStudioProject;
}

/** 컷 이미지를 굽고 Studio 프로젝트 JSON 파일을 만든다(편집기 가져오기 전달에 등록할 수 있는 파일). */
export async function buildStudioDocumentFromReflow(input: StudioDocumentOutputInput): Promise<StudioDocumentOutput> {
  const cuts = await renderReflowCuts(input.plan, input.source, input.deps, {
    background: input.background,
    signal: input.signal,
    onProgress: input.onProgress,
    yieldNow: input.yieldNow,
  });
  const sources = new Map<string, string>();
  for (const cut of cuts) sources.set(cut.panelId, await blobToDataUrl(cut.blob));
  const project = buildPanelStudioProject({
    plan: input.plan,
    sources,
    rights: input.rights,
    title: input.title,
    background: input.background,
    savedAt: input.now().toISOString(),
    makeId: input.makeId,
    labels: input.labels,
  });
  return { file: createPanelStudioProjectFile(project), project };
}

export interface BundleOutputInput extends ReflowOutputInput {
  readonly now: () => Date;
  readonly crc32ExecutionMode?: StudioCrc32ExecutionMode;
}

export function reflowReceiptFileText(rights: PanelImportRights): string {
  const { source } = rights;
  return [
    "권리 확인 기록",
    `  원본: ${source.fileName} (${source.width}×${source.height}px)`,
    `  SHA-256: ${source.sha256}`,
    `  사용자가 "${PANEL_IMPORT_RIGHTS_STATEMENT_KO}"에 동의했어요 (${rights.attestedAt.slice(0, 10)}).`,
    ...(rights.note ? [`  메모: ${rights.note}`] : []),
    "  이 기록은 사용자의 자기 확인이며 법률 자문, 권리 인증, 제3자의 권리 보유 보증이 아니에요.",
    "  게시 전에 원문 사용권과 대상 플랫폼의 최신 정책을 직접 확인해 주세요.",
    "",
    "이미지는 이 브라우저 안에서만 처리했고 서버로 보내지 않았어요.",
    "",
  ].join("\n");
}

export function reflowPageFileName(index: number, total: number): string {
  return `strip-${String(index + 1).padStart(Math.max(2, String(total).length), "0")}.png`;
}

/** 페이지 이미지를 굽고 권리 확인 기록과 함께 ZIP 으로 묶는다. */
export async function buildReflowPngBundle(input: BundleOutputInput): Promise<StudioDownloadBundleResult> {
  const pages = await renderReflowPages(input.plan, input.source, input.deps, {
    background: input.background,
    signal: input.signal,
    onProgress: input.onProgress,
    yieldNow: input.yieldNow,
  });
  return buildStudioDownloadBundle({
    title: input.title,
    generatedAt: input.now(),
    signal: input.signal,
    crc32ExecutionMode: input.crc32ExecutionMode,
    files: [
      ...pages.map((page) => ({ blob: page.blob, fileName: reflowPageFileName(page.index, pages.length) })),
      { blob: new Blob([reflowReceiptFileText(input.rights)], { type: "text/plain;charset=utf-8" }), fileName: "rights-receipt.txt" },
    ],
  });
}

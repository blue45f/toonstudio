/**
 * 컷 가져오기 화면의 실행 환경 — 브라우저에 닿는 모든 것(디코딩·Worker·캔버스·다운로드·시계)을 한 곳에 모은다.
 *
 * 화면 컴포넌트는 이 환경만 부른다. 그래서 시험은 합성 이미지와 대역으로 상태(loading/empty/error/retry)·키보드·접근성 이름을
 * 증명할 수 있고, 운영에서는 기본 환경이 로컬 브라우저 기능만 쓴다(네트워크 호출 없음).
 */

import { createContext, useContext } from "react";

import { downloadBlob } from "../../export/studio-export";
import { uid } from "../../studio-id";
import { BROWSER_PANEL_CANVAS_DEPS, type PanelCanvasDeps } from "../panel-canvas-adapter";
import { buildCardNewsBundle } from "../panel-card-export";
import { replanCardSlicesAsync, sliceCardsAsync, type CardSliceAnalysis } from "../panel-card-slice";
import { detectPanelsInBackground } from "../panel-detect-client";
import { buildReflowPngBundle } from "../panel-reflow-output";
import { loadPanelSourceImage, type PanelSourceImage } from "../panel-source-image";

import type { CardSliceOptions } from "../panel-card-slice-types";
import type { PanelDetectClientOptions } from "../panel-detect-client";
import type { PanelDetectRaster, PanelDetectResult } from "../panel-detect-types";

export interface PanelImportEnvironment {
  /** 원고 파일을 이 브라우저 안에서 읽는다(형식·크기 검사, 디코딩, SHA-256). */
  readonly loadSource: (file: File, signal: AbortSignal) => Promise<PanelSourceImage>;
  /** 컷 감지. 기본은 Worker 에서 실행하고 취소·시간 상한을 강제한다. */
  readonly detect: (raster: PanelDetectRaster, options: PanelDetectClientOptions) => Promise<PanelDetectResult>;
  readonly sliceCards: (raster: PanelDetectRaster, options: CardSliceOptions, signal: AbortSignal) => Promise<CardSliceAnalysis>;
  readonly replanCards: (analysis: CardSliceAnalysis, cardCount: number | null, signal: AbortSignal) => Promise<CardSliceAnalysis>;
  readonly canvasDeps: PanelCanvasDeps;
  /** 카드뉴스 ZIP(PNG) 묶음. */
  readonly buildBundle: typeof buildCardNewsBundle;
  /** 재배열 결과의 페이지 PNG + 권리 확인 기록 ZIP. */
  readonly buildReflowBundle: typeof buildReflowPngBundle;
  readonly download: (blob: Blob, fileName: string) => void;
  readonly now: () => Date;
  readonly makeId: () => string;
  readonly createPreviewUrl: (file: File) => string;
  readonly revokePreviewUrl: (url: string) => void;
}

const BROWSER_ENVIRONMENT: PanelImportEnvironment = {
  loadSource: (file, signal) => loadPanelSourceImage(file, { signal }),
  detect: (raster, options) => detectPanelsInBackground(raster, { ...options, transferInput: true }),
  sliceCards: (raster, options, signal) => sliceCardsAsync(raster, { ...options, isCancelled: () => signal.aborted }),
  replanCards: (analysis, cardCount, signal) => replanCardSlicesAsync(analysis, cardCount, signal),
  canvasDeps: BROWSER_PANEL_CANVAS_DEPS,
  buildBundle: buildCardNewsBundle,
  buildReflowBundle: buildReflowPngBundle,
  download: downloadBlob,
  now: () => new Date(),
  makeId: uid,
  createPreviewUrl: (file) => URL.createObjectURL(file),
  revokePreviewUrl: (url) => { URL.revokeObjectURL(url); },
};

export const DEFAULT_PANEL_IMPORT_ENVIRONMENT: PanelImportEnvironment = Object.freeze(BROWSER_ENVIRONMENT);

export function resolvePanelImportEnvironment(overrides: Partial<PanelImportEnvironment> | undefined): PanelImportEnvironment {
  return overrides ? { ...DEFAULT_PANEL_IMPORT_ENVIRONMENT, ...overrides } : DEFAULT_PANEL_IMPORT_ENVIRONMENT;
}

export const PanelImportEnvironmentContext = createContext<PanelImportEnvironment>(DEFAULT_PANEL_IMPORT_ENVIRONMENT);

export function usePanelImportEnvironment(): PanelImportEnvironment {
  return useContext(PanelImportEnvironmentContext);
}

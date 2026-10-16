import { useCallback, useEffect, useRef, useState } from "react";

import type { StudioCrc32ExecutionMode } from "../studio-crc32-worker-client";

import {
  buildSubmissionPackage,
  toSubmissionBuildError,
  type SubmissionPackageBuildError,
  type SubmissionPackageBuildResult,
  type SubmissionPackageProgress,
} from "./submission-package-build";
import type { SubmissionCoverInput } from "./submission-package-cover";
import type { SubmissionPackageDraft, SubmissionPackageLocale, SubmissionPlatformSizeLimits } from "./submission-package-types";

export type SubmissionBuildViewState =
  | { readonly status: "idle" }
  | { readonly status: "building"; readonly progress: SubmissionPackageProgress | null }
  | { readonly status: "done"; readonly result: SubmissionPackageBuildResult }
  | { readonly status: "error"; readonly error: SubmissionPackageBuildError }
  | { readonly status: "cancelled" };

export type SubmissionSaveOutcome = "file-handle" | "download" | "cancelled";

export type SubmissionSaveState =
  | { readonly status: "idle" }
  | { readonly status: "saving" }
  | { readonly status: "saved"; readonly outcome: Exclude<SubmissionSaveOutcome, "cancelled"> }
  | { readonly status: "cancelled" }
  | { readonly status: "error" };

export interface SubmissionBuildDeps {
  readonly crc32ExecutionMode?: StudioCrc32ExecutionMode;
  readonly now?: () => Date;
  /** 표지 PDF 그리기. 기본은 필요할 때 불러오는 `renderSubmissionCoverPdf`(브라우저 캔버스). */
  readonly renderCoverPdf?: (input: SubmissionCoverInput, signal?: AbortSignal) => Promise<Uint8Array>;
  /** 결과 저장. 기본은 파일 선택기(가능할 때)나 다운로드. */
  readonly save?: (blob: Blob, fileName: string) => Promise<SubmissionSaveOutcome>;
}

export interface SubmissionBuildParams {
  readonly locale: SubmissionPackageLocale;
  readonly includeCoverPdf: boolean;
  readonly platform: SubmissionPlatformSizeLimits | null;
}

export interface SubmissionBuildController {
  readonly state: SubmissionBuildViewState;
  readonly saveState: SubmissionSaveState;
  readonly start: (draft: SubmissionPackageDraft, params: SubmissionBuildParams) => Promise<void>;
  readonly cancel: () => void;
  /** 결과를 버리고 처음 상태로 돌아간다(초안을 고친 뒤 새로 만들 때). */
  readonly reset: () => void;
  readonly save: () => Promise<void>;
}

async function defaultRenderCoverPdf(input: SubmissionCoverInput, signal?: AbortSignal): Promise<Uint8Array> {
  const { renderSubmissionCoverPdf } = await import("./submission-package-cover-pdf");
  return renderSubmissionCoverPdf(input, { signal });
}

async function defaultSave(blob: Blob, fileName: string): Promise<SubmissionSaveOutcome> {
  const { saveExportBlob } = await import("../export/studio-export");
  return saveExportBlob(blob, fileName, {
    handleKey: "submission-package",
    pickerTypes: [{ description: "ZIP", accept: { "application/zip": [".zip"] } }],
  });
}

export function useSubmissionPackageBuild(deps: SubmissionBuildDeps = {}): SubmissionBuildController {
  const [state, setState] = useState<SubmissionBuildViewState>({ status: "idle" });
  const [saveState, setSaveState] = useState<SubmissionSaveState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const resultRef = useRef<SubmissionPackageBuildResult | null>(null);

  useEffect(
    () => () => {
      runRef.current += 1;
      controllerRef.current?.abort();
    },
    [],
  );

  const start = useCallback(async (draft: SubmissionPackageDraft, params: SubmissionBuildParams): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    runRef.current += 1;
    const runId = runRef.current;
    const current = (): boolean => runRef.current === runId;
    resultRef.current = null;
    setSaveState({ status: "idle" });
    setState({ status: "building", progress: null });
    const { crc32ExecutionMode, now, renderCoverPdf } = depsRef.current;
    try {
      const result = await buildSubmissionPackage(draft, {
        locale: params.locale,
        generatedAt: now ? now() : new Date(),
        includeCoverPdf: params.includeCoverPdf,
        platform: params.platform,
        signal: controller.signal,
        ...(crc32ExecutionMode ? { crc32ExecutionMode } : {}),
        renderCoverPdf: renderCoverPdf ?? defaultRenderCoverPdf,
        onProgress: (progress) => {
          if (current()) setState((previous) => (previous.status === "building" ? { status: "building", progress } : previous));
        },
      });
      if (!current()) return;
      resultRef.current = result;
      setState({ status: "done", result });
    } catch (cause) {
      if (!current()) return;
      const error = toSubmissionBuildError(cause);
      setState(error.code === "aborted" ? { status: "cancelled" } : { status: "error", error });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    runRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    resultRef.current = null;
    setSaveState({ status: "idle" });
    setState({ status: "idle" });
  }, []);

  const save = useCallback(async (): Promise<void> => {
    const result = resultRef.current;
    if (!result) return;
    setSaveState({ status: "saving" });
    try {
      const outcome = await (depsRef.current.save ?? defaultSave)(result.blob, result.fileName);
      setSaveState(outcome === "cancelled" ? { status: "cancelled" } : { status: "saved", outcome });
    } catch {
      setSaveState({ status: "error" });
    }
  }, []);

  return { state, saveState, start, cancel, reset, save };
}

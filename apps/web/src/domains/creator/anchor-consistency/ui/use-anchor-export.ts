/**
 * 내려받기 상태 — 참조 팩 미리보기와 ZIP 만들기(진행·취소·오류).
 *
 * 참조 팩 미리보기는 내려받을 ZIP 과 같은 계획(planAnchorExport)에서 나온 값이라 화면과 파일이 어긋나지 않는다. 파일 내용은
 * 화면 언어와 무관하게 같다(각도 이름 등 파일 속 문구는 번역하지 않는다). 시각은 권리 확인 기록에만 남는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AnchorCapturedFrame } from "../anchor-capture-session";
import type { AnchorCaptureSet } from "../anchor-capture-set";
import {
  buildAnchorExportZip,
  planAnchorExport,
  type AnchorExportPlan,
  type AnchorShotFrame,
} from "../anchor-export";
import { startAnchorDownload } from "../anchor-image-io";
import type { AnchorRights } from "../anchor-rights";

export type AnchorExportStatus = "idle" | "building" | "done" | "error" | "cancelled";

export interface AnchorExportState {
  readonly status: AnchorExportStatus;
  readonly completedFiles: number;
  readonly totalFiles: number;
  /** 마지막으로 내려받은 ZIP 의 파일 수. */
  readonly fileCount: number;
}

export interface AnchorExportDeps {
  readonly buildZip: typeof buildAnchorExportZip;
  readonly download: typeof startAnchorDownload;
}

export const defaultAnchorExportDeps: AnchorExportDeps = Object.freeze({
  buildZip: buildAnchorExportZip,
  download: startAnchorDownload,
});

export interface UseAnchorExportOptions {
  readonly set: AnchorCaptureSet | null;
  readonly frames: readonly AnchorCapturedFrame[];
  readonly rights: AnchorRights | null;
  readonly shots: readonly AnchorShotFrame[];
  readonly deps?: AnchorExportDeps;
}

export interface AnchorExportController {
  readonly state: AnchorExportState;
  readonly canExport: boolean;
  /** 세트와 권리 확인이 있을 때의 내보내기 계획. 참조 팩 미리보기가 여기서 나온다. */
  readonly plan: AnchorExportPlan | null;
  readonly start: () => void;
  readonly cancel: () => void;
}

const IDLE: AnchorExportState = Object.freeze({ status: "idle", completedFiles: 0, totalFiles: 0, fileCount: 0 });

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useAnchorExport(options: UseAnchorExportOptions): AnchorExportController {
  const { set, frames, rights, shots } = options;
  const deps = options.deps ?? defaultAnchorExportDeps;
  const [state, setState] = useState<AnchorExportState>(IDLE);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => { controllerRef.current?.abort(); }, []);

  const plan = useMemo(() => {
    if (!set || !rights) return null;
    try {
      return planAnchorExport({ set, frames, rights, origin: "file", shots });
    } catch {
      // 세트와 프레임이 어긋난 순간(읽기 중)에는 계획이 없다. 다음 렌더에서 다시 맞춰진다.
      return null;
    }
  }, [frames, rights, set, shots]);

  const canExport = plan !== null && state.status !== "building";

  const start = useCallback(() => {
    if (!set || !rights || controllerRef.current !== null) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "building", completedFiles: 0, totalFiles: 0, fileCount: 0 });
    void (async () => {
      try {
        const zip = await deps.buildZip(
          { set, frames, rights, origin: "file", shots },
          {
            signal: controller.signal,
            onProgress: (progress) => {
              setState({ status: "building", completedFiles: progress.completedFiles, totalFiles: progress.totalFiles, fileCount: 0 });
            },
          },
        );
        if (controller.signal.aborted) throw new DOMException("취소했어요", "AbortError");
        deps.download(zip.blob, zip.fileName);
        setState({ status: "done", completedFiles: zip.plan.files.length, totalFiles: zip.plan.files.length, fileCount: zip.plan.files.length });
      } catch (error) {
        setState({ ...IDLE, status: controller.signal.aborted || isAbort(error) ? "cancelled" : "error" });
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    })();
  }, [deps, frames, rights, set, shots]);

  const cancel = useCallback(() => { controllerRef.current?.abort(); }, []);

  return { state, canExport, plan, start, cancel };
}

// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SubmissionCoverInput } from "./submission-package-cover";
import { completeDraft, episodeOf, pngBytes, probedPage } from "./submission-package.test-fixture";
import type { SubmissionPackageDraft } from "./submission-package-types";
import {
  useSubmissionPackageBuild,
  type SubmissionBuildDeps,
  type SubmissionBuildParams,
  type SubmissionSaveOutcome,
} from "./use-submission-package-build";

const FIXED_NOW = new Date("2026-10-15T09:30:00.000Z");
const PDF_BYTES = Uint8Array.from(new TextEncoder().encode("%PDF-1.4\n%%EOF\n"));
const PARAMS: SubmissionBuildParams = { locale: "ko", includeCoverPdf: true, platform: null };
const NO_PDF: SubmissionBuildParams = { ...PARAMS, includeCoverPdf: false };
const FILE_NAME = "달빛 아래 편의점-submission-20261015-093000Z.zip";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** 실제 판독을 거친 3화 초안. ZIP 작성기는 보고된 크기와 실제 Blob 크기가 같아야 받는다. */
async function realDraft(): Promise<SubmissionPackageDraft> {
  return completeDraft({
    episodes: [
      episodeOf(1, [await probedPage(pngBytes(690, 4_000, 1_500), "a.png", "a1")]),
      episodeOf(2, [await probedPage(pngBytes(690, 4_000, 1_200), "b.png", "b1")]),
      episodeOf(3, [await probedPage(pngBytes(690, 4_000, 1_100), "c.png", "c1")]),
    ],
  });
}

function setup(deps: SubmissionBuildDeps = {}) {
  return renderHook(() => useSubmissionPackageBuild({ crc32ExecutionMode: "direct-bounded", now: () => FIXED_NOW, renderCoverPdf: async () => PDF_BYTES, ...deps }));
}

/** 표지 PDF 단계에서 멈춰 세우는 장치. 취소 신호를 받으면 AbortError 로 끝난다. */
function pausedCoverPdf() {
  const signals: AbortSignal[] = [];
  const pending: Array<(bytes: Uint8Array) => void> = [];
  const render = vi.fn(
    (_input: SubmissionCoverInput, signal?: AbortSignal) =>
      new Promise<Uint8Array>((resolve, reject) => {
        pending.push(resolve);
        if (signal) {
          signals.push(signal);
          signal.addEventListener("abort", () => reject(new DOMException("취소", "AbortError")), { once: true });
        }
      }),
  );
  const release = (index = 0): void => {
    const resolve = pending[index];
    if (!resolve) throw new Error("멈춰 있는 표지 그리기가 없어요.");
    resolve(PDF_BYTES);
  };
  return { render, release, signals };
}

describe("만들기 상태", () => {
  it("처음엔 idle 이고, 시작하면 building 을 거쳐 done 으로 결과를 돌려준다", async () => {
    const paused = pausedCoverPdf();
    const { result } = setup({ renderCoverPdf: paused.render });
    expect(result.current.state).toEqual({ status: "idle" });
    expect(result.current.saveState).toEqual({ status: "idle" });
    const draft = await realDraft();

    let running: Promise<void> = Promise.resolve();
    act(() => {
      running = result.current.start(draft, PARAMS);
    });
    expect(result.current.state.status).toBe("building");
    await waitFor(() => expect(result.current.state).toMatchObject({ status: "building", progress: { phase: "preparing" } }));

    await act(async () => {
      paused.release();
      await running;
    });
    const state = result.current.state;
    if (state.status !== "done") throw new Error("done 이어야 해요.");
    expect(state.result.fileName).toBe(FILE_NAME);
    // cover.md, cover.pdf, synopsis.md, characters.md, manifest.json + 이미지 3장
    expect(state.result.fileCount).toBe(8);
    expect(state.result.warnings).toEqual([]);
  });

  it("점검에서 막힌 초안은 error(invalid-draft)로 끝나고 다시 시도로 풀리지 않는다고 알린다", async () => {
    const { result } = setup();
    const base = await realDraft();
    await act(async () => {
      await result.current.start({ ...base, episodes: base.episodes.slice(0, 2) }, PARAMS);
    });
    expect(result.current.state).toMatchObject({ status: "error", error: { code: "invalid-draft", retryable: false } });
  });

  it("표지 PDF 를 그리지 못하면 PDF 없이 만들고 경고를 남긴다", async () => {
    const { result } = setup({
      renderCoverPdf: async () => {
        throw new Error("canvas unavailable");
      },
    });
    const draft = await realDraft();
    await act(async () => {
      await result.current.start(draft, PARAMS);
    });
    const state = result.current.state;
    if (state.status !== "done") throw new Error("done 이어야 해요.");
    expect(state.result.warnings).toEqual([{ code: "cover-pdf-failed" }]);
    expect(state.result.fileCount).toBe(7);
  });

  it("CRC 작업자를 쓸 수 없는 환경에서는 한 번 메인 스레드 계산으로 다시 시도하고 경고를 남긴다", async () => {
    const { result } = setup({ crc32ExecutionMode: "worker" });
    const draft = await realDraft();
    await act(async () => {
      await result.current.start(draft, NO_PDF);
    });
    const state = result.current.state;
    if (state.status !== "done") throw new Error("done 이어야 해요.");
    expect(state.result.warnings).toEqual([{ code: "crc32-worker-unavailable" }]);
    expect(state.result.fileCount).toBe(7);
  });
});

describe("취소와 되돌리기", () => {
  it("취소하면 신호가 전달되고 cancelled 로 끝난다", async () => {
    const paused = pausedCoverPdf();
    const { result } = setup({ renderCoverPdf: paused.render });
    const draft = await realDraft();
    let running: Promise<void> = Promise.resolve();
    act(() => {
      running = result.current.start(draft, PARAMS);
    });
    await waitFor(() => expect(paused.render).toHaveBeenCalledTimes(1));

    act(() => result.current.cancel());
    await act(async () => {
      await running;
    });
    expect(result.current.state).toEqual({ status: "cancelled" });
    expect(paused.signals[0]?.aborted).toBe(true);
  });

  it("처음으로 돌아간 뒤에 늦게 끝난 만들기는 상태를 바꾸지 않는다", async () => {
    const paused = pausedCoverPdf();
    const { result } = setup({ renderCoverPdf: paused.render });
    const draft = await realDraft();
    let running: Promise<void> = Promise.resolve();
    act(() => {
      running = result.current.start(draft, PARAMS);
    });
    await waitFor(() => expect(paused.render).toHaveBeenCalledTimes(1));

    act(() => result.current.reset());
    expect(result.current.state).toEqual({ status: "idle" });
    await act(async () => {
      paused.release();
      await running;
    });
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("새로 시작하면 이전 만들기를 취소하고 새 결과만 반영한다", async () => {
    const paused = pausedCoverPdf();
    const { result } = setup({ renderCoverPdf: paused.render });
    const draft = await realDraft();
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.start(draft, PARAMS);
    });
    await waitFor(() => expect(paused.render).toHaveBeenCalledTimes(1));
    act(() => {
      second = result.current.start(draft, NO_PDF);
    });
    await act(async () => {
      await Promise.all([first, second]);
    });

    expect(paused.signals[0]?.aborted).toBe(true);
    const state = result.current.state;
    if (state.status !== "done") throw new Error("done 이어야 해요.");
    expect(state.result.fileCount).toBe(7);
  });

  it("화면을 떠나면 진행 중인 만들기를 취소한다", async () => {
    const paused = pausedCoverPdf();
    const { result, unmount } = setup({ renderCoverPdf: paused.render });
    const draft = await realDraft();
    let running: Promise<void> = Promise.resolve();
    act(() => {
      running = result.current.start(draft, PARAMS);
    });
    await waitFor(() => expect(paused.render).toHaveBeenCalledTimes(1));

    unmount();
    expect(paused.signals[0]?.aborted).toBe(true);
    await running;
  });
});

describe("저장", () => {
  async function builtController(save: SubmissionBuildDeps["save"]) {
    const hook = setup({ save });
    const draft = await realDraft();
    await act(async () => {
      await hook.result.current.start(draft, NO_PDF);
    });
    return hook;
  }

  it("주입한 저장 함수에 ZIP 과 파일 이름을 넘기고 결과를 saveState 에 반영한다", async () => {
    const save = vi.fn(async (_blob: Blob, _fileName: string): Promise<SubmissionSaveOutcome> => "file-handle");
    const { result } = await builtController(save);

    await act(async () => {
      await result.current.save();
    });
    expect(save).toHaveBeenCalledTimes(1);
    const call = save.mock.calls[0];
    expect(call?.[0].type).toBe("application/zip");
    expect(call?.[1]).toBe(FILE_NAME);
    expect(result.current.saveState).toEqual({ status: "saved", outcome: "file-handle" });
  });

  it("저장 위치 선택을 취소하면 cancelled, 저장 중 오류가 나면 error 로 알린다", async () => {
    const save = vi
      .fn(async (_blob: Blob, _fileName: string): Promise<SubmissionSaveOutcome> => "cancelled")
      .mockImplementationOnce(async () => "cancelled")
      .mockImplementationOnce(async () => {
        throw new Error("disk full");
      })
      .mockImplementationOnce(async () => "download");
    const { result } = await builtController(save);

    await act(async () => {
      await result.current.save();
    });
    expect(result.current.saveState).toEqual({ status: "cancelled" });
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.saveState).toEqual({ status: "error" });
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.saveState).toEqual({ status: "saved", outcome: "download" });
  });

  it("저장하는 동안은 saving 이다", async () => {
    let finish: (outcome: SubmissionSaveOutcome) => void = () => undefined;
    const save = vi.fn(
      (_blob: Blob, _fileName: string) =>
        new Promise<SubmissionSaveOutcome>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = await builtController(save);

    let saving: Promise<void> = Promise.resolve();
    act(() => {
      saving = result.current.save();
    });
    expect(result.current.saveState).toEqual({ status: "saving" });
    await act(async () => {
      finish("download");
      await saving;
    });
    expect(result.current.saveState).toEqual({ status: "saved", outcome: "download" });
  });

  it("만든 결과가 없으면 저장은 아무것도 하지 않는다", async () => {
    const save = vi.fn(async (_blob: Blob, _fileName: string): Promise<SubmissionSaveOutcome> => "download");
    const { result } = setup({ save });
    await act(async () => {
      await result.current.save();
    });
    expect(save).not.toHaveBeenCalled();
    expect(result.current.saveState).toEqual({ status: "idle" });
  });

  it("처음으로 돌아가면 이전 결과는 저장할 수 없다", async () => {
    const save = vi.fn(async (_blob: Blob, _fileName: string): Promise<SubmissionSaveOutcome> => "download");
    const { result } = await builtController(save);
    act(() => result.current.reset());
    await act(async () => {
      await result.current.save();
    });
    expect(save).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deviceKey, records, writeDevice } from "../planning/__tests__/planning-device-database";

import { createStudioAiComicDirectorApiClient, type StudioAiComicDirectorApiClient } from "./studio-ai-comic-director-api";
import { createStudioAiComicDirectorSession, studioAiComicDirectorStorageKey, type StudioAiComicDirectorJob } from "./studio-ai-comic-director-session";
import { createEmptyStudioAiImageReferenceDocument } from "./studio-ai-image-reference-roles";
import {
  StudioAiComicDirectorPanel,
  type StudioAiComicDirectorPanelProps,
} from "./StudioAiComicDirectorPanel";

import { scenarioImageInputFingerprint } from "./studio-scenario-candidate-workflow";
import type { ScenarioImageLayerManifest, ScenarioImageQualityReport, ScenarioPreviewItem } from "../studio-scenario-layout";

vi.mock("./StudioDirectorMaskEditor", () => ({
  StudioDirectorMaskEditor: ({ onChange }: { readonly onChange: (mask: string) => void }) => (
    <button type="button" onClick={() => onChange("data:image/png;base64,bWFzaw==")}>시험 마스크 준비</button>
  ),
}));

const media = vi.hoisted(() => ({
  analyze: vi.fn(),
  decompose: vi.fn(),
  repair: vi.fn(),
}));
vi.mock("./studio-ai-comic-director-media", async (importOriginal) => ({
  ...await importOriginal<typeof import("./studio-ai-comic-director-media")>(),
  analyzeStudioAiComicCandidate: media.analyze,
  decomposeStudioAiComicCandidate: media.decompose,
  repairStudioAiComicImageRegion: media.repair,
}));

function deferred<T>() {
  let finish: (value: T) => void = () => { throw new Error("응답을 준비하지 못했습니다."); };
  const promise = new Promise<T>((resolve) => { finish = resolve; });
  return { promise, finish };
}

const PNG_A = "data:image/png;base64,YQ==";
const PNG_B = "data:image/png;base64,Yg==";
const PNG_REPAIR = "data:image/png;base64,Yw==";
const timestamp = "2026-11-26T00:00:00.000Z";
const repairConfig = {
  apiKey: "synthetic-review-key",
  baseUrl: "https://example.invalid/v1",
  imageGenerationPath: "/images/generations",
  imageEditPath: "/images/edits",
  chatCompletionsPath: "/chat/completions",
  imageModel: "synthetic",
  textModel: "synthetic",
};
function twoCandidates(): ScenarioPreviewItem {
  const first = PREVIEW[0];
  if (!first) throw new Error("시험 장면이 없습니다.");
  const signature = scenarioImageInputFingerprint(first);
  return {
    ...first,
    selectedImageCandidateId: "source-a",
    imageDataUrl: PNG_A,
    imageCandidates: [
      { id: "source-a", imageDataUrl: PNG_A, inputFingerprint: signature, createdAt: timestamp },
      { id: "source-b", imageDataUrl: PNG_B, inputFingerprint: signature, createdAt: timestamp },
    ],
  };
}
function enterMask() {
  fireEvent.click(screen.getByRole("button", { name: "시험 마스크 준비" }));
}
const repairResult = {
  ok: true,
  data: {
    imageDataUrl: PNG_REPAIR,
    repair: {
      version: 1, target: "hands", parentCandidateId: "source-a", maskFingerprint: "synthetic",
      prompt: "synthetic", provider: "mock", model: "synthetic", createdAt: timestamp,
    },
  },
} as const;

const PREVIEW: ScenarioPreviewItem[] = [
  {
    frame: { x: 24, y: 24, width: 672, height: 480 },
    bubbles: [],
    beatType: "setup",
    summary: "비 내리는 폐역",
    imagePrompt: "비 내리는 폐역에 서하가 들어선다.",
    dialogue: "",
    aspect: "landscape",
  },
  {
    frame: { x: 24, y: 528, width: 672, height: 480 },
    bubbles: [],
    beatType: "turn",
    summary: "유진을 발견",
    imagePrompt: "어둠 속 유진이 웃고 있다.",
    dialogue: "유진: 오랜만이야, 서하.",
    aspect: "landscape",
  },
];

function props(
  overrides: Partial<StudioAiComicDirectorPanelProps> = {},
): StudioAiComicDirectorPanelProps {
  return {
    open: true,
    onClose: vi.fn(),
    textConfigured: true,
    imageConfigured: true,
    imageReferenceDocument: createEmptyStudioAiImageReferenceDocument(),
    imageReferenceAssetOptions: [],
    imageReferencesLoading: false,
    imageReferenceMissingCount: 0,
    onImageReferenceDocumentChange: vi.fn(),
    storyText: "비 오는 밤, 서하가 폐역에서 유진을 발견한다.",
    onStoryTextChange: vi.fn(),
    sceneCountHint: 2,
    onSceneCountHintChange: vi.fn(),
    applyTarget: "current-page",
    onApplyTargetChange: vi.fn(),
    busy: false,
    stageLabel: null,
    progress: null,
    error: null,
    preview: PREVIEW,
    textProvenance: null,
    onGenerate: vi.fn(),
    onGenerateImages: vi.fn(),
    onChangeScene: vi.fn(),
    onRemoveScene: vi.fn(),
    onRegenerateScene: vi.fn(),
    regeneratingIndex: null,
    onCancel: vi.fn(),
    onApply: vi.fn(),
    onDiscard: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("StudioAiComicDirectorPanel", () => {
  it("opens the reviewed plan as an accessible four-stage production flow", () => {
    render(<StudioAiComicDirectorPanel {...props()} />);

    expect(screen.getByRole("dialog", { name: /AI 코믹 디렉터/u })).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "AI 코믹 디렉터 제작 단계" }),
    ).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "컷 1 제작 선택" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "1번 장면 그림 프롬프트" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /이야기·기준/u }));
    expect(screen.getByText("작품 바이블 · AI 이미지 참조 팩")).toBeTruthy();
  });

  it("generates only explicitly selected panels with the production profile variants", () => {
    const onGenerateImages = vi.fn();
    render(
      <StudioAiComicDirectorPanel
        {...props({ onGenerateImages })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "선택 해제" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "컷 2 제작 선택" }));
    fireEvent.click(
      screen.getByRole("button", { name: "선택한 1컷 제작하기" }),
    );

    expect(onGenerateImages).toHaveBeenCalledExactlyOnceWith({ indexes: [1], variants: 2 }, expect.any(Function));
    expect(screen.getByRole("button", { name: "선택한 1컷 제작하기" })).toBeTruthy();
    expect(screen.queryByText("후보를 만들고 사용할 결과 선택")).toBeNull();
    act(() => onGenerateImages.mock.calls[0]![1]());
    expect(screen.getByText("후보를 만들고 사용할 결과 선택")).toBeTruthy();
  });

  it("확정한 그림과 설명이 빈 컷은 자동 선택에서 제외하며 직접 해제한 컷은 다시 표시할 때도 해제되어 있다", () => {
    const onGenerateImages = vi.fn();
    const preview = [{ ...PREVIEW[0]!, imageDataUrl: "data:image/png;base64,completed" }, PREVIEW[1]!, { ...PREVIEW[1]!, imagePrompt: "" }];
    const view = render(<StudioAiComicDirectorPanel {...props({ preview, onGenerateImages })} />);
    fireEvent.click(screen.getByRole("button", { name: /컷 연출/u }));
    const cut = (n: number) => screen.getByRole<HTMLInputElement>("checkbox", { name: `컷 ${n} 제작 선택` });
    expect([cut(1).checked, cut(2).checked, cut(3).checked]).toEqual([false, true, false]);
    fireEvent.click(screen.getByRole("button", { name: "선택 해제" }));
    view.rerender(<StudioAiComicDirectorPanel {...props({ preview: [...preview], onGenerateImages })} />);
    expect(cut(2).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "그림 없는 컷 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택한 1컷 제작하기" }));
    expect(onGenerateImages).toHaveBeenCalledExactlyOnceWith({ indexes: [1], variants: 2 }, expect.any(Function));
  });

  it("writes the chosen creative direction into the real image prompt before generation", () => {
    const onChangeScene = vi.fn();
    render(<StudioAiComicDirectorPanel {...props({ onChangeScene })} />);

    fireEvent.click(screen.getByRole("button", { name: /유진을 발견/u }));
    fireEvent.change(screen.getByRole("combobox", { name: "2번 장면 제작 방향" }), {
      target: { value: "cinematic" },
    });

    expect(onChangeScene).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        imagePrompt: expect.stringContaining("AI 코믹 디렉터 제작 방향: 시네마틱형"),
      }),
    );
  });

  it("is honest when targeted mask repair is not connected", () => {
    const prepared = PREVIEW.map((item, index) => ({
      ...item,
      imageDataUrl: `data:image/png;base64,${index}`,
    }));
    render(<StudioAiComicDirectorPanel {...props({ preview: prepared })} />);

    expect(screen.getByText(/마스크 영역 수리를 연결하지 않았습니다/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "이 컷 전체 다시 제작" })).toBeTruthy();
  });

  it("previews exactly what will be added and uses the existing apply command", () => {
    const onApply = vi.fn();
    const onApplyTargetChange = vi.fn();
    render(
      <StudioAiComicDirectorPanel
        {...props({ onApply, onApplyTargetChange })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /마감·추가/u }));
    fireEvent.click(screen.getByRole("radio", { name: /다음 새 페이지/u }));
    fireEvent.click(screen.getByRole("button", { name: "현재 페이지에 적용" }));

    expect(onApplyTargetChange).toHaveBeenCalledWith("new-page");
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByText("기존 레이어 변경")).toBeTruthy();
    expect(screen.getByText("없음")).toBeTruthy();
  });

  it("keeps selected work and cancellation visible while a job is running", () => {
    const onCancel = vi.fn();
    render(
      <StudioAiComicDirectorPanel
        {...props({
          busy: true,
          stageLabel: "검토한 장면 이미지 생성 중…",
          progress: { done: 1, total: 4 },
          onCancel,
        })}
      />,
    );

    expect(
      screen
        .getAllByRole("status")
        .some((status) => status.textContent?.includes("(1/4)")),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

it("검수를 열기만 하면 기존 대본을 보존하고 변경 저장이 실패하면 같은 변경을 다시 확인한다", async () => {
  const prior = createStudioAiComicDirectorSession({ id: "review-device", storyText: "이미 쓴 대사", scenes: PREVIEW });
  const key = deviceKey("studio-director-drafts", studioAiComicDirectorStorageKey(prior.id));
  records.set(key, JSON.stringify(prior));
  const settings = props({ sessionId: prior.id, storyText: "이전 원고 대사" });
  const view = render(<StrictMode><StudioAiComicDirectorPanel {...settings} /></StrictMode>);
  await act(async () => {});
  expect(writeDevice).not.toHaveBeenCalled();
  writeDevice.mockRejectedValueOnce(new Error("quota"));
  fireEvent.click(screen.getByRole("button", { name: /제작·수리/u }));
  await screen.findByText(/검수 변경을 저장하지 못했어요/u);
  expect(JSON.parse(records.get(key)!).storyText).toBe("이미 쓴 대사");
  fireEvent.click(screen.getByRole("button", { name: "이 기기에 다시 저장" }));
  await waitFor(() => expect(screen.queryByText(/검수 변경을 저장하지 못했어요/u)).toBeNull());
  expect(JSON.parse(records.get(key)!)).toMatchObject({ storyText: "이미 쓴 대사", stage: "production" });
  view.unmount();
});

describe("코믹 디렉터 후보 작업 중 대상 변경", () => {
  beforeEach(() => {
    media.analyze.mockReset();
    media.decompose.mockReset();
    media.repair.mockReset();
  });

  it.each(["quality", "layers"] as const)("선택이 바뀐 뒤 %s 결과는 시작 후보에만 남긴다", async (kind) => {
    const onChangeScene = vi.fn<StudioAiComicDirectorPanelProps["onChangeScene"]>();
    const scene = twoCandidates();
    const quality = deferred<ScenarioImageQualityReport>();
    const layers = deferred<ScenarioImageLayerManifest>();
    media.analyze.mockReturnValueOnce(quality.promise);
    media.decompose.mockReturnValueOnce(layers.promise);

    const base = props({ preview: [scene], onChangeScene, aiSettings: repairConfig });
    const view = render(<StudioAiComicDirectorPanel {...base} />);
    if (kind === "layers") enterMask();
    fireEvent.click(screen.getByRole("button", { name: kind === "quality" ? "현재 후보 픽셀 품질 분석" : "마스크로 전경·배경 분리" }));
    await waitFor(() => expect(kind === "quality" ? media.analyze : media.decompose).toHaveBeenCalled());

    view.rerender(<StudioAiComicDirectorPanel {...base} preview={[{
      ...scene, selectedImageCandidateId: "source-b", imageDataUrl: PNG_B,
    }]} />);
    await act(async () => {
      if (kind === "quality") {
        quality.finish({
          version: 1, width: 64, height: 64, pixelCount: 4096, opaqueCoverage: 1, edgeOccupancy: 1,
          meanLuminance: 0.5, contrast: 0.5, confidence: "measured", findings: [], analyzedAt: timestamp,
        });
      } else {
        layers.finish({
          version: 1, method: "manual-mask", editable: true, sourceCandidateId: "source-a",
          layers: [], createdAt: timestamp,
        });
      }
    });

    const patch = onChangeScene.mock.calls.at(-1)?.[1];
    const field = kind === "quality" ? "qualityReport" : "layerManifest";
    expect(patch?.imageCandidates?.find((candidate) => candidate.id === "source-a")?.[field]).toBeDefined();
    expect(patch?.imageCandidates?.find((candidate) => candidate.id === "source-b")?.[field]).toBeUndefined();
    expect(patch?.[field]).toBeUndefined();
  });

  it("오래된 이미지를 수리한 결과가 새 프롬프트와 일치한다는 표시를 하지 않는다", async () => {
    const scene = twoCandidates();
    const oldFingerprint = scenarioImageInputFingerprint(scene);
    const newerScene = { ...scene, imagePrompt: "사용자가 새로 쓴 프롬프트", imageDataUrl: undefined };
    expect(scenarioImageInputFingerprint(newerScene)).not.toBe(oldFingerprint);
    const onChangeScene = vi.fn<StudioAiComicDirectorPanelProps["onChangeScene"]>();
    const pending = deferred<typeof repairResult>();
    media.repair.mockReturnValueOnce(pending.promise);
    const base = props({ preview: [scene], onChangeScene, aiSettings: repairConfig });
    const view = render(<StudioAiComicDirectorPanel {...base} />);
    enterMask();
    fireEvent.click(screen.getByRole("button", { name: "선택 영역만 수리" }));
    await waitFor(() => expect(media.repair).toHaveBeenCalled());
    view.rerender(<StudioAiComicDirectorPanel {...base} preview={[newerScene]} />);
    await act(async () => { pending.finish(repairResult); });

    const patch = onChangeScene.mock.calls.at(-1)?.[1];
    expect(patch?.imageCandidates?.find((candidate) => candidate.imageDataUrl === PNG_REPAIR)?.inputFingerprint).toBe(oldFingerprint);
    expect(patch?.imageDataUrl).toBeUndefined();
    expect(patch?.selectedImageCandidateId).toBeUndefined();
  });

  it("세션 작업 등록 중 수리를 취소하면 등록 응답 뒤에도 이미지 요청을 시작하지 않는다", async () => {
    const job: StudioAiComicDirectorJob = {
      id: "job-registering", operationId: "mock-op", kind: "repair", status: "running",
      progressDone: 0, progressTotal: 1, payload: {}, result: null, error: null,
      leaseExpiresAt: null, updatedAt: timestamp,
    };
    const registered = deferred<{ readonly ok: true; readonly data: StudioAiComicDirectorJob }>();
    const createJob = vi.fn<StudioAiComicDirectorApiClient["createJob"]>().mockReturnValue(registered.promise);
    const updateJob = vi.fn<StudioAiComicDirectorApiClient["updateJob"]>().mockResolvedValue({
      ok: true, data: { ...job, status: "cancelled" },
    });
    const createArtifact = vi.fn<StudioAiComicDirectorApiClient["createArtifact"]>().mockResolvedValue({ ok: true, data: {} });
    const sessionApiClient: StudioAiComicDirectorApiClient = {
      ...createStudioAiComicDirectorApiClient(), createJob, updateJob, createArtifact,
    };
    media.repair.mockResolvedValueOnce(repairResult);
    const onChangeScene = vi.fn<StudioAiComicDirectorPanelProps["onChangeScene"]>();
    render(<StudioAiComicDirectorPanel {...props({
      preview: [twoCandidates()], aiSettings: repairConfig, sessionId: "review-cancel-while-registering",
      sessionApiClient, onChangeScene,
    })} />);
    enterMask();
    fireEvent.click(screen.getByRole("button", { name: "선택 영역만 수리" }));
    expect(createJob).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "수리 취소" }));
    await act(async () => { registered.finish({ ok: true, data: job }); });

    expect(media.repair).not.toHaveBeenCalled();
    expect(onChangeScene).not.toHaveBeenCalled();
    expect(createArtifact).not.toHaveBeenCalled();
    expect(updateJob).toHaveBeenCalledWith("review-cancel-while-registering", job.id, expect.objectContaining({ status: "cancelled" }));
  });


  it("대상과 프롬프트를 유지하면 수리 결과를 같은 컷의 새 후보로 선택한다", async () => {
    const onChangeScene = vi.fn<StudioAiComicDirectorPanelProps["onChangeScene"]>();
    media.repair.mockResolvedValueOnce(repairResult);
    render(<StudioAiComicDirectorPanel {...props({
      preview: [twoCandidates()], aiSettings: repairConfig, onChangeScene,
    })} />);
    enterMask();
    fireEvent.click(screen.getByRole("button", { name: "선택 영역만 수리" }));

    await waitFor(() => expect(onChangeScene).toHaveBeenCalledOnce());
    const [index, patch] = onChangeScene.mock.calls[0] ?? [];
    expect(index).toBe(0);
    expect(patch?.imageDataUrl).toBe(PNG_REPAIR);
    expect(patch?.imageCandidates?.find((candidate) => candidate.id === patch.selectedImageCandidateId)?.repair?.parentCandidateId)
      .toBe("source-a");
  });

});

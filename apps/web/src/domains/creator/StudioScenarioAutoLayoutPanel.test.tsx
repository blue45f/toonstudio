// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { lockUserAi, setUserAiConfiguration } from "@/shared/ai/user-ai-store";

import type { UserAiConfiguration } from "@/shared/ai/user-ai-types";
import { STUDIO_AI_DEFAULT_SETTINGS } from "./ai/studio-ai-client";
import {
  createEmptyStudioAiImageReferenceDocument,
  hydrateStudioAiImageReferenceDocument,
  type StudioAiImageReferenceDocument,
} from "./ai/studio-ai-image-reference-roles";
import {
  StudioScenarioAutoLayoutPanel,
  type StudioScenarioAutoLayoutPanelProps,
} from "./StudioScenarioAutoLayoutPanel";

import { applyStudioScenarioScenePatch, computeStudioScenarioDraftRelayout } from "./studio-cuttoon-edit/studio-host-canvas-element-helpers";
import type { El, ImageEl } from "./studio-element-model";
import type { ScenarioPreviewItem } from "./studio-scenario-layout";

afterEach(() => {
  cleanup();
  lockUserAi(false);
  sessionStorage.clear();
  localStorage.clear();
});

const LEGACY_SETTINGS_KEY = "toonstudio-studio-ai-settings";

function unifiedImageByokConfiguration(): UserAiConfiguration {
  return {
    version: 1,
    connections: [{
      id: "test-image-byok",
      label: "테스트 이미지 BYOK",
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-fake-byok-key-001",
      textModel: "",
      imageModel: "test-fake-image-model",
      imageGenerationPath: "/images/generations",
      imageEditPath: "/images/edits",
      chatCompletionsPath: "/chat/completions",
      costPolicy: "user-funded-byok",
      enabled: true,
      priority: 10,
      apiKeys: [{
        id: "key-1",
        label: "기본 키",
        apiKey: "test-fake-byok-key-001",
        enabled: true,
        priority: 10,
      }],
      models: [{
        id: "model-1",
        label: "테스트 이미지 모델",
        model: "test-fake-image-model",
        capability: "image",
        enabled: true,
        priority: 10,
      }],
    }],
    assignments: {
      text: null,
      image: "test-image-byok",
      inference: null,
      "three-d": null,
    },
  };
}

function openRepairStage() {
  fireEvent.click(screen.getByRole("button", { name: /제작·수리/u }));
}

const ASSETS = [
  {
    id: "asset/hero",
    name: "주인공 설정화",
    thumbnailUrl: "data:image/png;base64,preview-only",
  },
  {
    id: "asset/camera",
    name: "로우 앵글 구도",
    thumbnailUrl: "blob:http://localhost/camera-preview",
  },
  {
    id: "asset/style",
    name: "잉크 화풍",
    thumbnailUrl: "data:image/webp;base64,style-preview-only",
  },
] as const;

const PREVIEW: ScenarioPreviewItem[] = [
  {
    frame: { x: 24, y: 24, width: 672, height: 480 },
    bubbles: [],
    beatType: "setup",
    summary: "주인공이 골목에 들어선다.",
    imagePrompt: "비 내리는 저녁 골목, 주인공의 전신",
    dialogue: "주인공: 늦었다.",
    aspect: "landscape",
  },
];

function referenceDocument(): StudioAiImageReferenceDocument {
  return hydrateStudioAiImageReferenceDocument({
    references: [
      {
        id: "hero-reference",
        role: "character",
        assetId: "asset/hero",
        label: "주인공 설정화",
      },
      {
        id: "camera-reference",
        role: "method",
        assetId: "asset/camera",
        label: "로우 앵글 구도",
      },
      {
        id: "style-reference",
        role: "style",
        assetId: "asset/style",
        label: "잉크 화풍",
      },
    ],
  });
}

function panelProps(
  overrides: Partial<StudioScenarioAutoLayoutPanelProps> = {},
): StudioScenarioAutoLayoutPanelProps {
  return {
    open: true,
    onClose: vi.fn(),
    textConfigured: true,
    imageConfigured: true,
    imageReferenceDocument: referenceDocument(),
    imageReferenceAssetOptions: ASSETS,
    imageReferencesLoading: false,
    imageReferenceMissingCount: 0,
    onImageReferenceDocumentChange: vi.fn(),
    storyText: "비 오는 날 주인공이 약속 장소로 달려간다.",
    onStoryTextChange: vi.fn(),
    sceneCountHint: 3,
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

describe("StudioScenarioAutoLayoutPanel comic director integration", () => {
  it("keeps the three canonical reference roles controlled by the existing parent", () => {
    const props = panelProps();
    render(<StudioScenarioAutoLayoutPanel {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /이야기·기준/u }));
    expect(screen.getByRole("heading", { name: "Character · 캐릭터" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Method · 구도·연출" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Style · 화풍" })).toBeTruthy();

    fireEvent.change(
      screen.getByRole("textbox", { name: "주인공 설정화 참조 지침" }),
      { target: { value: "얼굴과 의상 정체성만 유지" } },
    );

    expect(props.onImageReferenceDocumentChange).toHaveBeenCalledTimes(1);
    const changed = vi.mocked(props.onImageReferenceDocumentChange).mock.calls[0]?.[0];
    expect(changed?.references.map((reference) => reference.role)).toEqual([
      "character",
      "method",
      "style",
    ]);
    expect(changed?.references[0]).toMatchObject({
      id: "hero-reference",
      role: "character",
      guidance: "얼굴과 의상 정체성만 유지",
    });
  });

  it("makes story and reference editing read-only while keeping cancellation available", () => {
    const props = panelProps({
      busy: true,
      stageLabel: "검토한 장면 이미지 생성 중…",
      progress: { done: 0, total: 1 },
    });
    render(<StudioScenarioAutoLayoutPanel {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /이야기·기준/u }));
    expect(
      (screen.getByRole("textbox", { name: "이야기 또는 회차 대본" }) as HTMLTextAreaElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("combobox", { name: "Character에 추가할 에셋" }) as HTMLSelectElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("textbox", { name: "주인공 설정화 참조 지침" }) as HTMLTextAreaElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /제작·수리/u }));
    const cancel = screen.getByRole("button", { name: "취소" });
    fireEvent.click(cancel);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("status").some((status) => status.textContent?.includes("(0/1)")))
      .toBe(true);
  });

  it("blocks selected image requests while a configured reference is missing", () => {
    const props = panelProps({ imageReferenceMissingCount: 1 });
    render(<StudioScenarioAutoLayoutPanel {...props} />);

    const generate = screen.getByRole("button", { name: "선택한 1컷 제작하기" }) as HTMLButtonElement;
    expect(generate.disabled).toBe(true);
    fireEvent.click(generate);
    expect(props.onGenerateImages).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /이야기·기준/u }));
    expect(screen.getByRole("alert").textContent).toContain("참조 에셋 1개");
  });

  it("does not make an empty reference pack depend on asset-list loading", () => {
    const onGenerateImages = vi.fn<StudioScenarioAutoLayoutPanelProps["onGenerateImages"]>();
    const props = panelProps({
      imageReferenceDocument: createEmptyStudioAiImageReferenceDocument(),
      imageReferencesLoading: true,
      imageReferenceMissingCount: 0,
      onGenerateImages,
    });
    render(<StudioScenarioAutoLayoutPanel {...props} />);

    const generate = screen.getByRole("button", { name: "선택한 1컷 제작하기" }) as HTMLButtonElement;
    expect(generate.disabled).toBe(false);
    fireEvent.click(generate);
    expect(onGenerateImages).toHaveBeenCalledExactlyOnceWith({ indexes: [0], variants: 2 }, expect.any(Function));
    const production = screen.getByRole("button", { name: /제작·수리/u });
    expect(production.getAttribute("aria-current")).toBeNull();
    const [, onStarted] = onGenerateImages.mock.calls[0]!;
    act(() => onStarted!());
    expect(production.getAttribute("aria-current")).toBe("step");
  });
});

describe("StudioScenarioAutoLayoutPanel BYOK 라우팅 정합성", () => {
  it("aiSettings 미전달 시 통합 스토어의 이미지 BYOK 경로를 사용한다", () => {
    setUserAiConfiguration(unifiedImageByokConfiguration());
    render(<StudioScenarioAutoLayoutPanel {...panelProps()} />);

    openRepairStage();

    expect(screen.queryByText(/마스크 영역 수리를 연결하지 않았습니다/u)).toBeNull();
    expect(screen.getByText("먼저 사용할 후보를 선택하세요.")).toBeTruthy();
  });

  it("레거시 평문 저장소의 키를 읽지 않는다", () => {
    sessionStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify({
      ...STUDIO_AI_DEFAULT_SETTINGS,
      apiKey: "test-fake-legacy-key-001",
    }));
    render(<StudioScenarioAutoLayoutPanel {...panelProps()} />);

    openRepairStage();

    expect(screen.getByText(/마스크 영역 수리를 연결하지 않았습니다/u)).toBeTruthy();
  });

  it("레거시 localStorage 키를 sessionStorage로 복사하지 않는다", () => {
    localStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify({
      ...STUDIO_AI_DEFAULT_SETTINGS,
      apiKey: "test-fake-legacy-key-002",
    }));
    render(<StudioScenarioAutoLayoutPanel {...panelProps()} />);

    openRepairStage();

    expect(screen.getByText(/마스크 영역 수리를 연결하지 않았습니다/u)).toBeTruthy();
    expect(sessionStorage.getItem(LEGACY_SETTINGS_KEY)).toBeNull();
  });

  it("텍스트 전용 통합 경로만 있으면 수리를 미연결로 표시한다", () => {
    const textOnly = unifiedImageByokConfiguration();
    const connection = textOnly.connections[0];
    if (!connection) throw new Error("테스트 설정을 만들지 못했습니다.");
    textOnly.connections[0] = {
      ...connection,
      textModel: "test-fake-text-model",
      imageModel: "",
      models: [{
        id: "model-1",
        label: "테스트 텍스트 모델",
        model: "test-fake-text-model",
        capability: "text",
        enabled: true,
        priority: 10,
      }],
    };
    textOnly.assignments = {
      text: "test-image-byok",
      image: null,
      inference: null,
      "three-d": null,
    };
    setUserAiConfiguration(textOnly);
    render(<StudioScenarioAutoLayoutPanel {...panelProps()} />);

    openRepairStage();

    expect(screen.getByText(/마스크 영역 수리를 연결하지 않았습니다/u)).toBeTruthy();
  });

  it("부모가 전달한 aiSettings를 우선한다", () => {
    const props = panelProps({
      aiSettings: { ...STUDIO_AI_DEFAULT_SETTINGS, apiKey: "test-fake-explicit-key-001" },
    });
    render(<StudioScenarioAutoLayoutPanel {...props} />);

    openRepairStage();

    expect(screen.queryByText(/마스크 영역 수리를 연결하지 않았습니다/u)).toBeNull();
    expect(screen.getByText("먼저 사용할 후보를 선택하세요.")).toBeTruthy();
  });
});

const FLAT_IMAGE = "data:image/png;base64,YQ==";
const BACKGROUND_IMAGE = "data:image/png;base64,Yg==";
const FOREGROUND_IMAGE = "data:image/png;base64,Yw==";
const TRANSPARENT_PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";
const existingFrame: El = { id: "existing-frame", type: "frame", x: 24, y: 60, width: 672, height: 850 };

function layeredScenario(): ScenarioPreviewItem {
  const scene = PREVIEW[0];
  if (!scene) throw new Error("기획 시험 장면이 없습니다.");
  return {
    ...scene,
    dialogue: "서하: 약속을 잊지 말아요.",
    imageDataUrl: FLAT_IMAGE,
    imageCandidates: [{
      id: "active-source", inputFingerprint: "synthetic", imageDataUrl: FLAT_IMAGE,
      createdAt: "2026-11-26T00:00:00.000Z",
    }],
    selectedImageCandidateId: "active-source",
    layerManifest: {
      version: 1, method: "manual-mask", editable: true, sourceCandidateId: "active-source",
      createdAt: "2026-11-26T00:00:00.000Z",
      layers: [
        { id: "bg-artifact", name: "배경", role: "background", sourceCandidateId: "active-source", imageDataUrl: BACKGROUND_IMAGE },
        { id: "fg-artifact", name: "전경", role: "foreground", sourceCandidateId: "active-source", imageDataUrl: FOREGROUND_IMAGE },
      ],
    },
  };
}

function LayerApplyHarness({
  item, applied,
}: {
  readonly item: ScenarioPreviewItem;
  readonly applied: (afterRelayout: ScenarioPreviewItem) => void;
}) {
  const [preview, setPreview] = useState<ScenarioPreviewItem[] | null>([item]);
  // 실제 호스트의 장면 수정과 최종 적용에서 같은 배치 함수를 사용한다.
  const layoutOptions = { target: "current-page" as const, elements: [existingFrame], canvasHeight: 1080 };
  return <StudioScenarioAutoLayoutPanel {...panelProps({
    preview,
    onChangeScene: (index, patch) => setPreview((current) => current ? computeStudioScenarioDraftRelayout({
      ...layoutOptions, items: applyStudioScenarioScenePatch(current, index, patch),
    }).items : null),
    onApply: () => {
      if (!preview) return;
      const [confirmed] = computeStudioScenarioDraftRelayout({ ...layoutOptions, items: preview }).items;
      if (!confirmed) return;
      applied(confirmed);
      setPreview(null);
    },
  })} />;
}

describe("코믹 디렉터 분리 레이어 원고 적용", () => {
  it("호스트 배치를 두 번 거쳐도 투명 프레임 위에 배경·전경과 기본 말풍선이 각 한 번 적용된다", async () => {
    const applied = vi.fn<(scenario: ScenarioPreviewItem) => void>();
    render(<LayerApplyHarness item={layeredScenario()} applied={applied} />);
    fireEvent.click(screen.getByRole("button", { name: /마감·추가/u }));
    const apply = screen.getByRole("button", { name: "현재 페이지에 적용" });
    fireEvent.click(apply);
    await waitFor(() => expect(applied).toHaveBeenCalledOnce());

    const committed = applied.mock.calls[0]?.[0];
    if (!committed) throw new Error("적용된 컷이 없습니다.");
    const all = committed.bubbles as readonly (ScenarioPreviewItem["bubbles"][number] | ImageEl)[];
    const images = all.filter((element) => element.type === "image");
    expect(images.map((element) => element.src)).toEqual([BACKGROUND_IMAGE, FOREGROUND_IMAGE]);
    for (const image of images) {
      expect(image).toMatchObject({ ...committed.frame, rotation: 0, lockAspect: true });
      expect(image).not.toHaveProperty("id");
    }
    expect(committed.frame.y).toBeGreaterThanOrEqual(910);
    expect(committed.imageDataUrl).toBe(TRANSPARENT_PNG_1PX);
    expect(all.map((element) => element.type)).toEqual(["image", "image", "bubble"]);
    expect(all.find((element) => element.type === "bubble")?.text).toContain("약속을 잊지 말아요.");
    fireEvent.click(apply);
    expect(applied).toHaveBeenCalledOnce();
  });

  it.each(["empty", "different-candidate"])("분리 이미지가 %s이면 원래 선택한 이미지를 유지한다", async (kind) => {
    const scene = layeredScenario();
    if (!scene.layerManifest) throw new Error("시험 장면에 레이어가 없습니다.");
    const item = {
      ...scene,
      layerManifest: kind === "empty" ? { ...scene.layerManifest, layers: [] } : {
        ...scene.layerManifest, sourceCandidateId: "different-source",
      },
    };
    const applied = vi.fn<(scenario: ScenarioPreviewItem) => void>();
    render(<LayerApplyHarness item={item} applied={applied} />);
    fireEvent.click(screen.getByRole("button", { name: /마감·추가/u }));
    fireEvent.click(screen.getByRole("button", { name: "현재 페이지에 적용" }));
    await waitFor(() => expect(applied).toHaveBeenCalledOnce());

    const committed = applied.mock.calls[0]?.[0];
    expect(committed?.imageDataUrl).toBe(FLAT_IMAGE);
    expect(committed?.bubbles.map((element) => element.type)).toEqual(["bubble"]);
  });
});

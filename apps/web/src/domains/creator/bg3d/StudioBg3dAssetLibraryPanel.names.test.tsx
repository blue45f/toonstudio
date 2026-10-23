// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dAssetLibraryPanel } from "./StudioBg3dAssetLibraryPanel";
import { buildStudioBg3dAssetRightsViews } from "./studio-bg3d-asset-rights-view";
import { buildStudioBg3dSkpAssetMetadata } from "./studio-bg3d-skp-asset-metadata";
import { createSkpReportFixture } from "./studio-bg3d-skp.test-fixture";

import type { Bg3dModelLibraryEntry } from "./bg3d-model-library";
import type { ComponentProps } from "react";

// 번들 환경 카탈로그는 정적 자산 매니페스트에 기대므로, 빈 카탈로그로 대체해 어느 체크아웃에서도 돌게 한다.
vi.mock("./studio-bg3d-environment-catalog", () => ({
  getStudioBg3dEnvironmentAsset: () => undefined,
  isStudioBg3dEnvironmentAssetId: () => false,
}));

type PanelProps = ComponentProps<typeof StudioBg3dAssetLibraryPanel>;
const hash = (digit: string) => `sha256:${digit.repeat(64)}` as const;

function entry(id: string, name: string, digit: string): Bg3dModelLibraryEntry {
  return {
    id,
    name,
    format: "glb",
    source: "sqlite-opfs",
    thumbnail: null,
    createdAt: 1,
    updatedAt: 2,
    status: "verified",
    canUse: true,
    statusMessage: "검증된 GLB 모델입니다.",
    contentHash: hash(digit),
    byteSize: 1_024,
    commercialUse: true,
  };
}

const list = (items: readonly string[]) => ({ available: true, items: [...items], total: items.length, truncated: false });

const LIBRARY: readonly Bg3dModelLibraryEntry[] = [
  entry("skp-room", "교실 세트", "a"),
  entry("skp-park", "공원 세트", "b"),
  entry("plain", "보통 모델", "c"),
];

function viewsWithNames() {
  const record = (digit: string, names: Parameters<typeof createSkpReportFixture>[0]) => {
    const built = buildStudioBg3dSkpAssetMetadata(
      {
        sourcePath: `${digit}.skp`,
        name: "세트",
        contentHash: hash(digit),
        byteSize: 1_024,
        triangles: 10,
        textures: 0,
        rights: { status: "owned", commercialUse: true },
      },
      createSkpReportFixture(names),
      1_000,
    );
    if (!built) throw new Error("메타데이터 기록을 만들지 못했습니다.");
    return built;
  };
  return buildStudioBg3dAssetRightsViews(LIBRARY, {
    metadataByHash: new Map([
      [hash("a"), record("a", { names: { components: list(["Chair", "책상"]), tags: list(["벽체"]), scenes: list(["정면 뷰"]) } })],
      [hash("b"), record("b", { names: { components: list(["Bench"]), tags: list(["잔디"]), scenes: list([]) } })],
    ]),
  });
}

function renderPanel() {
  const props: PanelProps = {
    entries: LIBRARY,
    libraryStatus: "ready",
    deletingModelId: null,
    isUploading: false,
    importProgress: null,
    isRestoringScene: false,
    deviceProfileLabel: "데스크톱",
    onFileChange: vi.fn(),
    onCancelImport: vi.fn(),
    onAdd: vi.fn(),
    onDelete: vi.fn(),
    rightsViews: viewsWithNames(),
  };
  return render(<StudioBg3dAssetLibraryPanel {...props} />);
}

const search = (value: string) =>
  fireEvent.change(screen.getByLabelText("3D 모델 라이브러리 검색"), { target: { value } });
const shown = () => screen.getByText(/^표시 \d+\/\d+개/u).textContent;

afterEach(() => cleanup());

describe("3D 모델 라이브러리의 원본 이름 검색", () => {
  it("검색칸이 컴포넌트·태그·장면 이름으로도 찾는다고 알린다", () => {
    renderPanel();
    expect(screen.getByLabelText("3D 모델 라이브러리 검색").getAttribute("placeholder")).toContain("컴포넌트·태그·장면 이름");
  });

  it("컴포넌트 이름으로 소재를 찾고 왜 찾아졌는지 카드 아래에 알린다", () => {
    renderPanel();
    search("chair");
    expect(shown()).toBe("표시 1/1개 · 데스크톱 기준");
    expect(screen.getByText("원본 이름 일치: Chair")).toBeTruthy();
    expect(screen.getByRole("button", { name: "교실 세트 장면에 추가" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "공원 세트 장면에 추가" })).toBeNull();
  });

  it("태그 이름과 장면 이름으로도 찾는다", () => {
    renderPanel();
    search("잔디");
    expect(screen.getByRole("button", { name: "공원 세트 장면에 추가" })).toBeTruthy();
    expect(screen.getByText("원본 이름 일치: 잔디")).toBeTruthy();
    search("정면");
    expect(screen.getByRole("button", { name: "교실 세트 장면에 추가" })).toBeTruthy();
    expect(screen.getByText("원본 이름 일치: 정면 뷰")).toBeTruthy();
  });

  it("소재 이름이 이미 맞으면 원본 이름 안내를 따로 붙이지 않는다", () => {
    renderPanel();
    search("교실");
    expect(shown()).toBe("표시 1/1개 · 데스크톱 기준");
    expect(screen.queryByText(/원본 이름 일치/)).toBeNull();
  });

  it("이름 기록이 없는 소재는 이름 검색에 걸리지 않고 검색어가 비면 안내가 사라진다", () => {
    renderPanel();
    search("벽체");
    expect(screen.queryByRole("button", { name: "보통 모델 장면에 추가" })).toBeNull();
    search("");
    expect(screen.queryByText(/원본 이름 일치/)).toBeNull();
    expect(shown()).toBe("표시 3/3개 · 데스크톱 기준");
  });

  it("파일 안의 글자는 마크업이 아니라 글자로만 보인다", () => {
    const base = buildStudioBg3dSkpAssetMetadata(
      {
        sourcePath: "x.skp",
        name: "세트",
        contentHash: hash("a"),
        byteSize: 1_024,
        triangles: 10,
        textures: 0,
        rights: { status: "owned", commercialUse: true },
      },
      createSkpReportFixture({ names: { components: list(["a"]), tags: list([]), scenes: list([]) } }),
      1_000,
    );
    if (!base?.skpImport) throw new Error("메타데이터 기록을 만들지 못했습니다.");
    // 저장소 규칙을 우회해 마크업이 들어온 기록을 흉내 낸다 — 화면은 그래도 글자로만 그려야 한다.
    const tampered = {
      ...base,
      skpImport: { ...base.skpImport, names: { ...base.skpImport.names, components: list(["<img src=x onerror=alert(1)>"]) } },
    };
    const views = buildStudioBg3dAssetRightsViews(LIBRARY, { metadataByHash: new Map([[hash("a"), tampered]]) });
    const { container } = render(
      <StudioBg3dAssetLibraryPanel
        entries={LIBRARY}
        libraryStatus="ready"
        deletingModelId={null}
        isUploading={false}
        importProgress={null}
        isRestoringScene={false}
        deviceProfileLabel="데스크톱"
        onFileChange={vi.fn()}
        onCancelImport={vi.fn()}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        rightsViews={views}
      />,
    );
    search("onerror");
    expect(screen.getByText("원본 이름 일치: <img src=x onerror=alert(1)>")).toBeTruthy();
    expect(container.querySelector("img[src=x]")).toBeNull();
  });
});

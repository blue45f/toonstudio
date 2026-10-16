// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dAssetLibraryPanel } from "./StudioBg3dAssetLibraryPanel";
import {
  STUDIO_BG3D_ASSET_METADATA_VERSION,
  normalizeStudioBg3dAssetMetadata,
  type StudioBg3dAssetMetadata,
} from "./studio-bg3d-asset-metadata";
import { buildStudioBg3dAssetRightsViews } from "./studio-bg3d-asset-rights-view";

import type { Bg3dModelLibraryEntry } from "./bg3d-model-library";
import type { StudioBg3dAttachmentRights } from "./studio-bg3d-scene-document-types";
import type { ComponentProps } from "react";

// 번들 환경 카탈로그는 정적 자산 매니페스트에 기대므로, 같은 모양의 가짜로 대체해 어느 체크아웃에서도 돌게 한다.
vi.mock("./studio-bg3d-environment-catalog", () => {
  const provenance = (patch: Record<string, unknown>) => ({
    origin: "original-procedural",
    author: "ToonStudio",
    license: "CC0-1.0",
    commercialUse: true,
    attributionRequired: false,
    ...patch,
  });
  const assets: Record<string, { id: string; description: string; tags: string[]; provenance: unknown }> = {
    "ts-bg3d-fake-cc0": { id: "ts-bg3d-fake-cc0", description: "공개 이용 환경", tags: [], provenance: provenance({}) },
    "ts-bg3d-fake-ai": {
      id: "ts-bg3d-fake-ai",
      description: "AI 생성 환경",
      tags: [],
      provenance: provenance({
        origin: "ai-generated-free-wallet",
        license: "Tripo Terms of Service - Free User Output",
        provider: "Tripo",
      }),
    },
  };
  return {
    getStudioBg3dEnvironmentAsset: (id: string) => assets[id],
    isStudioBg3dEnvironmentAssetId: (id: string) => id in assets,
  };
});

type PanelProps = ComponentProps<typeof StudioBg3dAssetLibraryPanel>;
const hash = (digit: string) => `sha256:${digit.repeat(64)}` as const;

function entry(id: string, name: string, digit: string, patch: Partial<Bg3dModelLibraryEntry> = {}): Bg3dModelLibraryEntry {
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
    commercialUse: false,
    ...patch,
  };
}

function metadata(digit: string, rights: unknown): StudioBg3dAssetMetadata {
  const value = normalizeStudioBg3dAssetMetadata({
    version: STUDIO_BG3D_ASSET_METADATA_VERSION,
    contentHash: hash(digit),
    name: "기록",
    format: "glb",
    createdAt: 1,
    updatedAt: 1,
    byteSize: 1_024,
    triangles: null,
    textures: null,
    favorite: false,
    collections: [],
    tags: [],
    rights,
  });
  if (!value) throw new Error("invalid fixture");
  return value;
}

const BOUGHT: StudioBg3dAttachmentRights = {
  status: "licensed",
  commercialUse: true,
  attributionRequired: true,
  attribution: "모델 제작자 · 표준",
  licenseName: "ACON3D 구매 라이선스",
};
const OWNED: StudioBg3dAttachmentRights = { status: "owned", commercialUse: true, attributionRequired: false };
const UNKNOWN: StudioBg3dAttachmentRights = { status: "unknown", commercialUse: false, attributionRequired: false };

const ENTRIES: readonly Bg3dModelLibraryEntry[] = [
  entry("env-cc0", "공개 환경", "a", { source: "sample", commercialUse: true }),
  entry("env-ai", "AI 환경", "b", { source: "sample", commercialUse: true }),
  entry("bought", "구매한 의자", "c", { commercialUse: true }),
  entry("owned", "내가 만든 책상", "d", { commercialUse: true }),
  entry("mystery", "출처 모를 소품", "e"),
  entry("legacy", "옛 가져오기", "0", { contentHash: null, byteSize: null, status: "legacy-reimport-required", canUse: false }),
];
// 번들 소재의 id 는 모의 카탈로그와 맞춘다.
const ENTRY_IDS: Readonly<Record<string, string>> = { "env-cc0": "ts-bg3d-fake-cc0", "env-ai": "ts-bg3d-fake-ai" };
const LIBRARY: readonly Bg3dModelLibraryEntry[] = ENTRIES.map((item) => ({ ...item, id: ENTRY_IDS[item.id] ?? item.id }));

function views(entries = LIBRARY) {
  return buildStudioBg3dAssetRightsViews(entries, {
    provenanceOf: (id) => (id === "ts-bg3d-fake-cc0"
      ? { origin: "original-procedural", license: "CC0-1.0", commercialUse: true, attributionRequired: false, author: "ToonStudio" }
      : id === "ts-bg3d-fake-ai"
        ? { origin: "ai-generated-free-wallet", license: "Tripo Terms of Service - Free User Output", commercialUse: true, attributionRequired: false, provider: "Tripo" }
        : undefined),
    libraryRightsById: new Map([["bought", BOUGHT], ["owned", OWNED], ["mystery", UNKNOWN]]),
    metadataByHash: new Map([
      [hash("d"), metadata("d", { status: "owned", commercialUse: true, teamShareAllowed: false, aiGenerated: "no", aiTraining: "prohibited" })],
      [hash("c"), metadata("c", { status: "licensed", commercialUse: true, teamShareAllowed: false, license: "ACON3D 구매 라이선스", provider: "ACON 3D", purchaseOrDownloadDate: "2026-07-22" })],
    ]),
  });
}

function renderPanel(overrides: Partial<PanelProps> = {}) {
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
    rightsViews: views(),
    ...overrides,
  };
  return { props, ...render(<StudioBg3dAssetLibraryPanel {...props} />) };
}

const shown = () => screen.getByText(/^표시 \d+\/\d+개/u).textContent;
const chip = (group: string, label: string) =>
  within(screen.getByRole("group", { name: group })).getByRole("button", { name: new RegExp(`^${group}: ${label},`, "u") });
const openFilters = () => fireEvent.click(screen.getByText("권리 필터"));

afterEach(() => cleanup());

describe("카드의 한 줄 권리 요약", () => {
  it("라이선스·상업 사용·표기 의무·AI 표기를 한 줄로 보이고, 모르는 칸은 '미확인'으로 쓴다", () => {
    renderPanel();
    expect(screen.getByText("구매·허가 · 상업 가능 · 표기 필요 · AI 미확인")).toBeTruthy();
    // 표기가 필요하거나 모르는 경우만 요약에 적는다. '표기 불필요'는 상세에서 확인한다.
    expect(screen.getByText("직접 제작 · 상업 가능 · AI 아님")).toBeTruthy();
    expect(screen.getByText("공개 이용 · 상업 가능 · AI 아님")).toBeTruthy();
    expect(screen.getByText("구매·허가 · 상업 가능 · AI 생성")).toBeTruthy();
    // 권리를 모르는 소재(기록이 미확인이거나 해시가 없는 옛 항목)는 허용처럼 쓰지 않는다.
    expect(screen.getAllByText("권리 미확인 · AI 미확인")).toHaveLength(2);
  });

  it("권리를 모르는 소재의 요약은 허용처럼 보이는 색이 아니라 확인이 필요한 강조색이다", () => {
    renderPanel();
    for (const unknown of screen.getAllByText("권리 미확인 · AI 미확인")) {
      expect(unknown.className).toContain("text-accent");
      expect(unknown.className).not.toContain("text-good");
      expect(unknown.textContent).not.toMatch(/가능|허용/u);
    }
  });

  it("권리 보기를 넘기지 않아도 목록 항목만으로 계산해 가져온 소재를 모두 미확인으로 보인다", () => {
    renderPanel({ rightsViews: undefined });
    expect(screen.getAllByText("권리 미확인 · AI 미확인").length).toBeGreaterThanOrEqual(4);
    // 번들 소재는 카탈로그 출처 기록으로 읽는다.
    expect(screen.getByText("공개 이용 · 상업 가능 · AI 아님")).toBeTruthy();
  });

  it("카드를 누르는 기존 동작은 그대로이고 요약은 접근 가능한 설명에 포함된다", () => {
    const { props } = renderPanel();
    const add = screen.getByRole("button", { name: "구매한 의자 장면에 추가" });
    expect(add.getAttribute("aria-describedby")).toContain("bg3d-model-rights-summary-bought");
    expect(document.getElementById("bg3d-model-rights-summary-bought")?.textContent).toContain("구매·허가");
    fireEvent.click(add);
    expect(props.onAdd).toHaveBeenCalledWith("bought");
  });

  it("카탈로그 라이선스가 CC0 가 아닌 번들 환경에는 CC0 라고 쓰지 않는다", () => {
    renderPanel();
    expect(screen.getByText("환경 · CC0")).toBeTruthy();
    expect(screen.getByText("환경 · 제공자 약관")).toBeTruthy();
  });
});

describe("권리 상세 펼치기", () => {
  it("버튼이 열림 상태를 노출하고 출처·라이선스·표기 의무·상업 사용·AI 표기를 보인다", () => {
    renderPanel();
    const toggle = screen.getByRole("button", { name: "구매한 의자 권리 상세" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "구매한 의자 권리 상세" })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const region = screen.getByRole("region", { name: "구매한 의자 권리 상세" });
    expect(toggle.getAttribute("aria-controls")).toBe(region.id);
    const text = region.textContent ?? "";
    for (const expected of ["출처", "내가 가져온 파일", "ACON 3D", "라이선스", "구매·허가", "ACON3D 구매 라이선스", "표기 의무", "표기 필요", "모델 제작자 · 표준", "상업 사용", "가능", "AI 생성 여부", "AI 학습 이용", "2026-07-22"]) {
      expect(text).toContain(expected);
    }
    // 기록되지 않은 칸은 '미확인'이라고 쓴다.
    expect(within(region).getAllByText("미확인").length).toBeGreaterThanOrEqual(2);
    // 법률 자문이 아니라는 고지가 함께 보인다.
    expect(text).toContain("법률 자문이나 권리 인증이 아니에요");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "구매한 의자 권리 상세" })).toBeNull();
  });

  it("권리를 모르는 소재의 상세는 라이선스·표기 의무·상업 사용을 모두 미확인으로 쓴다", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "출처 모를 소품 권리 상세" }));
    const region = screen.getByRole("region", { name: "출처 모를 소품 권리 상세" });
    const rows = within(region);
    for (const label of ["라이선스", "표기 의무", "상업 사용", "AI 생성 여부", "AI 학습 이용"]) {
      const term = rows.getByText(label);
      expect(term.nextElementSibling?.textContent).toBe("미확인");
    }
  });

  it("권리 기록을 읽지 못한 가져온 소재에는 그 사실을 알린다", () => {
    renderPanel({ rightsViews: undefined });
    fireEvent.click(screen.getByRole("button", { name: "구매한 의자 권리 상세" }));
    expect(screen.getByRole("region", { name: "구매한 의자 권리 상세" }).textContent).toContain("권리 기록을 읽지 못해");
  });

  it("여는 버튼에서 Esc 를 누르면 접고 포커스는 그 버튼에 남는다", () => {
    renderPanel();
    const toggle = screen.getByRole("button", { name: "구매한 의자 권리 상세" });
    toggle.focus();
    fireEvent.click(toggle);
    expect(screen.getByRole("region", { name: "구매한 의자 권리 상세" })).toBeTruthy();
    fireEvent.keyDown(toggle, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "구매한 의자 권리 상세" })).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    // 닫혀 있을 때의 Esc 는 아무 일도 하지 않는다.
    fireEvent.keyDown(toggle, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("라이선스 이름처럼 사용자가 입력한 값은 고정 문구와 별개 노드로 그린다", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "구매한 의자 권리 상세" }));
    const licenseName = screen.getByText("ACON3D 구매 라이선스");
    expect(licenseName.tagName).toBe("SPAN");
    expect(licenseName.parentElement?.tagName).toBe("DD");
  });
});

describe("권리 필터 칩", () => {
  it("그룹 이름과 칩 이름·개수·선택 상태를 접근성 트리에 노출한다", () => {
    renderPanel();
    openFilters();
    for (const group of ["라이선스 종류", "출처 종류", "상업 사용", "AI 생성 표기", "AI 학습 표기"]) {
      expect(screen.getByRole("group", { name: group })).toBeTruthy();
    }
    const bought = chip("라이선스 종류", "구매·허가");
    expect(bought.getAttribute("aria-label")).toBe("라이선스 종류: 구매·허가, 2개");
    expect(bought.getAttribute("aria-pressed")).toBe("false");
    expect(bought.getAttribute("aria-controls")).toBe("bg3d-model-library-results");
    expect(chip("라이선스 종류", "미확인").getAttribute("aria-label")).toBe("라이선스 종류: 미확인, 2개");
  });

  it("칩은 키보드로 닿는 버튼이고 44px 탭 대상 규칙을 지킨다", () => {
    renderPanel();
    openFilters();
    const chips = screen.getAllByRole("button").filter((button) => button.hasAttribute("aria-pressed") && /^(라이선스 종류|출처 종류|상업 사용|AI 생성 표기|AI 학습 표기):/u.test(button.getAttribute("aria-label") ?? ""));
    // 상업 사용에는 "불가" 칩이 없다(가능·미확인 둘뿐).
    expect(chips).toHaveLength(4 + 2 + 2 + 3 + 3);
    for (const target of chips) {
      expect(target.tagName).toBe("BUTTON");
      expect(target.getAttribute("type")).toBe("button");
      expect(target.tabIndex).toBeGreaterThanOrEqual(0);
      expect(target.className).toContain("min-h-11");
      expect(target.className).toContain("focus-visible:outline");
    }
    const first = chips[0];
    first.focus();
    expect(document.activeElement).toBe(first);
  });

  it("한 그룹 안에서는 OR, 그룹끼리는 AND 로 거르고 개수 표시도 따라간다", () => {
    renderPanel();
    openFilters();
    expect(shown()).toBe("표시 6/6개 · 데스크톱 기준");

    fireEvent.click(chip("라이선스 종류", "직접 제작"));
    expect(chip("라이선스 종류", "직접 제작").getAttribute("aria-pressed")).toBe("true");
    expect(shown()).toBe("표시 1/1개 · 데스크톱 기준");
    expect(screen.getByRole("button", { name: "내가 만든 책상 장면에 추가" })).toBeTruthy();

    fireEvent.click(chip("라이선스 종류", "구매·허가"));
    expect(shown()).toBe("표시 3/3개 · 데스크톱 기준");

    fireEvent.click(chip("AI 생성 표기", "AI 생성"));
    expect(shown()).toBe("표시 1/1개 · 데스크톱 기준");
    expect(screen.getByRole("button", { name: "AI 환경 장면에 추가" })).toBeTruthy();
  });

  it("출처 종류로 기본 제공과 내가 가져온 소재를 가른다", () => {
    renderPanel();
    openFilters();
    fireEvent.click(chip("출처 종류", "기본 제공"));
    expect(shown()).toBe("표시 2/2개 · 데스크톱 기준");
    fireEvent.click(chip("출처 종류", "기본 제공"));
    fireEvent.click(chip("출처 종류", "내가 가져옴"));
    expect(shown()).toBe("표시 4/4개 · 데스크톱 기준");
  });

  it("'미확인' 칩은 기록이 없거나 해시가 없는 옛 항목까지 함께 모으고, 확인된 값만 고르면 빠진다", () => {
    renderPanel();
    openFilters();
    fireEvent.click(chip("라이선스 종류", "미확인"));
    expect(shown()).toBe("표시 2/2개 · 데스크톱 기준");
    expect(screen.getByRole("button", { name: "출처 모를 소품 장면에 추가" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "옛 가져오기 장면에 추가" })).toBeTruthy();

    fireEvent.click(chip("라이선스 종류", "미확인"));
    for (const label of ["직접 제작", "구매·허가", "공개 이용"]) fireEvent.click(chip("라이선스 종류", label));
    expect(screen.queryByRole("button", { name: "옛 가져오기 장면에 추가" })).toBeNull();
  });

  it("필터를 모두 풀면 목록이 그대로 돌아오고, 필터가 비어 있을 땐 정보 없는 항목도 사라지지 않는다", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "옛 가져오기 장면에 추가" })).toBeTruthy();
    openFilters();
    fireEvent.click(chip("상업 사용", "가능"));
    expect(shown()).toBe("표시 4/4개 · 데스크톱 기준");
    fireEvent.click(screen.getByRole("button", { name: "권리 필터 해제" }));
    expect(shown()).toBe("표시 6/6개 · 데스크톱 기준");
    expect(screen.getByRole("button", { name: "옛 가져오기 장면에 추가" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "권리 필터 해제" })).toBeNull();
  });

  it("결과가 0건이면 안내와 필터 해제 동작을 보이고, 해제하면 목록이 돌아온다", () => {
    renderPanel();
    openFilters();
    fireEvent.click(chip("라이선스 종류", "직접 제작"));
    fireEvent.click(chip("AI 생성 표기", "AI 생성"));

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("검색·상태·종류 필터와 일치하는 3D 모델이 없습니다.");
    expect(status.textContent).toContain("권리 필터가 켜져 있습니다");
    expect(shown()).toBe("표시 0/0개 · 데스크톱 기준");

    fireEvent.click(within(status).getByRole("button", { name: "필터 모두 해제" }));
    expect(shown()).toBe("표시 6/6개 · 데스크톱 기준");
    expect(chip("라이선스 종류", "직접 제작").getAttribute("aria-pressed")).toBe("false");
    expect(chip("AI 생성 표기", "AI 생성").getAttribute("aria-pressed")).toBe("false");
  });

  it("'필터 모두 해제'는 검색어와 상태·종류 필터도 함께 푼다", () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("3D 모델 라이브러리 검색"), { target: { value: "없는 소재" } });
    const status = screen.getByRole("status");
    expect(status.textContent).not.toContain("권리 필터가 켜져 있습니다");
    fireEvent.click(within(status).getByRole("button", { name: "필터 모두 해제" }));
    expect((screen.getByLabelText("3D 모델 라이브러리 검색") as HTMLInputElement).value).toBe("");
    expect(shown()).toBe("표시 6/6개 · 데스크톱 기준");
  });

  it("검색은 라이선스 이름·제공처로도 소재를 찾는다", () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("3D 모델 라이브러리 검색"), { target: { value: "acon3d" } });
    expect(shown()).toBe("표시 1/1개 · 데스크톱 기준");
    fireEvent.change(screen.getByLabelText("3D 모델 라이브러리 검색"), { target: { value: "ACON 3D" } });
    expect(shown()).toBe("표시 1/1개 · 데스크톱 기준");
  });

  it("권리 기록을 읽는 중이거나 읽지 못했다면 알리되 목록은 그대로 쓸 수 있다", () => {
    const { rerender, props } = renderPanel({ rightsLoadState: "loading" });
    expect(screen.getByRole("status").textContent).toContain("권리 기록을 읽는 중");
    rerender(<StudioBg3dAssetLibraryPanel {...props} rightsLoadState="error" />);
    expect(screen.getByRole("status").textContent).toContain("권리 기록을 읽지 못했습니다");
    rerender(<StudioBg3dAssetLibraryPanel {...props} rightsLoadState="partial" />);
    expect(screen.getByRole("status").textContent).toContain("일부를 읽지 못했습니다");
    expect(shown()).toBe("표시 6/6개 · 데스크톱 기준");
    expect(screen.getByRole("button", { name: "구매한 의자 장면에 추가" })).toHaveProperty("disabled", false);
  });
});

describe("가져오기 권리 폼의 AI 사용 표기", () => {
  function chooseLicensed() {
    fireEvent.click(screen.getByText("이용 권리 기록"));
    fireEvent.click(screen.getByRole("radio", { name: /구매·허가/u }));
    fireEvent.change(screen.getByLabelText(/라이선스·구매처 이름/u), { target: { value: "ACON3D 구매 라이선스" } });
  }

  it("두 질문이 라디오로 노출되고 기본값은 '모름'이며 고르지 않으면 AI 필드를 보내지 않는다", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByText("이용 권리 기록"));
    const generated = screen.getByRole("group", { name: "AI로 생성한 소재인가요?" });
    const training = screen.getByRole("group", { name: "라이선스가 AI 학습 이용을 허용하나요?" });
    expect((within(generated).getByRole("radio", { name: "모름" }) as HTMLInputElement).checked).toBe(true);
    expect((within(training).getByRole("radio", { name: "모름" }) as HTMLInputElement).checked).toBe(true);
    expect(within(generated).getAllByRole("radio")).toHaveLength(3);

    chooseLicensed();
    fireEvent.change(screen.getByLabelText("3D 모델 및 연결 파일 선택"), {
      target: { files: [new File(["glb"], "a.glb", { type: "model/gltf-binary" })] },
    });
    const sent = vi.mocked(props.onFileChange).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(sent).toMatchObject({ status: "licensed", licenseName: "ACON3D 구매 라이선스" });
    expect("aiGenerated" in sent).toBe(false);
    expect("aiTraining" in sent).toBe(false);
  });

  it("고른 AI 표기를 가져오기에 실어 보낸다", () => {
    const { props } = renderPanel();
    chooseLicensed();
    fireEvent.click(screen.getByRole("radio", { name: "AI로 만듦" }));
    fireEvent.click(screen.getByRole("radio", { name: "금지" }));
    expect((screen.getByRole("radio", { name: "AI로 만듦" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "AI 아님" }) as HTMLInputElement).checked).toBe(false);

    fireEvent.change(screen.getByLabelText("3D 모델 및 연결 파일 선택"), {
      target: { files: [new File(["glb"], "a.glb", { type: "model/gltf-binary" })] },
    });
    expect(props.onFileChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "licensed", aiGenerated: "yes", aiTraining: "prohibited" }),
    );
  });

  it("라디오는 44px 탭 대상 규칙을 지킨다", () => {
    renderPanel();
    fireEvent.click(screen.getByText("이용 권리 기록"));
    const label = screen.getByRole("radio", { name: "AI로 만듦" }).parentElement;
    expect(label?.querySelector("span")?.className).toContain("min-h-11");
  });
});

describe("원클릭 배치 레시피", () => {
  it("배치 핸들러가 없으면 배치 방식 버튼을 내놓지 않는다", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: /배치 방식/u })).toBeNull();
  });

  it("버튼이 열림 상태를 노출하고 일반 모델에는 네 가지 방식을 보인다", () => {
    renderPanel({ onPlaceWithRecipe: vi.fn() });
    const toggle = screen.getByRole("button", { name: "구매한 의자 배치 방식" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.className).toContain("min-h-11");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("group", { name: "배치 방식" });
    expect(toggle.getAttribute("aria-controls")).toBe(menu.id);
    expect(within(menu).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "구매한 의자 바닥에 놓기",
      "구매한 의자 벽에 붙이기",
      "구매한 의자 사람 키에 맞춤",
      "구매한 의자 장면 중앙",
    ]);
    for (const button of within(menu).getAllByRole("button")) expect(button.className).toContain("min-h-11");
  });

  it("번들 환경에는 크기를 바꾸거나 벽에 붙이는 방식을 보이지 않는다", () => {
    renderPanel({ onPlaceWithRecipe: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "공개 환경 배치 방식" }));
    expect(within(screen.getByRole("group", { name: "배치 방식" })).getAllByRole("button").map((button) => button.getAttribute("aria-label")))
      .toEqual(["공개 환경 바닥에 놓기", "공개 환경 장면 중앙"]);
  });

  it("방식을 고르면 소재와 방식을 넘기고 메뉴를 닫으며, 포인터 배치(장면에 추가)는 부르지 않는다", () => {
    const onPlaceWithRecipe = vi.fn();
    const { props } = renderPanel({ onPlaceWithRecipe });
    const toggle = screen.getByRole("button", { name: "구매한 의자 배치 방식" });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "구매한 의자 벽에 붙이기" }));

    expect(onPlaceWithRecipe).toHaveBeenCalledOnce();
    expect(onPlaceWithRecipe).toHaveBeenCalledWith("bought", "wall");
    expect(props.onAdd).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "배치 방식" })).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it("메뉴 안에서 Esc 를 누르면 메뉴를 닫고 포커스를 토글로 돌려보내며 배치하지 않는다", () => {
    const onPlaceWithRecipe = vi.fn();
    renderPanel({ onPlaceWithRecipe });
    const toggle = screen.getByRole("button", { name: "구매한 의자 배치 방식" });
    fireEvent.click(toggle);
    const first = screen.getByRole("button", { name: "구매한 의자 바닥에 놓기" });
    first.focus();
    fireEvent.keyDown(first, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "배치 방식" })).toBeNull();
    expect(document.activeElement).toBe(toggle);
    expect(onPlaceWithRecipe).not.toHaveBeenCalled();

    fireEvent.click(toggle);
    fireEvent.keyDown(toggle, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "배치 방식" })).toBeNull();
    expect(onPlaceWithRecipe).not.toHaveBeenCalled();
  });

  it("가져오기·복원 같은 다른 작업 중이거나 쓸 수 없는 소재에서는 배치 방식을 막는다", () => {
    const onPlaceWithRecipe = vi.fn();
    const { rerender, props } = renderPanel({ onPlaceWithRecipe });
    expect(screen.getByRole("button", { name: "옛 가져오기 배치 방식" })).toHaveProperty("disabled", true);
    rerender(<StudioBg3dAssetLibraryPanel {...props} onPlaceWithRecipe={onPlaceWithRecipe} isUploading />);
    expect(screen.getByRole("button", { name: "구매한 의자 배치 방식" })).toHaveProperty("disabled", true);
    rerender(<StudioBg3dAssetLibraryPanel {...props} onPlaceWithRecipe={onPlaceWithRecipe} isRestoringScene />);
    expect(screen.getByRole("button", { name: "구매한 의자 배치 방식" })).toHaveProperty("disabled", true);
    // 읽기 전용인 권리 상세는 막지 않는다.
    expect(screen.getByRole("button", { name: "구매한 의자 권리 상세" })).toHaveProperty("disabled", false);
  });

  it("한 번에 한 카드의 한 영역만 펼치고 펼친 카드는 두 칸을 쓴다", () => {
    renderPanel({ onPlaceWithRecipe: vi.fn() });
    const rights = screen.getByRole("button", { name: "구매한 의자 권리 상세" });
    const recipes = screen.getByRole("button", { name: "구매한 의자 배치 방식" });
    fireEvent.click(rights);
    expect(rights.closest("div.relative")?.className).toContain("col-span-2");
    fireEvent.click(recipes);
    expect(rights.getAttribute("aria-expanded")).toBe("false");
    expect(recipes.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "내가 만든 책상 권리 상세" }));
    expect(recipes.getAttribute("aria-expanded")).toBe("false");
    expect(rights.closest("div.relative")?.className).not.toContain("col-span-2");
  });
});

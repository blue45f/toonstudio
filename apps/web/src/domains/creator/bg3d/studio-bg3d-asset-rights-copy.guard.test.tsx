// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hasErrorActionGuidance, isFailureCopy, violatesErrorPattern } from "@/shared/language/error-pattern";
import { findToneViolations, hasMixedTone, registersInFlow } from "@/shared/language/tone-policy";

import { StudioBg3dAssetAiUseFields } from "./StudioBg3dAssetAiUseFields";
import { StudioBg3dAssetLibraryPanel } from "./StudioBg3dAssetLibraryPanel";
import { StudioBg3dAssetRecipeMenu } from "./StudioBg3dAssetRecipeMenu";
import { StudioBg3dAssetRightsFilterBar } from "./StudioBg3dAssetRightsFilterBar";
import { StudioBg3dAssetRightsDetails } from "./StudioBg3dAssetRightsInfo";
import {
  STUDIO_BG3D_ASSET_PLACEMENT_MENU_FOOTER,
  listStudioBg3dAssetPlacementRecipes,
} from "./studio-bg3d-asset-placement-catalog";
import {
  STUDIO_BG3D_ASSET_RIGHTS_CONFLICT_NOTICE,
  STUDIO_BG3D_ASSET_RIGHTS_DISCLAIMER,
  STUDIO_BG3D_ASSET_RIGHTS_EMPTY_RESULT_HINT,
  STUDIO_BG3D_ASSET_RIGHTS_FILTER_GROUPS,
  STUDIO_BG3D_ASSET_RIGHTS_FILTER_HELP,
  STUDIO_BG3D_ASSET_RIGHTS_LOAD_NOTICES,
  STUDIO_BG3D_ASSET_RIGHTS_PROJECT_SUMMARY_NOTICE,
  STUDIO_BG3D_ASSET_RIGHTS_UNREADABLE_NOTICE,
  STUDIO_BG3D_IMPORT_AI_FORM_HELP,
  STUDIO_BG3D_IMPORT_AI_FORM_SCOPE_NOTICE,
  describeStudioBg3dAssetRightsRows,
  describeStudioBg3dAssetRightsSummary,
  describeStudioBg3dImportAiHeader,
} from "./studio-bg3d-asset-rights-copy";
import {
  buildStudioBg3dAssetRightsView,
  countStudioBg3dAssetRightsValues,
  type StudioBg3dAssetRightsView,
} from "./studio-bg3d-asset-rights-view";
import {
  STUDIO_BG3D_ASSET_METADATA_VERSION,
  normalizeStudioBg3dAssetMetadata,
} from "./studio-bg3d-asset-metadata";

import type { Bg3dModelLibraryEntry } from "./bg3d-model-library";

// 패널 안의 문단을 읽으려고 패널을 그리므로, 번들 환경 카탈로그(정적 자산 매니페스트)는 문구와 무관하게 비워 둔다.
vi.mock("./studio-bg3d-environment-catalog", () => ({
  getStudioBg3dEnvironmentAsset: () => undefined,
  isStudioBg3dEnvironmentAssetId: () => false,
}));

afterEach(cleanup);

// shared/language 의 두 가드(tone-policy 의 해요체 통일, error-pattern 의 "원인 + 다음 행동")는 사전(JSON)만 훑는다. 컴포넌트와
// 모듈에 직접 적은 문구는 지나치므로, 권리 브라우저가 새로 만든 문구와 화면에 실제로 그려진 문단을 여기서 직접 검사한다.

const HASH = `sha256:${"a".repeat(64)}` as const;
const ENTRY = {
  id: "chair",
  name: "의자",
  format: "glb" as const,
  source: "sqlite-opfs" as const,
  createdAt: 1,
  updatedAt: 2,
  contentHash: HASH,
  byteSize: 1_024,
};
const LICENSED = { status: "licensed", commercialUse: true, attributionRequired: true, attribution: "제작자 · 표준", licenseName: "표준" } as const;

function unknownRecord() {
  const value = normalizeStudioBg3dAssetMetadata({
    version: STUDIO_BG3D_ASSET_METADATA_VERSION,
    contentHash: HASH,
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
    rights: { status: "unknown" },
  });
  if (!value) throw new Error("invalid fixture");
  return value;
}

const VIEWS: Readonly<Record<string, StudioBg3dAssetRightsView>> = {
  known: buildStudioBg3dAssetRightsView(ENTRY, { libraryRightsById: new Map([["chair", LICENSED]]) }),
  unreadable: buildStudioBg3dAssetRightsView(ENTRY),
  conflict: buildStudioBg3dAssetRightsView(ENTRY, {
    libraryRightsById: new Map([["chair", LICENSED]]),
    metadataByHash: new Map([[HASH, unknownRecord()]]),
  }),
};

const CONSTANT_COPY: ReadonlyArray<readonly [string, string]> = [
  ["면책", STUDIO_BG3D_ASSET_RIGHTS_DISCLAIMER],
  ["프로젝트 권리 요약 안내", STUDIO_BG3D_ASSET_RIGHTS_PROJECT_SUMMARY_NOTICE],
  ["권리 기록 읽기 실패", STUDIO_BG3D_ASSET_RIGHTS_UNREADABLE_NOTICE],
  ["기록 충돌", STUDIO_BG3D_ASSET_RIGHTS_CONFLICT_NOTICE],
  ["필터 머리말", STUDIO_BG3D_ASSET_RIGHTS_FILTER_HELP],
  ["빈 결과 설명", STUDIO_BG3D_ASSET_RIGHTS_EMPTY_RESULT_HINT],
  ["가져오기 AI 폼 안내", STUDIO_BG3D_IMPORT_AI_FORM_HELP],
  ["가져오기 AI 폼 범위 안내", STUDIO_BG3D_IMPORT_AI_FORM_SCOPE_NOTICE],
  ["배치 방식 목록 안내", STUDIO_BG3D_ASSET_PLACEMENT_MENU_FOOTER],
  ...Object.entries(STUDIO_BG3D_ASSET_RIGHTS_LOAD_NOTICES).map(([name, text]): readonly [string, string] => [`권리 기록 읽기 ${name}`, text]),
];

function assertPolite(name: string, text: string) {
  expect(text.length, name).toBeGreaterThan(5);
  expect(findToneViolations(text, "polite"), `${name}: 합니다체 문장`).toEqual([]);
  const registers = registersInFlow([text]);
  expect(registers.has("formal"), name).toBe(false);
  expect(registers.size, name).toBeLessThanOrEqual(1);
  expect(violatesErrorPattern(text), `${name}: 실패 문구에 다음 행동이 없음`).toBe(false);
}

const paragraphsOf = (root: ParentNode) => [...root.querySelectorAll("p")].map((node) => node.textContent ?? "").filter(Boolean);

describe("권리 브라우저 새 문구의 말투·오류 문형 가드", () => {
  it.each(CONSTANT_COPY)("%s: 해요체 한 가지로만 쓰고 실패 문구면 다음 행동이 있다", (name, text) => {
    assertPolite(name, text);
  });

  it("실패를 알리는 문구는 모두 실패 계열로 읽히고 다음 행동을 담는다(빈 검사가 아니다)", () => {
    const failures = CONSTANT_COPY.filter(([, text]) => isFailureCopy(text));
    expect(failures.map(([name]) => name)).toEqual(expect.arrayContaining(["권리 기록 읽기 실패", "권리 기록 읽기 partial", "권리 기록 읽기 error"]));
    for (const [name, text] of failures) expect(hasErrorActionGuidance(text), name).toBe(true);
    for (const [name, text] of CONSTANT_COPY) expect(registersInFlow([text]).has("polite"), name).toBe(true);
  });

  it("카드 요약·상세 줄·머리글·필터 이름은 해요체를 어기지 않는 명사구다", () => {
    const labels: string[] = [];
    for (const view of Object.values(VIEWS)) {
      labels.push(describeStudioBg3dAssetRightsSummary(view));
      for (const row of describeStudioBg3dAssetRightsRows(view)) labels.push(row.label, row.value);
    }
    for (const choice of ["yes", "no", "unknown"] as const) labels.push(describeStudioBg3dImportAiHeader(choice));
    for (const group of STUDIO_BG3D_ASSET_RIGHTS_FILTER_GROUPS) labels.push(group.label, ...group.options.map((option) => option.label));
    for (const label of labels) {
      expect(findToneViolations(label, "polite"), label).toEqual([]);
      expect(violatesErrorPattern(label), label).toBe(false);
    }
  });

  it("화면에 그려진 문단도 해요체이고, 한 컴포넌트 안에서 말투가 섞이지 않는다", () => {
    const flows: Array<readonly [string, string[]]> = [];

    for (const state of ["loading", "partial", "error"] as const) {
      const { container, unmount } = render(
        <StudioBg3dAssetRightsFilterBar
          filter={{}}
          counts={countStudioBg3dAssetRightsValues([ENTRY], new Map())}
          loadState={state}
          controlsId="results"
          onToggle={() => undefined}
          onClear={() => undefined}
        />,
      );
      flows.push([`필터 막대(${state})`, paragraphsOf(container)]);
      unmount();
    }

    for (const [name, view] of Object.entries(VIEWS)) {
      const { container, unmount } = render(<StudioBg3dAssetRightsDetails view={view} id={`d-${name}`} labelledBy="toggle" />);
      flows.push([`권리 상세(${name})`, paragraphsOf(container)]);
      unmount();
    }

    const ai = render(
      <StudioBg3dAssetAiUseFields aiGenerated="unknown" aiTraining="unknown" onAiGeneratedChange={() => undefined} onAiTrainingChange={() => undefined} />,
    );
    flows.push(["AI 사용 표기 폼", paragraphsOf(ai.container)]);
    ai.unmount();

    const menu = render(
      <StudioBg3dAssetRecipeMenu
        id="menu"
        entryName="의자"
        recipes={listStudioBg3dAssetPlacementRecipes(false)}
        disabled={false}
        onSelect={() => undefined}
        onEscape={() => undefined}
      />,
    );
    flows.push(["배치 방식 목록", [...menu.container.querySelectorAll("p, button span")].map((node) => node.textContent ?? "")]);
    menu.unmount();

    const entries: Bg3dModelLibraryEntry[] = [{
      ...ENTRY,
      thumbnail: null,
      status: "verified",
      canUse: true,
      statusMessage: "검증된 GLB 모델입니다.",
      commercialUse: true,
    }];
    render(
      <StudioBg3dAssetLibraryPanel
        entries={entries}
        libraryStatus="ready"
        deletingModelId={null}
        isUploading={false}
        importProgress={null}
        isRestoringScene={false}
        deviceProfileLabel="데스크톱"
        onFileChange={() => undefined}
        onCancelImport={() => undefined}
        onAdd={() => undefined}
        onDelete={() => undefined}
      />,
    );
    fireEvent.click(screen.getByText("권리 필터"));
    fireEvent.click(screen.getByRole("button", { name: /^직접 제작,/u }));
    const empty = screen.getByRole("status");
    flows.push(["빈 결과 안내", [empty.textContent?.replace("필터 모두 해제", "") ?? ""]]);
    flows.push(["가져오기 머리글", [screen.getByText(/AI 표기:/u).textContent ?? ""]]);

    // 가드가 실제로 문단을 읽었는지부터 확인한다.
    const all = flows.flatMap(([, texts]) => texts);
    expect(all.length).toBeGreaterThanOrEqual(20);
    expect(flows.find(([name]) => name === "빈 결과 안내")?.[1][0]).toContain(STUDIO_BG3D_ASSET_RIGHTS_EMPTY_RESULT_HINT);
    expect(flows.find(([name]) => name === "권리 상세(conflict)")?.[1].join(" ")).toContain(STUDIO_BG3D_ASSET_RIGHTS_CONFLICT_NOTICE);
    expect(flows.find(([name]) => name === "권리 상세(unreadable)")?.[1].join(" ")).toContain(STUDIO_BG3D_ASSET_RIGHTS_UNREADABLE_NOTICE);

    for (const [name, texts] of flows) {
      for (const text of texts) {
        expect(findToneViolations(text, "polite"), `${name}: ${text}`).toEqual([]);
        expect(violatesErrorPattern(text), `${name}: ${text}`).toBe(false);
      }
      expect(hasMixedTone(texts), `${name}: 한 흐름 안에서 해요체와 합니다체가 섞임`).toBe(false);
    }
  });

  it("대조군: 예전 문구(합니다체, 다음 행동 없는 실패)는 두 가드가 실제로 잡는다", () => {
    const oldNotice = "저장된 권리 기록을 읽지 못했습니다. 가져온 소재는 모두 '미확인'으로 표시하며, 목록은 그대로 쓸 수 있습니다.";
    expect(findToneViolations(oldNotice, "polite").length).toBeGreaterThanOrEqual(1);
    expect(violatesErrorPattern("저장된 권리 기록을 읽지 못했어요.")).toBe(true);
    expect(hasMixedTone([oldNotice, STUDIO_BG3D_ASSET_RIGHTS_FILTER_HELP])).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { buildStudioBg3dAssetRightsView } from "./studio-bg3d-asset-rights-view";
import { buildStudioBg3dSkpAssetMetadata, type StudioBg3dSkpImportedAsset } from "./studio-bg3d-skp-asset-metadata";
import { createSkpReportFixture } from "./studio-bg3d-skp.test-fixture";

import type { Bg3dModelLibraryEntry } from "./bg3d-model-library";
import type { StudioBg3dAssetMetadata } from "./studio-bg3d-asset-metadata";
import type { StudioBg3dSkpImportReport } from "./studio-bg3d-skp-import-report";

const HASH = `sha256:${"e".repeat(64)}` as const;

function entry(patch: Partial<Bg3dModelLibraryEntry> = {}): Bg3dModelLibraryEntry {
  return {
    id: "stored-skp",
    name: "교실 세트",
    format: "glb",
    source: "sqlite-opfs",
    thumbnail: null,
    createdAt: 1,
    updatedAt: 2,
    status: "verified",
    canUse: true,
    statusMessage: "검증된 GLB 모델입니다.",
    contentHash: HASH,
    byteSize: 4_096,
    commercialUse: true,
    ...patch,
  };
}

function skpMetadata(names: StudioBg3dSkpImportReport["names"]): StudioBg3dAssetMetadata {
  const asset: StudioBg3dSkpImportedAsset = {
    sourcePath: "set/room.skp",
    name: "교실 세트",
    contentHash: HASH,
    byteSize: 4_096,
    triangles: 80,
    textures: 1,
    rights: { status: "owned", commercialUse: true },
  };
  const record = buildStudioBg3dSkpAssetMetadata(asset, createSkpReportFixture({ names }), 1_000);
  if (!record) throw new Error("메타데이터 기록을 만들지 못했습니다.");
  return record;
}

const list = (items: readonly string[], total = items.length) => ({
  available: true,
  items: [...items],
  total,
  truncated: total > items.length,
});

describe("소재 보기의 원본 이름(sourceNames)", () => {
  it("메타데이터에 남은 컴포넌트·태그·장면 이름을 차례로 모은다", () => {
    const record = skpMetadata({
      components: list(["의자", "책상"]),
      tags: list(["벽"]),
      scenes: list(["정면 뷰"]),
    });
    const view = buildStudioBg3dAssetRightsView(entry(), { metadataByHash: new Map([[HASH, record]]) });
    expect(view.sourceNames).toEqual(["의자", "책상", "벽", "정면 뷰"]);
    expect(Object.isFrozen(view.sourceNames)).toBe(true);
  });

  it("이름은 권리 판정에 끼지 않는다 — 이름이 있어도 권리를 모르면 미확인이다", () => {
    const record = skpMetadata({ components: list(["의자"]), tags: list([]), scenes: list([]) });
    const withNames = buildStudioBg3dAssetRightsView(entry(), { metadataByHash: new Map([[HASH, record]]) });
    const without = buildStudioBg3dAssetRightsView(entry(), {});
    expect(withNames.state).toEqual(without.state);
    expect(withNames.basis).toBe("metadata");
    expect(withNames.state.license).toBe("unknown");
    expect(withNames.state.commercial).toBe("unknown");
  });

  it("기록이 없거나 SKP 가 아니면 빈 목록이다", () => {
    expect(buildStudioBg3dAssetRightsView(entry(), {}).sourceNames).toEqual([]);
    expect(buildStudioBg3dAssetRightsView(entry({ contentHash: null }), {}).sourceNames).toEqual([]);
  });

  it("저장 한도(목록마다 16개)를 채운 세 목록은 48개 모두 모은다", () => {
    const sixteen = Array.from({ length: 16 }, (_, index) => `부품${String(index).padStart(2, "0")}`);
    const record = skpMetadata({
      components: list(sixteen),
      tags: list(sixteen.map((name) => `${name}태그`)),
      scenes: list(sixteen.map((name) => `${name}장면`)),
    });
    const names = buildStudioBg3dAssetRightsView(entry(), { metadataByHash: new Map([[HASH, record]]) }).sourceNames ?? [];
    expect(names).toHaveLength(48);
    expect(names[0]).toBe("부품00");
    expect(names[47]).toBe("부품15장면");
  });

  it("저장소 규칙을 우회해 들어온 기록이어도 보이지 않는 글자는 빼고 개수는 48개로 줄인다", () => {
    const base = skpMetadata({ components: list(["a"]), tags: list([]), scenes: list([]) });
    const many = (suffix: string) => list(Array.from({ length: 20 }, (_, index) => `이름${index}\u200b${suffix}`));
    const tampered: StudioBg3dAssetMetadata = {
      ...base,
      skpImport: base.skpImport
        ? { ...base.skpImport, names: { components: many("c"), tags: many("t"), scenes: many("s") } }
        : undefined,
    };
    const names = buildStudioBg3dAssetRightsView(entry(), { metadataByHash: new Map([[HASH, tampered]]) }).sourceNames ?? [];
    expect(names).toHaveLength(48);
    expect(names.some((name) => name.includes("\u200b"))).toBe(false);
    expect(names[0]).toBe("이름0c");
  });
});

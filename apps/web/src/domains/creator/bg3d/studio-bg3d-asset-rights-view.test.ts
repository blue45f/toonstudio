import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_ASSET_METADATA_VERSION,
  normalizeStudioBg3dAssetMetadata,
  type StudioBg3dAssetMetadata,
} from "./studio-bg3d-asset-metadata";
import {
  buildStudioBg3dAssetRightsView,
  buildStudioBg3dAssetRightsViews,
  countStudioBg3dAssetRightsValues,
  filterStudioBg3dAssetRightsEntries,
  hasActiveStudioBg3dAssetRightsFilter,
  type StudioBg3dBundledProvenanceLike,
} from "./studio-bg3d-asset-rights-view";

import type { StudioBg3dAttachmentRights } from "./studio-bg3d-scene-document-types";

const hash = (digit: string) => `sha256:${digit.repeat(64)}` as const;

function entry(id: string, digit: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    name: `소재 ${id}`,
    format: "glb" as const,
    source: "sqlite-opfs" as const,
    createdAt: 1,
    updatedAt: 2,
    contentHash: hash(digit),
    byteSize: 1_024,
    ...patch,
  };
}

function storedMetadata(digit: string, rights: unknown): StudioBg3dAssetMetadata {
  const value = normalizeStudioBg3dAssetMetadata({
    version: STUDIO_BG3D_ASSET_METADATA_VERSION,
    contentHash: hash(digit),
    name: "저장소 기록",
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

const CC0: StudioBg3dBundledProvenanceLike = {
  origin: "original-procedural",
  license: "CC0-1.0",
  commercialUse: true,
  attributionRequired: false,
  author: "ToonStudio",
};
const TRIPO: StudioBg3dBundledProvenanceLike = {
  origin: "ai-generated-free-wallet",
  license: "Tripo Terms of Service - Free User Output",
  commercialUse: true,
  attributionRequired: false,
  author: "ToonStudio",
  provider: "Tripo",
};

const licensed: StudioBg3dAttachmentRights = {
  status: "licensed",
  commercialUse: true,
  attributionRequired: true,
  attribution: "모델 제작자 · 상업용 표준",
  licenseName: "ACON3D 구매 라이선스",
};

describe("번들 소재의 권리 보기", () => {
  it("카탈로그 출처 기록으로 공개 이용·상업 가능·AI 아님을 읽고 AI 학습은 미확인으로 둔다", () => {
    const view = buildStudioBg3dAssetRightsView(
      entry("env-1", "1", { source: "sample" }),
      { provenanceOf: () => CC0 },
    );
    expect(view).toMatchObject({
      origin: "bundled",
      basis: "catalog",
      attribution: "not-required",
      licenseName: "CC0 1.0",
      author: "ToonStudio",
      state: { license: "public-domain", commercial: "allowed", aiGenerated: "no", aiTraining: "unknown" },
    });
    expect(view.record?.contentHash).toBe(hash("1"));
  });

  it("AI로 생성된 번들 소재는 AI 생성으로 표시하고 제공처를 보존한다", () => {
    const view = buildStudioBg3dAssetRightsView(entry("env-2", "2", { source: "sample" }), { provenanceOf: () => TRIPO });
    expect(view.state).toEqual({ license: "licensed", commercial: "allowed", aiGenerated: "yes", aiTraining: "unknown" });
    expect(view.provider).toBe("Tripo");
    expect(view.licenseName).toBe("Tripo Terms of Service - Free User Output");
  });

  it("카탈로그 기록이 없거나 만든 방식을 모르는 번들 소재는 허용으로 읽지 않는다", () => {
    const missing = buildStudioBg3dAssetRightsView(entry("env-3", "3", { source: "sample" }), { provenanceOf: () => undefined });
    expect(missing.basis).toBe("entry-only");
    expect(missing.state).toEqual({ license: "unknown", commercial: "unknown", aiGenerated: "unknown", aiTraining: "unknown" });
    expect(missing.attribution).toBe("unknown");

    const unknownMethod = buildStudioBg3dAssetRightsView(
      entry("env-4", "4", { source: "sample" }),
      { provenanceOf: () => ({ ...CC0, origin: "something-new" }) },
    );
    expect(unknownMethod.state.aiGenerated).toBe("unknown");
  });
});

describe("번들 소재의 불리언이 아닌 값", () => {
  const bundledView = (patch: Record<string, unknown>) =>
    buildStudioBg3dAssetRightsView(entry("env-x", "9", { source: "sample" }), {
      provenanceOf: () => ({ ...CC0, ...patch }) as StudioBg3dBundledProvenanceLike,
    });

  it("commercialUse 가 true 가 아니면 상업 가능으로 읽지 않는다", () => {
    for (const value of [undefined, null, "true", 1, "yes"]) {
      expect(bundledView({ commercialUse: value }).state.commercial).toBe("unknown");
    }
    expect(bundledView({ commercialUse: true }).state.commercial).toBe("allowed");
  });

  it("attributionRequired 가 불리언이 아니면 '표기 불필요'로 읽지 않고 미확인으로 둔다", () => {
    for (const value of [undefined, null, "false", 0, "no"]) {
      expect(bundledView({ attributionRequired: value }).attribution).toBe("unknown");
    }
    expect(bundledView({ attributionRequired: false }).attribution).toBe("not-required");
    expect(bundledView({ attributionRequired: true }).attribution).toBe("required");
  });
});

describe("가져온 소재의 권리 보기", () => {
  it("라이브러리 레코드의 권리를 기준으로 라이선스·표기 의무·상업 사용을 읽는다", () => {
    const view = buildStudioBg3dAssetRightsView(entry("a1", "1"), {
      libraryRightsById: new Map([["a1", licensed]]),
    });
    expect(view).toMatchObject({
      origin: "imported",
      basis: "library",
      attribution: "required",
      attributionText: "모델 제작자 · 상업용 표준",
      licenseName: "ACON3D 구매 라이선스",
      state: { license: "licensed", commercial: "allowed", aiGenerated: "unknown", aiTraining: "unknown" },
    });
  });

  it("권리가 미확인이면 라이브러리 기본값의 attributionRequired=false 를 '표기 불필요'로 읽지 않는다", () => {
    const view = buildStudioBg3dAssetRightsView(entry("a2", "2"), {
      libraryRightsById: new Map([["a2", { status: "unknown", commercialUse: false, attributionRequired: false }]]),
    });
    expect(view.attribution).toBe("unknown");
    expect(view.state.commercial).toBe("unknown");
    expect(view.state.license).toBe("unknown");
  });

  it("메타데이터 기록이 라이브러리와 같은 말을 하면 AI 표기·제공처·작성자·날짜만 덧붙는다", () => {
    const view = buildStudioBg3dAssetRightsView(entry("a3", "3"), {
      libraryRightsById: new Map([["a3", licensed]]),
      metadataByHash: new Map([[hash("3"), storedMetadata("3", {
        status: "licensed",
        commercialUse: true,
        teamShareAllowed: false,
        license: "ACON3D 구매 라이선스",
        provider: "ACON 3D",
        author: "스튜디오 봄",
        purchaseOrDownloadDate: "2026-07-22",
        aiGenerated: "yes",
        aiTraining: "prohibited",
      })]]),
    });
    expect(view.state).toEqual({ license: "licensed", commercial: "allowed", aiGenerated: "yes", aiTraining: "prohibited" });
    expect(view).toMatchObject({ provider: "ACON 3D", author: "스튜디오 봄", acquiredOn: "2026-07-22", conflict: false });
  });

  describe("라이브러리와 메타데이터가 다르게 말하면 더 제한적인 쪽을 쓴다", () => {
    const withMetadata = (library: StudioBg3dAttachmentRights, rights: unknown) =>
      buildStudioBg3dAssetRightsView(entry("m1", "5"), {
        libraryRightsById: new Map([["m1", library]]),
        metadataByHash: new Map([[hash("5"), storedMetadata("5", rights)]]),
      });
    const meta = (patch: Record<string, unknown>) => ({ status: "licensed", commercialUse: true, teamShareAllowed: false, license: "표준", ...patch });

    it("라이브러리는 구매·허가·상업 가능인데 메타데이터가 직접 제작·상업 미허용이면 구매·허가이되 상업은 미확인이다", () => {
      const view = withMetadata(licensed, meta({ status: "owned", commercialUse: false, license: undefined }));
      expect(view.state).toMatchObject({ license: "licensed", commercial: "unknown" });
      expect(view.conflict).toBe(true);
    });

    it("메타데이터가 더 제한적이면(미확인) 라이브러리가 허용이라고 해도 미확인으로 닫는다", () => {
      const view = withMetadata(licensed, { status: "unknown", aiGenerated: "yes" });
      expect(view.state).toEqual({ license: "unknown", commercial: "unknown", aiGenerated: "yes", aiTraining: "unknown" });
      expect(view.attribution).toBe("unknown");
      expect(view.conflict).toBe(true);
    });

    it("메타데이터가 더 느슨해도(공개 이용) 라이브러리의 제한을 풀지 못한다", () => {
      const view = withMetadata(
        { status: "unknown", commercialUse: false, attributionRequired: false },
        { status: "public-domain", commercialUse: true, teamShareAllowed: false },
      );
      expect(view.state).toMatchObject({ license: "unknown", commercial: "unknown" });
      expect(view.conflict).toBe(true);

      const licensedVsPublic = withMetadata(licensed, { status: "public-domain", commercialUse: true, teamShareAllowed: false });
      expect(licensedVsPublic.state.license).toBe("licensed");
      expect(licensedVsPublic.conflict).toBe(true);
    });

    it("상업 사용만 다르면 둘 다 허용일 때만 가능이다", () => {
      expect(withMetadata(licensed, meta({ commercialUse: false })).state.commercial).toBe("unknown");
      const loose = withMetadata({ ...licensed, commercialUse: false }, meta({ commercialUse: true }));
      expect(loose.state.commercial).toBe("unknown");
      expect(loose.conflict).toBe(true);
    });

    it("메타데이터의 더 제한적인 상태가 이기면 폼의 표기 의무 답은 다른 상태에 대한 것이라 미확인으로 둔다", () => {
      const owned: StudioBg3dAttachmentRights = { status: "owned", commercialUse: true, attributionRequired: false };
      const stricter = withMetadata(owned, meta({}));
      expect(stricter.state.license).toBe("licensed");
      expect(stricter.attribution).toBe("unknown");
      // 라이브러리의 답이 최종 판정에 쓰이면(라이브러리가 더 제한적이거나 같음) 폼의 답을 그대로 쓴다.
      expect(withMetadata(licensed, meta({ status: "owned", license: undefined })).attribution).toBe("required");
      expect(withMetadata(licensed, meta({})).attribution).toBe("required");
    });

    it("같은 말이면 충돌로 보지 않는다", () => {
      expect(withMetadata(licensed, meta({})).conflict).toBe(false);
      // 라이브러리 기본값(권리 미확인)과 AI 표기만 있는 메타데이터는 충돌이 아니다.
      const defaults = withMetadata(
        { status: "unknown", commercialUse: false, attributionRequired: false },
        { status: "unknown", aiGenerated: "no" },
      );
      expect(defaults.conflict).toBe(false);
      expect(defaults.state.aiGenerated).toBe("no");
    });

    it("충돌이 난 소재의 필터 값과 카드 값은 같은 기록에서 나온다", () => {
      const entries = [entry("m1", "5")];
      const views = buildStudioBg3dAssetRightsViews(entries, {
        libraryRightsById: new Map([["m1", licensed]]),
        metadataByHash: new Map([[hash("5"), storedMetadata("5", { status: "unknown" })]]),
      });
      expect(filterStudioBg3dAssetRightsEntries(entries, views, { license: ["licensed"] })).toEqual([]);
      expect(filterStudioBg3dAssetRightsEntries(entries, views, { license: ["unknown"] })).toEqual(entries);
    });
  });

  it("라이브러리 기록이 없고 메타데이터만 있으면 그 기록을 쓰되 표기 의무는 모른다고 한다", () => {
    const view = buildStudioBg3dAssetRightsView(entry("a4", "4"), {
      metadataByHash: new Map([[hash("4"), storedMetadata("4", {
        status: "public-domain", commercialUse: true, teamShareAllowed: false, aiGenerated: "no",
      })]]),
    });
    expect(view.basis).toBe("metadata");
    expect(view.state).toMatchObject({ license: "public-domain", commercial: "allowed", aiGenerated: "no" });
    expect(view.attribution).toBe("unknown");
  });

  it("어느 원천에서도 읽지 못하면 모든 칸이 미확인이다", () => {
    const view = buildStudioBg3dAssetRightsView(entry("a5", "5"));
    expect(view.basis).toBe("entry-only");
    expect(view.state).toEqual({ license: "unknown", commercial: "unknown", aiGenerated: "unknown", aiTraining: "unknown" });
    expect(view).toMatchObject({ attribution: "unknown", licenseName: null, provider: null, author: null, acquiredOn: null });
  });

  it("권리 상태가 미확인이어도 사용자가 밝힌 AI 표기는 보인다", () => {
    const view = buildStudioBg3dAssetRightsView(entry("a6", "6"), {
      libraryRightsById: new Map([["a6", { status: "unknown", commercialUse: false, attributionRequired: false }]]),
      metadataByHash: new Map([[hash("6"), storedMetadata("6", { status: "unknown", aiGenerated: "yes" })]]),
    });
    expect(view.state).toEqual({ license: "unknown", commercial: "unknown", aiGenerated: "yes", aiTraining: "unknown" });
  });

  describe("메타데이터 저장 규칙이 거절하는 글자가 든 라이선스 이름도 라이선스 상태는 지킨다", () => {
    const licenseNamed = (licenseName: string, digit = "7") =>
      buildStudioBg3dAssetRightsView(entry(`n${digit}`, digit), {
        libraryRightsById: new Map<string, StudioBg3dAttachmentRights>([
          [`n${digit}`, { status: "licensed", commercialUse: true, attributionRequired: false, licenseName }],
        ]),
      });

    it("꺾쇠가 든 이름('표준 <상업>')은 구매·허가·상업 가능으로 남고 이름은 글로 그대로 보인다", () => {
      const view = licenseNamed("표준 <상업>");
      expect(view.state).toMatchObject({ license: "licensed", commercial: "allowed" });
      expect(view.attribution).toBe("not-required");
      expect(view.licenseName).toBe("표준 <상업>");
      expect(view.conflict).toBe(false);
    });

    it("주소가 든 이름도 구매·허가로 남는다(필터와 카드가 같은 값)", () => {
      const view = licenseNamed("https://assets.invalid/license?access_token=secret", "8");
      expect(view.state).toMatchObject({ license: "licensed", commercial: "allowed" });
      expect(view.record?.rights.status).toBe("licensed");
      const entries = [entry("n8", "8")];
      const views = buildStudioBg3dAssetRightsViews(entries, {
        libraryRightsById: new Map([["n8", { status: "licensed", commercialUse: true, attributionRequired: false, licenseName: "https://assets.invalid/x" }]]),
      });
      expect(filterStudioBg3dAssetRightsEntries(entries, views, { license: ["licensed"] })).toEqual(entries);
    });

    it("민감한 낱말이 든 이름도 상태 판정에 끼지 않는다", () => {
      expect(licenseNamed("api_key 포함 라이선스", "9").state.license).toBe("licensed");
    });

    it("보이지 않는 글자와 방향 제어 글자는 화면용 이름에서 빼지만 라이선스 상태는 그대로다", () => {
      const view = licenseNamed("ACON\u200b 3D\u202e 라이선스\u2066");
      expect(view.state.license).toBe("licensed");
      expect(view.licenseName).toBe("ACON 3D 라이선스");
    });

    it("줄바꿈·탭은 공백 하나로 바꿔 이름이 붙어 보이지 않게 한다", () => {
      expect(licenseNamed("ACON\n3D\t라이선스", "b").licenseName).toBe("ACON 3D 라이선스");
    });

    it("보이지 않는 글자뿐인 이름은 이름 없음으로 보이고 라이선스 상태는 그대로다", () => {
      const view = licenseNamed("\u200b\u202e  ");
      expect(view.licenseName).toBeNull();
      expect(view.state.license).toBe("licensed");
    });

    it("이름 없는 구매·허가도 라이브러리 기록대로 구매·허가이고 이름만 비어 보인다", () => {
      const view = buildStudioBg3dAssetRightsView(entry("nz", "6"), {
        libraryRightsById: new Map([["nz", { status: "licensed", commercialUse: true, attributionRequired: false }]]),
      });
      expect(view.state.license).toBe("licensed");
      expect(view.licenseName).toBeNull();
    });

    it("긴 이름은 화면용으로 잘라 보인다", () => {
      expect(Array.from(licenseNamed("가".repeat(500), "a").licenseName ?? "").length).toBeLessThanOrEqual(160);
    });
  });

  it("마크업이 든 이름이어도 기록을 일반 이름으로 만들어 필터에서 빠지지 않게 한다", () => {
    const view = buildStudioBg3dAssetRightsView(entry("a8", "8", { name: "<img src=x onerror=alert(1)>" }), {
      libraryRightsById: new Map([["a8", licensed]]),
    });
    expect(view.record).not.toBeNull();
    expect(view.record?.name).toBe("3D 모델");
    expect(view.state.license).toBe("licensed");
  });

  it("콘텐츠 해시가 없는 옛 항목은 기록 없이 미확인으로 보인다", () => {
    const view = buildStudioBg3dAssetRightsView(entry("legacy", "0", { contentHash: null, byteSize: null }), {
      libraryRightsById: new Map([["legacy", licensed]]),
    });
    expect(view.record).toBeNull();
    expect(view.state.license).toBe("unknown");
  });
});

describe("권리 필터 적용", () => {
  const entries = [
    entry("b1", "a", { source: "sample" }),
    entry("b2", "b", { source: "sample" }),
    entry("c1", "c"),
    entry("c2", "d"),
    entry("c3", "e"),
    entry("legacy", "0", { contentHash: null, byteSize: null }),
  ];
  const views = buildStudioBg3dAssetRightsViews(entries, {
    provenanceOf: (id) => (id === "b1" ? CC0 : id === "b2" ? TRIPO : undefined),
    libraryRightsById: new Map<string, StudioBg3dAttachmentRights>([
      ["c1", licensed],
      ["c2", { status: "owned", commercialUse: false, attributionRequired: false }],
      ["c3", { status: "unknown", commercialUse: false, attributionRequired: false }],
    ]),
    metadataByHash: new Map([[hash("d"), storedMetadata("d", { status: "owned", commercialUse: false, teamShareAllowed: false, aiGenerated: "no" })]]),
  });
  const ids = (list: readonly { id: string }[]) => list.map(({ id }) => id);

  it("켜진 필터가 없으면 목록을 그대로 돌려준다(목록이 사라지는 함정 없음)", () => {
    for (const filter of [undefined, {}, { license: [], origin: [] }]) {
      expect(hasActiveStudioBg3dAssetRightsFilter(filter)).toBe(false);
      expect(filterStudioBg3dAssetRightsEntries(entries, views, filter)).toBe(entries);
    }
  });

  it("라이선스 종류는 OR, 패싯끼리는 AND 로 거른다", () => {
    expect(ids(filterStudioBg3dAssetRightsEntries(entries, views, { license: ["owned", "licensed"] }))).toEqual(["b2", "c1", "c2"]);
    expect(ids(filterStudioBg3dAssetRightsEntries(entries, views, { license: ["owned", "licensed"], commercial: ["allowed"] }))).toEqual(["b2", "c1"]);
    expect(ids(filterStudioBg3dAssetRightsEntries(entries, views, { license: ["public-domain"], aiGenerated: ["no"] }))).toEqual(["b1"]);
  });

  it("출처 종류는 번들과 가져온 소재를 가른다", () => {
    expect(ids(filterStudioBg3dAssetRightsEntries(entries, views, { origin: ["bundled"] }))).toEqual(["b1", "b2"]);
    expect(ids(filterStudioBg3dAssetRightsEntries(entries, views, { origin: ["imported"], license: ["owned"] }))).toEqual(["c2"]);
  });

  it("AI 생성 표기를 가진 소재와 모르는 소재를 나눠 볼 수 있다", () => {
    expect(ids(filterStudioBg3dAssetRightsEntries(entries, views, { aiGenerated: ["yes"] }))).toEqual(["b2"]);
    expect(ids(filterStudioBg3dAssetRightsEntries(entries, views, { aiGenerated: ["unknown"] }))).toEqual(["c1", "c3", "legacy"]);
  });

  it("미확인을 고르면 해시가 없어 기록을 만들 수 없는 항목도 미확인으로 함께 나온다", () => {
    expect(ids(filterStudioBg3dAssetRightsEntries(entries, views, { license: ["unknown"] }))).toEqual(["c3", "legacy"]);
    // 확인된 값만 고르면 해시 없는 항목은 나오지 않는다.
    expect(ids(filterStudioBg3dAssetRightsEntries(entries, views, { license: ["owned", "licensed", "public-domain"] }))).not.toContain("legacy");
  });

  it("결과가 0건이면 빈 목록이고 입력 목록은 바뀌지 않는다", () => {
    const before = [...entries];
    expect(filterStudioBg3dAssetRightsEntries(entries, views, { license: ["owned"], aiTraining: ["allowed"] })).toEqual([]);
    expect(entries).toEqual(before);
  });

  it("질의 상한(4,096건)을 넘는 목록도 빈 결과가 되지 않고 상한 뒤의 항목까지 거른다", () => {
    const total = 4_100;
    const many = Array.from({ length: total }, (_, index) => entry(`bulk-${index}`, "a", {
      contentHash: `sha256:${index.toString(16).padStart(64, "0")}`,
    }));
    const manyViews = buildStudioBg3dAssetRightsViews(many, {
      libraryRightsById: new Map(many.map((item, index) => [
        item.id,
        index % 2 === 0
          ? { status: "owned", commercialUse: true, attributionRequired: false } as const
          : { status: "licensed", commercialUse: true, attributionRequired: false, licenseName: "표준" } as const,
      ])),
    });
    const owned = filterStudioBg3dAssetRightsEntries(many, manyViews, { license: ["owned"] });
    const licensedOnly = filterStudioBg3dAssetRightsEntries(many, manyViews, { license: ["licensed"] });
    expect(owned).toHaveLength(total / 2);
    expect(licensedOnly).toHaveLength(total / 2);
    // 상한 경계 뒤(4,096번째 이후)의 항목이 결과에 들어 있다.
    expect(ids(owned)).toContain("bulk-4098");
    expect(ids(licensedOnly)).toContain("bulk-4099");
    expect(ids(owned).some((id) => ids(licensedOnly).includes(id))).toBe(false);
  });

  it("칩에 붙일 개수를 값별로 센다", () => {
    expect(countStudioBg3dAssetRightsValues(entries, views)).toEqual({
      origin: { bundled: 2, imported: 4 },
      license: { owned: 1, licensed: 2, "public-domain": 1, unknown: 2 },
      commercial: { allowed: 3, unknown: 3 },
      aiGenerated: { yes: 1, no: 2, unknown: 3 },
      aiTraining: { allowed: 0, prohibited: 0, unknown: 6 },
    });
  });
});

// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioBundleAssetLibraryPanel } from "../StudioBundleAssetLibraryPanel";
import { parseStudioBundleCatalog } from "../studio-bundle-asset-delivery";

const loadCatalog = vi.hoisted(() => vi.fn());
vi.mock("../studio-bundle-asset-delivery", async (importOriginal) => ({
  ...await importOriginal<typeof import("../studio-bundle-asset-delivery")>(),
  loadStudioBundleCatalog: loadCatalog,
}));

const slot = (rights: Record<string, unknown> | undefined) => ({
  id: "cbv1-045-food-props-render-001",
  name: "로우폴리 음식 소품 렌더",
  kind: "prop-image",
  category: "rendered-prop",
  path: "assets/cbv1-045-food-props-render-001/prop.webp",
  previewPath: "assets/cbv1-045-food-props-render-001/thumbnail.webp",
  sha256: "a".repeat(64),
  bytes: 4096,
  width: 1536,
  height: 1536,
  visualReviewed: true,
  curationStatus: "selected-after-visual-triage",
  derivedFromPack: "cbv1-045-low-poly-food-packaging",
  license: {
    id: "Self-Declared-License-Id",
    provider: "EmaceArt",
    sourceUrl: "https://itch.io/b/3905/creator-bundle-volume-1",
    commercialUse: true,
    redistributionAllowed: false,
    inServiceOnly: true,
  },
  ...(rights ? { rights } : {}),
});
const manifest = (assets: unknown[]) => ({
  schema: "toonstudio.asset-delivery.v1",
  pack: { id: "bundle-renders-v1", title: "Creator Bundle 렌더 소품", inServiceOnly: true, downloadable: false },
  assets,
});
const ledgerRights = {
  ledgerPackId: "cbv1-045-food-packaging",
  serve: "allow",
  status: "licensed",
  licenseName: "Ledger-Granted License Name",
  commercialUse: true,
  attributionRequired: false,
};

const cc0Slot = () => ({
  ...slot({...ledgerRights, ledgerPackId: "cbv1-008-cute-park-pack", status: "public-domain", licenseName: "CC0-1.0"}),
  id: "cbv1-008-cute-park-render-001",
  path: "assets/cbv1-008-cute-park-render-001/prop.webp",
  previewPath: "assets/cbv1-008-cute-park-render-001/thumbnail.webp",
  derivedFromPack: "cbv1-008-cute-park-pack",
  license: {
    ...slot(ledgerRights).license, id: "CC0-1.0", provider: "RG Poly", redistributionAllowed: true,
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
});

let host: HTMLDivElement;
let root: Root;

async function openPanel(assets: unknown[]): Promise<void> {
  loadCatalog.mockResolvedValue(parseStudioBundleCatalog(manifest(assets)));
  await act(async () => { root.render(createElement(StudioBundleAssetLibraryPanel, { onUseAsset: () => true })); });
  const details = host.querySelector("details")!;
  await act(async () => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  loadCatalog.mockReset();
  vi.unstubAllGlobals();
});

describe("bundle render panel rights display", () => {
  it("shows the ledger-granted license name instead of the manifest's own license id", async () => {
    await openPanel([slot(ledgerRights)]);
    const card = host.querySelector('[data-bundle-asset-id="cbv1-045-food-props-render-001"]')!;
    expect(card.textContent).toContain("Ledger-Granted License Name");
    expect(host.textContent).not.toContain("Self-Declared-License-Id");
    await act(async () => { card.querySelector("button")!.click(); });
    expect(host.querySelector('[role="dialog"]')!.textContent).toContain("Ledger-Granted License Name");
    expect(host.querySelector('[role="dialog"]')!.textContent).not.toContain("Self-Declared-License-Id");
    expect(host.textContent).toContain("소품 자체를 다시 배포하거나 파일로 내보낼 수는 없습니다");
  });

  it.each([false, true])("CC0 소품이 있으면 라이선스별 이용 권리를 안내하고 CC0 재배포를 금지하지 않는다 (혼합 %s)", async (mixed) => {
    await openPanel(mixed ? [slot(ledgerRights), cc0Slot()] : [cc0Slot()]);
    expect(host.querySelector('[data-bundle-asset-id="cbv1-008-cute-park-render-001"]')?.textContent).toContain("CC0-1.0");
    expect(host.textContent).toContain("각 소품 카드의 라이선스를 따릅니다");
    expect(host.textContent).toContain("CC0 조건에 따라 이용·수정·재배포할 수 있습니다");
    expect(host.textContent).toContain("원본 3D 모델을 내려받는 동선은 제공하지 않습니다");
    expect(host.textContent).not.toContain("소품 자체를 다시 배포하거나 파일로 내보낼 수는 없습니다");
    if (mixed) expect(host.textContent).toContain("Ledger-Granted License Name");
  });

  it("lists nothing for a slot without a ledger block and keeps the reviewed-empty notice", async () => {
    await openPanel([slot(undefined)]);
    expect(host.querySelector("[data-bundle-asset-id]")).toBeNull();
    expect(host.textContent).toContain("아직 검수가 끝난 번들 소품이 없습니다");
  });
});

// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioBundleAssetLibraryPanel } from "../StudioBundleAssetLibraryPanel";
import { parseStudioBundleCatalog } from "../studio-bundle-asset-delivery";
import { createStudioBundleSourceCredit } from "./studio-bundle-source-credit";
import { panelStatusText } from "../studio-panel-status-i18n-r3c06";

import type { StudioAsset, StudioAssetContentHash, StudioAssetSaveInput, StudioAssetWithContentHash } from "../studio-asset-library";

import { useI18n } from "@/shared/lib/i18n";

const mocks = vi.hoisted(() => ({load: vi.fn(), createRecord: vi.fn(), find: vi.fn(), save: vi.fn()}));
vi.mock("../studio-bundle-asset-delivery", async (importOriginal) => ({
  ...await importOriginal<typeof import("../studio-bundle-asset-delivery")>(),
  loadStudioBundleCatalog: mocks.load,
  createStudioBundleImageRecord: mocks.createRecord,
}));
vi.mock("../studio-asset-library", async (importOriginal) => ({
  ...await importOriginal<typeof import("../studio-asset-library")>(),
  findStudioAssetCandidatesByContentIdentity: mocks.find,
  saveAsset: mocks.save,
}));

const HASH: StudioAssetContentHash = `sha256:${"a".repeat(64)}`;
const catalog = parseStudioBundleCatalog({
  schema: "toonstudio.asset-delivery.v1",
  pack: {id: "bundle-renders-v1", inServiceOnly: true, downloadable: false},
  assets: [{
    id: "cbv1-008-bench-1-1", name: "공원 벤치", kind: "prop-image", category: "rendered-prop",
    path: "assets/cbv1-008-bench-1-1/prop.webp", previewPath: "assets/cbv1-008-bench-1-1/thumbnail.webp",
    width: 1536, height: 1536, bytes: 4096, sha256: "a".repeat(64),
    visualReviewed: true, studioRuntimeVerified: false, curationStatus: "visual-reviewed",
    derivedFromPack: "cbv1-008-cute-park-pack",
    rights: {ledgerPackId: "cbv1-008-cute-park-pack", serve: "allow", status: "public-domain", licenseName: "CC0-1.0", commercialUse: true, attributionRequired: false},
    license: {id: "CC0-1.0", provider: "RG Poly", url: "https://creativecommons.org/publicdomain/zero/1.0/",
      sourceUrl: "https://rg-poly.itch.io/cute-park-pack", commercialUse: true, redistributionAllowed: true, inServiceOnly: true},
  }],
});
function record(): StudioAssetWithContentHash {
  const asset = catalog[0];
  if (!asset) throw new Error("테스트 카탈로그가 비었습니다.");
  return {
    id: `bundle:${asset.id}`, name: asset.name, dataUrl: "data:image/webp;base64,YQ==",
    width: 1536, height: 1536, contentHash: HASH, createdAt: 1, kind: "imported",
    bundleSourceCredit: createStudioBundleSourceCredit(asset, HASH),
    rights: {sourceKind: "imported", sourceId: asset.id, licenseId: "creator-bundle-ledger:cbv1-008-cute-park-pack",
      licenseLabel: "CC0-1.0", licenseUrl: asset.licenseUrl, attributionRequired: false,
      attributionText: "RG Poly — https://rg-poly.itch.io/cute-park-pack", rightsConfirmed: true},
  };
}
function deferred<T>() {
  let resolveValue: ((value: T) => void) | undefined;
  const promise = new Promise<T>(resolve => {resolveValue = resolve;});
  return {promise, resolve: (value: T) => {
    if (!resolveValue) throw new Error("테스트 Promise가 준비되지 않았습니다.");
    resolveValue(value);
  }};
}

let host: HTMLDivElement;
let root: Root;
let mounted: boolean;
const onUse = vi.fn((_asset: StudioAsset): boolean => true);
const onSaved = vi.fn((_asset: StudioAsset): void => undefined);

async function openPanel() {
  await act(async () => {root.render(createElement(StudioBundleAssetLibraryPanel, {onUseAsset: onUse, onSavedAsset: onSaved}));});
  const details = host.querySelector("details");
  if (!details) throw new Error("번들 패널을 찾지 못했습니다.");
  await act(async () => {details.open = true; details.dispatchEvent(new Event("toggle"));});
}
function button(label: string, parent: ParentNode = host): HTMLButtonElement {
  const found = [...parent.querySelectorAll("button")].find(item => item.textContent === label);
  if (!found) throw new Error("버튼을 찾지 못했습니다: " + label);
  return found;
}
async function click(label: string, parent: ParentNode = host) {
  await act(async () => {button(label, parent).click();});
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useI18n.setState({lang: "ko"});
  mocks.load.mockReset().mockResolvedValue(catalog);
  mocks.createRecord.mockReset().mockImplementation(async () => record());
  mocks.find.mockReset().mockResolvedValue([]);
  mocks.save.mockReset().mockImplementation(async (input: StudioAssetSaveInput) => ({...record(), ...input, id: "personal-001", contentHash: HASH}));
  onUse.mockClear().mockReturnValue(true);
  onSaved.mockClear().mockImplementation(() => undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mounted = true;
});

afterEach(async () => {
  if (mounted) await act(async () => {root.unmount();});
  host.remove();
  useI18n.setState({lang: "ko"});
  vi.unstubAllGlobals();
});

describe("번들 패널의 개인 라이브러리 저장 동선", () => {
  it("저장 중 중복 클릭을 막고 출처를 보존한 성공 후 내 에셋 재사용 위치를 안내한다", async () => {
    const pending = deferred<StudioAssetWithContentHash>();
    mocks.save.mockReturnValue(pending.promise);
    await openPanel();
    await act(async () => {
      const save = button("개인 라이브러리에 저장");
      save.click(); save.click();
    });
    expect(button("개인 라이브러리에 저장 중…").disabled).toBe(true);
    expect(button("개인 라이브러리에 저장 중…").getAttribute("aria-busy")).toBe("true");
    expect(mocks.createRecord).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(onUse).not.toHaveBeenCalled();
    const saved = {...record(), id: "personal-001"};
    await act(async () => {pending.resolve(saved);});
    expect(button("개인 라이브러리에 저장됨").disabled).toBe(true);
    expect(host.textContent).toContain("‘내 에셋’ 탭에서 다시 사용할 수 있습니다");
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(saved);
    expect(onSaved.mock.calls[0]?.[0].bundleSourceCredit?.assetId).toBe("cbv1-008-bench-1-1");
  });

  it("동일한 개인 에셋이 있으면 저장을 늘리지 않고 재사용 결과를 전달한다", async () => {
    const existing = {...record(), id: "existing-001", name: "내 벤치"};
    mocks.find.mockResolvedValue([existing]);
    await openPanel();
    await click("개인 라이브러리에 저장");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(existing);
    expect(host.textContent).toContain("이미 저장된 소품입니다");
    expect(onUse).not.toHaveBeenCalled();
  });

  it("실패를 성공으로 표시하거나 자동 재시도하지 않고 명시적인 재시도 버튼을 제공한다", async () => {
    mocks.save.mockRejectedValueOnce(new Error("storage unavailable"));
    await openPanel();
    await click("개인 라이브러리에 저장");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("개인 라이브러리에 저장하지 못했습니다");
    expect(button("저장 다시 시도").disabled).toBe(false);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    await click("저장 다시 시도");
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(button("개인 라이브러리에 저장됨")).toBeDefined();
    expect(onUse).not.toHaveBeenCalled();
  });

  it("확대 미리보기에서도 별도로 저장하고 캔버스 삽입은 실행하지 않는다", async () => {
    await openPanel();
    const preview = host.querySelector('button[aria-label="공원 벤치 확대 미리보기"]');
    if (!(preview instanceof HTMLButtonElement)) throw new Error("미리보기 버튼이 없습니다.");
    await act(async () => {preview.click();});
    const dialog = host.querySelector('[role="dialog"]');
    if (!dialog) throw new Error("미리보기 대화상자가 없습니다.");
    await click("개인 라이브러리에 저장", dialog);
    expect(button("개인 라이브러리에 저장됨", dialog)).toBeDefined();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onUse).not.toHaveBeenCalled();
  });

  it("기존 캔버스 삽입은 동기 boolean 콜백만 사용하고 개인 저장을 실행하지 않는다", async () => {
    onUse.mockReturnValue(false);
    await openPanel();
    await click("캔버스에 삽입");
    expect(onUse).toHaveBeenCalledExactlyOnceWith(record());
    expect(host.textContent).toContain("캔버스에 삽입하지 못했습니다");
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("다운로드 중 패널이 언마운트되면 뒤늦게 개인 저장을 시작하지 않는다", async () => {
    const pending = deferred<StudioAssetWithContentHash>();
    mocks.createRecord.mockReturnValue(pending.promise);
    await openPanel();
    await click("개인 라이브러리에 저장");
    await act(async () => {root.unmount(); mounted = false;});
    await act(async () => {pending.resolve(record());});
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("목록 갱신 콜백이 실패해도 완료된 저장을 실패·재시도 상태로 바꾸지 않는다", async () => {
    onSaved.mockImplementation(() => {throw new Error("refresh failed");});
    await openPanel();
    await click("개인 라이브러리에 저장");
    expect(button("개인 라이브러리에 저장됨").disabled).toBe(true);
    expect(host.textContent).toContain("소재 서재를 다시 열어");
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("등록된 영어 저장 문구와 누락 키의 기본 안내를 사용한다", async () => {
    useI18n.setState({lang: "en"});
    await openPanel();
    await click("Save to personal library");
    expect(host.textContent).toContain("Reuse it from the My Assets tab");
    expect(host.textContent).toContain("CC0 items may be used, modified and redistributed under CC0");
    for (const key of ["action", "saving", "saved", "retry", "success", "existing", "failed", "refreshFailed"]) {
      expect(panelStatusText(`studio.panelStatus.bundleLibrary.personalSave.${key}`, "미등록 안내")).not.toMatch(/[가-힣]/u);
    }
    expect(panelStatusText("studio.panelStatus.bundleLibrary.personalSave.missing", "기본 안내")).toBe("기본 안내");
  });
});

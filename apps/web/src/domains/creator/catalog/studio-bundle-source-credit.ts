import { parseStudioBundleSourceCredit, requireStudioBundleSourceCredit, type StudioBundleSourceCredit } from "@toonstudio/contracts/studio-bundle-source-credit";
import { sha256HexPortable } from "../studio-sha256";

import type { StudioAsset, StudioAssetRightsMetadata } from "../studio-asset-library";
import type { StudioBundleAsset } from "../studio-bundle-asset-delivery";
import type { El, FrameEl, ImageEl } from "../studio-element-model";
import { resolveAssetUrl } from "@/shared/catalog/catalog-static";

export { parseStudioBundleSourceCredit, requireStudioBundleSourceCredit, type StudioBundleSourceCredit } from "@toonstudio/contracts/studio-bundle-source-credit";

export function createStudioBundleSourceCredit(asset: StudioBundleAsset, contentHash: string): StudioBundleSourceCredit {
  if (contentHash !== `sha256:${asset.sha256}`) throw new TypeError("번들 원본의 콘텐츠 해시가 다릅니다.");
  return requireStudioBundleSourceCredit({
    schema: "toonstudio.bundle-source-credit.v1", assetId: asset.id, ledgerPackId: asset.rights.ledgerPackId,
    contentHash, sourceUrl: asset.sourceUrl, provider: asset.provider,
    renderPath: `/assets/studio/bundle-renders-v1/${asset.path}`,
    licenseId: asset.licenseId, licenseUrl: asset.licenseUrl, licenseName: asset.rights.licenseName,
    serve: asset.rights.serve, status: asset.rights.status,
    commercialUse: asset.rights.commercialUse, attributionRequired: asset.rights.attributionRequired,
  });
}

/** 저장 입력과 SQLite 행이 같은 검증기를 사용하며 다른 바이트의 출처 기록을 붙이지 못한다. */
export function studioBundleAssetRights(credit: StudioBundleSourceCredit): StudioAssetRightsMetadata {
  return { sourceKind: "imported", sourceId: credit.assetId, licenseId: `creator-bundle-ledger:${credit.ledgerPackId}`,
    licenseLabel: credit.licenseName, licenseUrl: credit.licenseUrl, attributionRequired: credit.attributionRequired,
    attributionText: `${credit.provider} — ${credit.sourceUrl}`, rightsConfirmed: true };
}

export function studioBundleSourceCreditProperties(input: { readonly bundleSourceCredit?: unknown; readonly contentHash?: unknown; readonly rights?: unknown }): { readonly bundleSourceCredit?: StudioBundleSourceCredit } {
  if (input.bundleSourceCredit === undefined) return {};
  const credit = requireStudioBundleSourceCredit(input.bundleSourceCredit);
  if (input.contentHash !== credit.contentHash) throw new TypeError("번들 출처 기록과 이미지 콘텐츠 해시가 다릅니다.");
  const rights = input.rights;
  if (!rights || typeof rights !== "object" || Array.isArray(rights)
    || Object.entries(studioBundleAssetRights(credit)).some(([key, value]) => !Object.hasOwn(rights, key) || Reflect.get(rights, key) !== value)) throw new TypeError("번들 출처 기록과 에셋 권리 메타데이터가 다릅니다.");
  return { bundleSourceCredit: credit };
}

type AddImage = (src: string, width: number, height: number, provenance?: undefined, animated?: boolean, patch?: Pick<ImageEl, "bundleSourceCredit"> & { name?: string }) => boolean;

/** 일반 로컬·CC0·AI 삽입은 기존 세 인자 계약을 그대로 유지한다. */
export function insertStudioAssetWithBundleCredit(asset: StudioAsset, addImage: AddImage): boolean {
  if (asset.bundleSourceCredit === undefined) return addImage(asset.dataUrl, asset.width, asset.height);
  const properties = studioBundleSourceCreditProperties(asset);
  return addImage(asset.dataUrl, asset.width, asset.height, undefined, false, { name: asset.name, ...properties });
}

export function canonicalizeStudioBundleCreditElement(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("bundleSourceCredit" in value) || value.bundleSourceCredit === undefined) return value;
  if (!("type" in value) || (value.type !== "image" && value.type !== "frame")) throw new TypeError("번들 출처는 이미지·프레임 배경에만 기록할 수 있습니다.");
  const credit = requireStudioBundleSourceCredit(value.bundleSourceCredit);
  const source = value.type === "image" && "src" in value ? value.src : "bg" in value ? value.bg : undefined;
  if (typeof source !== "string" || !source) throw new TypeError("번들 출처에 연결된 이미지가 없습니다.");
  return { ...value, bundleSourceCredit: credit };
}

/** 프레임 배경을 다른 URL·색으로 교체했는데 남은 출처를 권리 허가로 사용하지 않는다. */
export function studioBundleCreditMatchesSource(value: unknown, source: string | undefined, elementId?: string): boolean {
  const credit = parseStudioBundleSourceCredit(value);
  if (!credit || !source) return false;
  if (source.startsWith("data:")) {
    if (!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/u.test(source)) return false;
    const base64 = source.slice(source.indexOf(",") + 1);
    if (base64.length > 24 * 1024 * 1024) return false;
    try {
      const decoded = atob(base64);
      return credit.contentHash === `sha256:${sha256HexPortable(Uint8Array.from(decoded, (character) => character.charCodeAt(0)))}`;
    } catch { return false; }
  }
  if (elementId && source === `work-asset://image/${encodeURIComponent(elementId)}`) return true;
  if (source.startsWith("toonstudio-asset://sha256/")) return credit.contentHash === `sha256:${source.slice("toonstudio-asset://sha256/".length)}`;
  return source === credit.renderPath || source === resolveAssetUrl(credit.renderPath);
}

export function studioBundleFrameBackgroundPatch(source: { readonly bundleSourceCredit?: StudioBundleSourceCredit }, bg: string): Pick<FrameEl, "bg" | "bundleSourceCredit" | "aiProvenance"> {
  return { bg, bundleSourceCredit: source.bundleSourceCredit === undefined ? undefined : requireStudioBundleSourceCredit(source.bundleSourceCredit),
    ...(source.bundleSourceCredit ? { aiProvenance: undefined } : {}) };
}

/** 프레임의 배경 소스를 바꿀 때 이전 번들 권리 기록을 같은 커밋에서 해제한다. */
export function applyStudioBundleSourcePatch(element: El, patch: Partial<El>): El {
  const replacesBackground = element.type === "frame" && Object.hasOwn(patch, "bg")
    && Reflect.get(patch, "bg") !== element.bg && !Object.hasOwn(patch, "bundleSourceCredit");
  return { ...element, ...patch, ...(replacesBackground ? { bundleSourceCredit: undefined } : {}) } as El;
}

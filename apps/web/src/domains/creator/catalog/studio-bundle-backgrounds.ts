import { requireStudioBundleSourceCredit } from "@toonstudio/contracts/studio-bundle-source-credit";

import manifest from "../../../../public/assets/studio/bundle-scenes-v1/manifest.json";

import type { Studio2dAssetMetadata, Studio2dScene } from "../studio-2d-asset-quality";

/** 완성 장면은 생성 AI나 다른 CC0 제공자로 표시하지 않고 실제 구매 팩 출처를 보존한다. */
export const STUDIO_BUNDLE_BACKGROUND_METADATA: readonly Studio2dAssetMetadata[] = Object.freeze(
  manifest.assets.map((asset): Studio2dAssetMetadata => {
    if (!["실내", "실외"].includes(asset.environment) || !["낮", "노을", "밤"].includes(asset.timeOfDay)
      || asset.provenance.kind !== "creator-bundle-cc0" || asset.provenance.licenseStatus !== "cc0-verified"
      || asset.provenance.licenseId !== "CC0-1.0" || asset.rights.status !== "public-domain"
      || asset.rights.serve !== "allow" || !asset.rights.commercialUse || asset.rights.attributionRequired
      || asset.width !== 2048 || asset.height !== 1152 || asset.review.method !== "full-image"
      || asset.review.status !== "usable") throw new TypeError("번들 완성 배경의 검수·권리 기록이 올바르지 않습니다.");
    return Object.freeze({
      ...asset,
      environment: asset.environment === "실내" ? "실내" : "실외",
      timeOfDay: asset.timeOfDay === "밤" ? "밤" : asset.timeOfDay === "노을" ? "노을" : "낮",
      review: { ...asset.review, method: "full-image", status: "usable" },
      provenance: { ...asset.provenance, kind: "creator-bundle-cc0", licenseStatus: "cc0-verified" },
      mediaType: "image/webp", style: "stylized-low-poly", legacySrc: null,
    });
  }),
);

export const STUDIO_BUNDLE_BG_SCENES: readonly Studio2dScene[] = Object.freeze(
  manifest.assets.map((asset) => Object.freeze({
    id: asset.id, label: asset.label, genre: asset.genre, imgSrc: asset.src, width: asset.width, height: asset.height,
    bundleSourceCredit: requireStudioBundleSourceCredit({
      schema: "toonstudio.bundle-source-credit.v1", assetId: asset.id, ledgerPackId: asset.rights.ledgerPackId,
      contentHash: `sha256:${asset.sha256}`, sourceUrl: asset.provenance.sourceUrl,
      renderPath: asset.src,
      provider: asset.provenance.provider, licenseId: asset.provenance.licenseId,
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", licenseName: asset.rights.licenseName,
      serve: asset.rights.serve, status: asset.rights.status,
      commercialUse: asset.rights.commercialUse, attributionRequired: asset.rights.attributionRequired,
    }),
  })),
);

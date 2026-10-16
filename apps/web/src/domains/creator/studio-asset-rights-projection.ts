import { panelImportRightsAssetId, parsePanelImportRights } from "./panel-detect/panel-import-rights";

import type { StudioAssetRightsUsageInput } from "./studio-asset-rights-manifest";
import type { El } from "./studio-element-model";

export interface StudioAssetRightsProjectionPage {
  readonly id: string;
  readonly elements: readonly El[];
}

function imageUsage(
  pageId: string,
  element: Extract<El, { type: "image" }>
): StudioAssetRightsUsageInput {
  const placement = { pageId, elementId: element.id };
  const community = element.communityAssetCredit;
  if (community) {
    return {
      ...placement,
      assetId: community.assetId,
      source: { kind: "community", id: community.assetId },
      licenseId: community.licenseId,
      licenseLabel: community.licenseLabel,
      licenseUrl: community.licenseUrl,
      attributionRequired: community.attributionRequired,
      attributionText: community.attributionText || community.authorName,
      commercialUse: community.commercialUse,
      aiTraining: "unknown",
      redistribution: "prohibited",
      expiresAt: null,
      scope: ["current-work", "commercial-publication"],
    };
  }
  if (element.builtinRasterAssetId) {
    return {
      ...placement,
      assetId: element.builtinRasterAssetId,
      source: { kind: "builtin", id: element.builtinRasterAssetId },
      licenseId: "toonspectrum-standard",
      attributionRequired: false,
      commercialUse: true,
      aiTraining: "unknown",
      redistribution: "prohibited",
      expiresAt: null,
      scope: ["current-work", "commercial-publication"],
    };
  }
  const stock = element.stockImageCredit;
  if (stock) {
    return {
      ...placement,
      assetId: `unsplash:${stock.unsplashPhotoPageUrl}`,
      source: { kind: "external", id: stock.unsplashPhotoPageUrl },
      licenseId: "custom",
      licenseLabel: "Unsplash License",
      licenseUrl: "https://unsplash.com/license",
      attributionRequired: true,
      attributionText: `${stock.photographerName} · ${stock.photographerProfileUrl}`,
      commercialUse: "allowed",
      aiTraining: "unknown",
      redistribution: "prohibited",
      expiresAt: null,
      scope: ["current-work", "commercial-publication"],
    };
  }
  if (element.aiProvenance) {
    return {
      ...placement,
      assetId: `ai:${element.id}`,
      source: {
        kind: "ai-generated",
        id: `${element.aiProvenance.provider}:${element.aiProvenance.model}`,
      },
      licenseId: "unknown",
      commercialUse: "unknown",
      aiTraining: "unknown",
      redistribution: "unknown",
      scope: ["current-work", "commercial-publication"],
    };
  }
  if (element.bg3dScene || element.vrmScene) {
    return {
      ...placement,
      assetId: `3d:${element.id}`,
      source: { kind: "3d-library", id: element.id },
      licenseId: "unknown",
      commercialUse: "unknown",
      aiTraining: "unknown",
      redistribution: "unknown",
      scope: ["current-work", "commercial-publication"],
    };
  }
  // 컷 자동 감지 가져오기: 사용자가 "권리를 가졌거나 이용 허락을 받은 원고"라고 확인한 기록이 있으면 사용권을
  // 알 수 없음(unknown)이 아니라 사용자 확인(custom)으로 올린다. 이 확인은 허락 범위(상업 게시 포함)·만료·AI 학습·재배포를
  // 알려 주지 않으므로 그 값은 unknown 으로, 사용 범위도 다른 분기와 같게 둔다 — 범위를 좁히면 상업 게시 허용 여부가 확인되지
  // 않았다는 오류(COMMERCIAL_USE_UNKNOWN)가 조용히 사라진다.
  const attested = parsePanelImportRights(element.sourceRights);
  if (attested) {
    return {
      ...placement,
      assetId: panelImportRightsAssetId(attested),
      assetVersion: `sha256:${attested.source.sha256}`,
      source: { kind: "local-upload", id: attested.source.sha256.slice(0, 24) },
      licenseId: "custom",
      licenseLabel: "사용자 확인: 직접 권리 보유 또는 이용 허락",
      commercialUse: "unknown",
      aiTraining: "unknown",
      redistribution: "unknown",
      scope: ["current-work", "commercial-publication"],
    };
  }
  return {
    ...placement,
    assetId: `local:${element.id}`,
    source: { kind: "local-upload", id: element.id },
    licenseId: "unknown",
    commercialUse: "unknown",
    aiTraining: "unknown",
    redistribution: "unknown",
    scope: ["current-work", "commercial-publication"],
  };
}

/**
 * Projects only placed raster assets. Vector text, bubbles, brush strokes and frames are authored
 * document content, so treating them as third-party assets would create false licensing alarms.
 */
export function projectStudioAssetRightsUsages(
  pages: readonly StudioAssetRightsProjectionPage[]
): StudioAssetRightsUsageInput[] {
  return pages.flatMap((page) =>
    page.elements.flatMap((element) =>
      element.type === "image" ? [imageUsage(page.id, element)] : []
    )
  );
}

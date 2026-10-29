import type { SiteRouteVisualKind } from "@/shared/lib/site-route-visual";
import { SITE_ART_CARDS } from "./site-art-cards-data";

export type SiteDesignDomain =
  | "workflow"
  | "create"
  | "planning"
  | "spatial"
  | "production"
  | "discover"
  | "learn"
  | "market"
  | "community"
  | "showcase"
  | "manage"
  | "play"
  | "trust"
  | "workspace"
  | "admin";

export type ContextualSubNavGroupId =
  | "discover"
  | "create"
  | "production"
  | "ecosystem"
  | "academy"
  | "personal";

export type IllustratedBoardId =
  | "board-01-discovery-universe"
  | "board-02-creative-studio"
  | "board-03-ecosystem-academy"
  | "board-04-personal-trust-play";

export type SiteArtCardId =
  | "nb-discover-spotlight"
  | "nb-explore-spectrum"
  | "nb-ranking-constellation"
  | "nb-library-archive"
  | "nb-create-canvas"
  | "nb-planning-storylab"
  | "nb-spatial-stage"
  | "nb-production-control"
  | "nb-market-atelier"
  | "nb-learn-academy"
  | "nb-community-plaza"
  | "nb-showcase-premiere"
  | "nb-workflow-bridge"
  | "nb-manage-vault"
  | "nb-play-fortune"
  | "nb-trust-sanctuary";

export interface SiteArtLocalizedCopy {
  readonly ko: string;
  readonly en: string;
}

export interface SiteArtInteractiveLens {
  readonly id: "curation" | "workflow" | "recipe";
  readonly previewCardId?: SiteArtCardId;
  readonly label: SiteArtLocalizedCopy;
  readonly headline: SiteArtLocalizedCopy;
  readonly detail: SiteArtLocalizedCopy;
  readonly promptSeed: SiteArtLocalizedCopy;
  readonly ctaLabel: SiteArtLocalizedCopy;
  readonly ctaHref: string;
}

export interface SiteArtCardSpec {
  readonly cardId: SiteArtCardId;
  readonly boardId: IllustratedBoardId;
  readonly domain: SiteDesignDomain;
  readonly routeVisual: SiteRouteVisualKind;
  readonly src640: string;
  readonly src320: string;
  readonly srcSet: string;
  readonly accentHex: string;
  readonly secondaryHex: string;
  readonly stageBadge: SiteArtLocalizedCopy;
  readonly atelierModelLabel: string;
  readonly title: SiteArtLocalizedCopy;
  readonly subtitle: SiteArtLocalizedCopy;
  readonly quickChips: readonly SiteArtLocalizedCopy[];
  readonly lenses: readonly [
    SiteArtInteractiveLens,
    SiteArtInteractiveLens,
    SiteArtInteractiveLens,
  ];
}

export { SITE_ART_CARDS };

export const ILLUSTRATED_SITE_CARD_LIST: readonly SiteArtCardSpec[] =
  Object.values(SITE_ART_CARDS);

const DOMAIN_TO_CARD_ID: Readonly<Record<SiteDesignDomain, SiteArtCardId>> = {
  workflow: "nb-workflow-bridge",
  create: "nb-create-canvas",
  planning: "nb-planning-storylab",
  spatial: "nb-spatial-stage",
  production: "nb-production-control",
  discover: "nb-discover-spotlight",
  learn: "nb-learn-academy",
  market: "nb-market-atelier",
  community: "nb-community-plaza",
  showcase: "nb-showcase-premiere",
  manage: "nb-manage-vault",
  play: "nb-play-fortune",
  trust: "nb-trust-sanctuary",
  workspace: "nb-create-canvas",
  admin: "nb-production-control",
};

const ROUTE_VISUAL_TO_CARD_ID: Readonly<Record<SiteRouteVisualKind, SiteArtCardId>> = {
  workflow: "nb-workflow-bridge",
  discover: "nb-discover-spotlight",
  create: "nb-create-canvas",
  planning: "nb-planning-storylab",
  spatial: "nb-spatial-stage",
  assets: "nb-market-atelier",
  production: "nb-production-control",
  review: "nb-production-control",
  publish: "nb-showcase-premiere",
  learn: "nb-learn-academy",
  connect: "nb-community-plaza",
  manage: "nb-manage-vault",
  trust: "nb-trust-sanctuary",
  play: "nb-play-fortune",
};

const SUBNAV_GROUP_TO_CARD_ID: Readonly<Record<ContextualSubNavGroupId, SiteArtCardId>> = {
  discover: "nb-discover-spotlight",
  create: "nb-create-canvas",
  production: "nb-production-control",
  ecosystem: "nb-market-atelier",
  academy: "nb-learn-academy",
  personal: "nb-manage-vault",
};

export function getSiteArtCard(cardId: SiteArtCardId): SiteArtCardSpec {
  return SITE_ART_CARDS[cardId];
}

export function resolveIllustratedCardForDomain(domain: SiteDesignDomain): SiteArtCardSpec {
  return SITE_ART_CARDS[DOMAIN_TO_CARD_ID[domain] ?? "nb-workflow-bridge"];
}

export function resolveIllustratedCardForRouteVisual(
  kind: SiteRouteVisualKind,
): SiteArtCardSpec {
  return SITE_ART_CARDS[ROUTE_VISUAL_TO_CARD_ID[kind] ?? "nb-workflow-bridge"];
}

export function resolveIllustratedCardForSubNavGroup(
  groupId: ContextualSubNavGroupId,
): SiteArtCardSpec {
  return SITE_ART_CARDS[SUBNAV_GROUP_TO_CARD_ID[groupId] ?? "nb-workflow-bridge"];
}

export function resolveSiteArtCardForPath(pathname: string): SiteArtCardSpec {
  const clean = (pathname.split(/[?#]/, 1)[0] || "/").toLowerCase();

  if (clean === "/" || clean.startsWith("/workflow")) {
    return SITE_ART_CARDS["nb-workflow-bridge"];
  }
  if (clean.startsWith("/explore") || clean.startsWith("/genres") || clean.startsWith("/search")) {
    return SITE_ART_CARDS["nb-explore-spectrum"];
  }
  if (clean.startsWith("/ranking") || clean.startsWith("/calendar") || clean.startsWith("/schedule")) {
    return SITE_ART_CARDS["nb-ranking-constellation"];
  }
  if (clean.startsWith("/library") || clean.startsWith("/bookmarks") || clean.startsWith("/history")) {
    return SITE_ART_CARDS["nb-library-archive"];
  }
  if (clean.startsWith("/discover") || clean.startsWith("/webtoon") || clean.startsWith("/series")) {
    return SITE_ART_CARDS["nb-discover-spotlight"];
  }
  if (clean.startsWith("/story-lab") || clean.startsWith("/novel") || clean.startsWith("/planning")) {
    return SITE_ART_CARDS["nb-planning-storylab"];
  }
  if (clean.startsWith("/studio/3d") || clean.startsWith("/world") || clean.startsWith("/spatial")) {
    return SITE_ART_CARDS["nb-spatial-stage"];
  }
  if (
    clean.startsWith("/production") ||
    clean.startsWith("/quality") ||
    clean.startsWith("/ops") ||
    clean.startsWith("/publish")
  ) {
    return SITE_ART_CARDS["nb-production-control"];
  }
  if (clean.startsWith("/create") || clean.startsWith("/studio")) {
    return SITE_ART_CARDS["nb-create-canvas"];
  }
  if (clean.startsWith("/market") || clean.startsWith("/asset-fit") || clean.startsWith("/goods")) {
    return SITE_ART_CARDS["nb-market-atelier"];
  }
  if (
    clean.startsWith("/learn") ||
    clean.startsWith("/trace") ||
    clean.startsWith("/academy") ||
    clean.startsWith("/encyclopedia") ||
    clean.startsWith("/cliche")
  ) {
    return SITE_ART_CARDS["nb-learn-academy"];
  }
  if (clean.startsWith("/community") || clean.startsWith("/league") || clean.startsWith("/cafe")) {
    return SITE_ART_CARDS["nb-community-plaza"];
  }
  if (clean.startsWith("/showcase") || clean.startsWith("/collab")) {
    return SITE_ART_CARDS["nb-showcase-premiere"];
  }
  if (
    clean.startsWith("/my-space") ||
    clean.startsWith("/me") ||
    clean.startsWith("/creator") ||
    clean.startsWith("/onboarding")
  ) {
    return SITE_ART_CARDS["nb-manage-vault"];
  }
  if (clean.startsWith("/play") || clean.startsWith("/fortune") || clean.startsWith("/cut-play")) {
    return SITE_ART_CARDS["nb-play-fortune"];
  }
  if (
    clean.startsWith("/pricing") ||
    clean.startsWith("/security") ||
    clean.startsWith("/accessibility") ||
    clean.startsWith("/trust") ||
    clean.startsWith("/terms") ||
    clean.startsWith("/privacy")
  ) {
    return SITE_ART_CARDS["nb-trust-sanctuary"];
  }

  if (clean.startsWith("/admin")) {
    return SITE_ART_CARDS["nb-production-control"];
  }

  return SITE_ART_CARDS["nb-workflow-bridge"];
}

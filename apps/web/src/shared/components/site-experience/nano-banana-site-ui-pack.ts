import type { SiteRouteVisualKind } from "@/shared/lib/site-route-visual";
import { NANO_BANANA_SITE_CARDS } from "./nano-banana-site-cards-data";

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

export type NanoBananaBoardId =
  | "board-01-discovery-universe"
  | "board-02-creative-studio"
  | "board-03-ecosystem-academy"
  | "board-04-personal-trust-play";

export type NanoBananaCardId =
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

export interface NanoBananaLocalizedCopy {
  readonly ko: string;
  readonly en: string;
}

export interface NanoBananaInteractiveLens {
  readonly id: "curation" | "workflow" | "recipe";
  readonly previewCardId?: NanoBananaCardId;
  readonly label: NanoBananaLocalizedCopy;
  readonly headline: NanoBananaLocalizedCopy;
  readonly detail: NanoBananaLocalizedCopy;
  readonly promptSeed: NanoBananaLocalizedCopy;
  readonly ctaLabel: NanoBananaLocalizedCopy;
  readonly ctaHref: string;
}

export interface NanoBananaSiteCardSpec {
  readonly cardId: NanoBananaCardId;
  readonly boardId: NanoBananaBoardId;
  readonly domain: SiteDesignDomain;
  readonly routeVisual: SiteRouteVisualKind;
  readonly src640: string;
  readonly src320: string;
  readonly srcSet: string;
  readonly accentHex: string;
  readonly secondaryHex: string;
  readonly stageBadge: NanoBananaLocalizedCopy;
  readonly atelierModelLabel: string;
  readonly title: NanoBananaLocalizedCopy;
  readonly subtitle: NanoBananaLocalizedCopy;
  readonly quickChips: readonly NanoBananaLocalizedCopy[];
  readonly lenses: readonly [
    NanoBananaInteractiveLens,
    NanoBananaInteractiveLens,
    NanoBananaInteractiveLens,
  ];
}

export { NANO_BANANA_SITE_CARDS };

export const NANO_BANANA_SITE_CARD_LIST: readonly NanoBananaSiteCardSpec[] =
  Object.values(NANO_BANANA_SITE_CARDS);

const DOMAIN_TO_CARD_ID: Readonly<Record<SiteDesignDomain, NanoBananaCardId>> = {
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

const ROUTE_VISUAL_TO_CARD_ID: Readonly<Record<SiteRouteVisualKind, NanoBananaCardId>> = {
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

const SUBNAV_GROUP_TO_CARD_ID: Readonly<Record<ContextualSubNavGroupId, NanoBananaCardId>> = {
  discover: "nb-discover-spotlight",
  create: "nb-create-canvas",
  production: "nb-production-control",
  ecosystem: "nb-market-atelier",
  academy: "nb-learn-academy",
  personal: "nb-manage-vault",
};

export function getNanoBananaSiteCard(cardId: NanoBananaCardId): NanoBananaSiteCardSpec {
  return NANO_BANANA_SITE_CARDS[cardId];
}

export function resolveNanoBananaCardForDomain(domain: SiteDesignDomain): NanoBananaSiteCardSpec {
  return NANO_BANANA_SITE_CARDS[DOMAIN_TO_CARD_ID[domain] ?? "nb-workflow-bridge"];
}

export function resolveNanoBananaCardForRouteVisual(
  kind: SiteRouteVisualKind,
): NanoBananaSiteCardSpec {
  return NANO_BANANA_SITE_CARDS[ROUTE_VISUAL_TO_CARD_ID[kind] ?? "nb-workflow-bridge"];
}

export function resolveNanoBananaCardForSubNavGroup(
  groupId: ContextualSubNavGroupId,
): NanoBananaSiteCardSpec {
  return NANO_BANANA_SITE_CARDS[SUBNAV_GROUP_TO_CARD_ID[groupId] ?? "nb-workflow-bridge"];
}

export function resolveNanoBananaCardForPath(pathname: string): NanoBananaSiteCardSpec {
  const clean = (pathname.split(/[?#]/, 1)[0] || "/").toLowerCase();

  if (clean === "/" || clean.startsWith("/workflow")) {
    return NANO_BANANA_SITE_CARDS["nb-workflow-bridge"];
  }
  if (clean.startsWith("/explore") || clean.startsWith("/genres") || clean.startsWith("/search")) {
    return NANO_BANANA_SITE_CARDS["nb-explore-spectrum"];
  }
  if (clean.startsWith("/ranking") || clean.startsWith("/calendar") || clean.startsWith("/schedule")) {
    return NANO_BANANA_SITE_CARDS["nb-ranking-constellation"];
  }
  if (clean.startsWith("/library") || clean.startsWith("/bookmarks") || clean.startsWith("/history")) {
    return NANO_BANANA_SITE_CARDS["nb-library-archive"];
  }
  if (clean.startsWith("/discover") || clean.startsWith("/webtoon") || clean.startsWith("/series")) {
    return NANO_BANANA_SITE_CARDS["nb-discover-spotlight"];
  }
  if (clean.startsWith("/story-lab") || clean.startsWith("/novel") || clean.startsWith("/planning")) {
    return NANO_BANANA_SITE_CARDS["nb-planning-storylab"];
  }
  if (clean.startsWith("/studio/3d") || clean.startsWith("/world") || clean.startsWith("/spatial")) {
    return NANO_BANANA_SITE_CARDS["nb-spatial-stage"];
  }
  if (
    clean.startsWith("/production") ||
    clean.startsWith("/quality") ||
    clean.startsWith("/ops") ||
    clean.startsWith("/publish")
  ) {
    return NANO_BANANA_SITE_CARDS["nb-production-control"];
  }
  if (clean.startsWith("/create") || clean.startsWith("/studio")) {
    return NANO_BANANA_SITE_CARDS["nb-create-canvas"];
  }
  if (clean.startsWith("/market") || clean.startsWith("/asset-fit") || clean.startsWith("/goods")) {
    return NANO_BANANA_SITE_CARDS["nb-market-atelier"];
  }
  if (
    clean.startsWith("/learn") ||
    clean.startsWith("/trace") ||
    clean.startsWith("/academy") ||
    clean.startsWith("/encyclopedia") ||
    clean.startsWith("/cliche")
  ) {
    return NANO_BANANA_SITE_CARDS["nb-learn-academy"];
  }
  if (clean.startsWith("/community") || clean.startsWith("/league") || clean.startsWith("/cafe")) {
    return NANO_BANANA_SITE_CARDS["nb-community-plaza"];
  }
  if (clean.startsWith("/showcase") || clean.startsWith("/collab")) {
    return NANO_BANANA_SITE_CARDS["nb-showcase-premiere"];
  }
  if (
    clean.startsWith("/my-space") ||
    clean.startsWith("/me") ||
    clean.startsWith("/creator") ||
    clean.startsWith("/onboarding")
  ) {
    return NANO_BANANA_SITE_CARDS["nb-manage-vault"];
  }
  if (clean.startsWith("/play") || clean.startsWith("/fortune") || clean.startsWith("/cut-play")) {
    return NANO_BANANA_SITE_CARDS["nb-play-fortune"];
  }
  if (
    clean.startsWith("/pricing") ||
    clean.startsWith("/security") ||
    clean.startsWith("/accessibility") ||
    clean.startsWith("/trust") ||
    clean.startsWith("/terms") ||
    clean.startsWith("/privacy")
  ) {
    return NANO_BANANA_SITE_CARDS["nb-trust-sanctuary"];
  }

  if (clean.startsWith("/admin")) {
    return NANO_BANANA_SITE_CARDS["nb-production-control"];
  }

  return NANO_BANANA_SITE_CARDS["nb-workflow-bridge"];
}

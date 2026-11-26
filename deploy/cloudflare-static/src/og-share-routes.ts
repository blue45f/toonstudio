import { parsePublicSharePath } from "../../../packages/core/src/public-share-path";

function hasExactlyOneEncodedSegment(
  pathname: string,
  prefix: string,
): boolean {
  if (!pathname.startsWith(prefix)) return false;
  const segment = pathname.slice(prefix.length);
  return segment.length > 0 && !segment.includes("/");
}

function isCreatorWorkOgPath(pathname: string): boolean {
  if (!hasExactlyOneEncodedSegment(pathname, "/create/")) return false;
  const segment = pathname.slice("/create/".length);
  return segment !== "challenges" && segment !== "promo";
}

function isCollaborationOgPath(pathname: string): boolean {
  if (!hasExactlyOneEncodedSegment(pathname, "/collaborate/")) return false;
  const segment = pathname.slice("/collaborate/".length);
  return segment !== "new" && segment !== "moderation";
}

function isPromotionOgPath(pathname: string): boolean {
  if (!hasExactlyOneEncodedSegment(pathname, "/community/promote/")) return false;
  const segment = pathname.slice("/community/promote/".length);
  return segment !== "new" && segment !== "moderation";
}

export function isOgPagePath(pathname: string): boolean {
  return hasExactlyOneEncodedSegment(pathname, "/title/")
    || pathname === "/market"
    || pathname === "/market/browse"
    || hasExactlyOneEncodedSegment(pathname, "/market/resource/")
    || isCreatorWorkOgPath(pathname)
    || hasExactlyOneEncodedSegment(pathname, "/create/series/")
    || hasExactlyOneEncodedSegment(pathname, "/showcase/work/")
    || hasExactlyOneEncodedSegment(pathname, "/showcase/series/")
    || hasExactlyOneEncodedSegment(pathname, "/u/")
    || hasExactlyOneEncodedSegment(pathname, "/author/")
    || hasExactlyOneEncodedSegment(pathname, "/community/post/")
    || hasExactlyOneEncodedSegment(pathname, "/community/cafes/")
    || hasExactlyOneEncodedSegment(pathname, "/pencafe/")
    || isCollaborationOgPath(pathname)
    || isPromotionOgPath(pathname)
    || pathname === "/ranking"
    || pathname === "/play";
}

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function mappedSegment(
  pathname: string,
  prefix: string,
  key: string,
): URLSearchParams | null {
  if (!hasExactlyOneEncodedSegment(pathname, prefix)) return null;
  const value = decodePathSegment(pathname.slice(prefix.length));
  return value ? new URLSearchParams({ [key]: value }) : null;
}

export function mapDynamicPath(requestUrl: URL): URLSearchParams | null {
  const { pathname } = requestUrl;
  if (pathname === "/market") {
    return new URLSearchParams({ marketPage: "home" });
  }
  if (pathname === "/market/browse") {
    return new URLSearchParams({ marketPage: "browse" });
  }
  if (pathname === "/ranking" || pathname === "/play") {
    return new URLSearchParams({ staticPage: pathname.slice(1) });
  }
  if (pathname.startsWith("/market/resource/")) {
    return mappedSegment(pathname, "/market/resource/", "marketResourceId");
  }
  if (pathname.startsWith("/title/")) {
    return mappedSegment(pathname, "/title/", "slug");
  }
  if (pathname.startsWith("/create/series/")) {
    return mappedSegment(pathname, "/create/series/", "creatorSeriesId");
  }
  if (pathname.startsWith("/showcase/series/")) {
    return mappedSegment(pathname, "/showcase/series/", "creatorSeriesId");
  }
  if (pathname.startsWith("/showcase/work/")) {
    return mappedSegment(pathname, "/showcase/work/", "creatorWorkId");
  }
  if (isCreatorWorkOgPath(pathname)) {
    return mappedSegment(pathname, "/create/", "creatorWorkId");
  }
  if (pathname.startsWith("/u/")) {
    return mappedSegment(pathname, "/u/", "profileUserId");
  }
  if (pathname.startsWith("/author/")) {
    return mappedSegment(pathname, "/author/", "authorName");
  }
  if (pathname.startsWith("/community/post/")) {
    return mappedSegment(pathname, "/community/post/", "communityPostId");
  }
  if (pathname.startsWith("/community/cafes/")) {
    return mappedSegment(pathname, "/community/cafes/", "communityCafeSlug");
  }
  if (pathname.startsWith("/pencafe/")) {
    return mappedSegment(pathname, "/pencafe/", "pencafeName");
  }
  if (isCollaborationOgPath(pathname)) {
    return mappedSegment(pathname, "/collaborate/", "collaborationPostId");
  }
  if (isPromotionOgPath(pathname)) {
    return mappedSegment(pathname, "/community/promote/", "promotionPostId");
  }
  if (parsePublicSharePath(requestUrl.pathname)) {
    return new URLSearchParams({ publicPath: requestUrl.pathname });
  }
  return null;
}

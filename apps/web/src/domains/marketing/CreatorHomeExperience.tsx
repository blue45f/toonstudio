import { Suspense } from "react";

import { ReferenceCreatorDashboard } from "./ReferenceCreatorDashboard";
import { useCreatorHomeSectionNavigation } from "./use-creator-home-section-navigation";
import { trimTrailingSlashes } from "@/shared/lib/trim-trailing-slashes";
import { useTheme } from "@/shared/lib/theme";
import { usePathname } from "@/shared/navigation/navigation";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { cx } from "@/shared/lib/cx";

import "./studio-introduction.css";
import "./creator-home-spacing.css";

const LazyCreatorStudioIntroduction = lazyRetry(
  () => import("./CreatorStudioIntroduction").then((module) => ({ default: module.CreatorStudioIntroduction })),
  "CreatorStudioIntroduction",
);
const LazyComicIntroHost = lazyRetry(
  () => import("./comic-intro/ComicIntroHost").then((module) => ({ default: module.ComicIntroHost })),
  "ComicIntroHost",
);

/** Public front door. Historical introduction anchors keep their documented destination. */
export function CreatorHomeExperience() {
  useCreatorHomeSectionNavigation();
  const pathname = trimTrailingSlashes(usePathname()).toLowerCase();
  const introduction = pathname === "/about/studio";
  const resolvedTheme = useTheme((state) => state.resolvedTheme);

  return (
    <div
      className={cx("creator-home", !introduction && "creator-experience creator-flagship")}
      data-creator-home="production-first"
      data-creator-experience="all-in-one-studio-v3"
      data-theme-art={resolvedTheme}
      data-product-direction="planning-to-publishing"
      data-home-view={introduction ? "introduction" : "dashboard"}
    >
      {!introduction && <ReferenceCreatorDashboard />}
      {introduction ? (
        <Suspense fallback={null}>
          <LazyCreatorStudioIntroduction />
        </Suspense>
      ) : (
        <Suspense fallback={null}>
          <LazyComicIntroHost />
        </Suspense>
      )}
    </div>
  );
}

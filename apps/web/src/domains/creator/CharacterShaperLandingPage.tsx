import { SITE_URL } from "@toonstudio/core/business";
import { Suspense, useMemo, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";

import {
  CHARACTER_SHAPER_LANDING_PATH,
  characterShaperCanvasLocation,
  probeCharacterShaperWebGl,
} from "./character-shaper/character-shaper-entry";
import { CharacterShaperLandingClosing } from "./character-shaper/landing/CharacterShaperLandingClosing";
import { CharacterShaperLandingFaq } from "./character-shaper/landing/CharacterShaperLandingFaq";
import { CharacterShaperLandingGuide } from "./character-shaper/landing/CharacterShaperLandingGuide";
import { CharacterShaperLandingHero } from "./character-shaper/landing/CharacterShaperLandingHero";
import { CharacterShaperLandingSteps } from "./character-shaper/landing/CharacterShaperLandingSteps";
import { useCharacterShaperEditorEntry } from "./character-shaper/landing/use-character-shaper-editor-entry";

import "./studio-3d-ui/studio-3d-illustrated-chrome.css";

import {
  useDocumentTitle,
  useJsonLd,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { useBilingual, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";

// 캐릭터 셰이퍼 워크벤치 진입(/studio/assets/characters/new, /shaper 별칭).
// 기본 진입과 예전 편집기 링크는 같은 Studio 원고에서 캐릭터를 만들고 배치한다.
// `?guide=1` / `#how-to`로 들어온 사용자는 가이드를 먼저 본다.

const SHAPER_PATH = CHARACTER_SHAPER_LANDING_PATH;

const LazyStudioCharacterShaperUnifiedPanel = lazyRetry(
  () =>
    import("./character-shaper-unified/StudioCharacterShaperUnifiedPanel").then((module) => ({
      default: module.StudioCharacterShaperUnifiedPanel,
    })),
  "StudioCharacterShaperUnifiedPanel",
);

export function CharacterShaperLandingPage() {
  const bt = useBilingual("CharacterShaperLandingPage");
  const localize = useBilingualLocalizer("CharacterShaperLandingPage");
  const editor = useCharacterShaperEditorEntry();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const guideExplicit =
    searchParams.get("guide") === "1" || location.hash === "#how-to" || (typeof window !== "undefined" && window.location.hash === "#how-to");
  const [dismissedAutoStage, setDismissedAutoStage] = useState(false);
  const [unifiedWorkbenchOpen, setUnifiedWorkbenchOpen] = useState(false);

  const webglStatus = useMemo(() => {
    if (editor.editorOpen || editor.webglBlocked || guideExplicit || dismissedAutoStage) return null;
    return probeCharacterShaperWebGl();
  }, [dismissedAutoStage, editor.editorOpen, editor.webglBlocked, guideExplicit]);

  const autoStageOpen =
    !guideExplicit && !dismissedAutoStage && !editor.webglBlocked && webglStatus === "supported";
  const showEditor = editor.editorOpen || autoStageOpen;

  const handleCloseEditor = () => {
    setDismissedAutoStage(true);
    editor.close();
  };

  const shaperTitle = bt("캐릭터 셰이퍼", "Character Shaper");
  const shaperDescription = bt(
    "프리셋으로 3D 웹툰 캐릭터를 만들고, 사진·웹캠으로 포즈를 잡고, 모델 위에 직접 그려 투명 PNG와 레이어 PSD로 컷에 넣는 브라우저 도구입니다. 설치 없이 스튜디오에서 바로 엽니다.",
    "Create 3D webtoon characters from presets, pose them with photos or a webcam, draw directly on the model, and drop them into your panels as transparent PNGs and layered PSDs — right in the studio, no installation.",
  );
  const socialTitle = bt("캐릭터 셰이퍼 · 툰스튜디오", "Character Shaper · ToonStudio");

  useDocumentTitle(shaperTitle);
  useMetaDescription(shaperDescription);
  usePageSocialMeta({
    canonicalPath: SHAPER_PATH,
    title: socialTitle,
    description: shaperDescription,
  });
  useJsonLd({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: socialTitle,
    url: `${SITE_URL}${SHAPER_PATH}`,
    description: shaperDescription,
    inLanguage: localize("ko", "en"),
    isPartOf: { "@type": "WebSite", name: bt("툰스튜디오", "ToonStudio"), url: SITE_URL },
    mainEntity: {
      "@type": "SoftwareApplication",
      name: shaperTitle,
      applicationCategory: "DesignApplication",
      operatingSystem: "Web",
      browserRequirements: bt("WebGL을 지원하는 최신 브라우저", "A modern browser with WebGL support"),
      url: `${SITE_URL}${SHAPER_PATH}`,
    },
  });

  if (showEditor) return <Navigate replace to={characterShaperCanvasLocation(searchParams)} />;

  return (
    <div className="studio-character-guide">
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <SiteContextualSubNav pathnameOverride="/studio/assets/characters/new" className="mb-4" />
      </div>
      <CharacterShaperLandingHero
        editor={{ ...editor, webglBlocked: editor.webglBlocked || webglStatus === "unsupported", close: handleCloseEditor }}
      />
      <CharacterShaperLandingSteps />
      <CharacterShaperLandingGuide />
      <CharacterShaperLandingFaq />
      <CharacterShaperLandingClosing editor={editor} />

      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
        <details
          data-testid="studio-character-shaper-unified-disclosure"
          className="rounded-2xl border border-line bg-panel p-4"
          onToggle={(event) => setUnifiedWorkbenchOpen(event.currentTarget.open)}
        >
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-fg">
            <span className="min-w-0 [word-break:keep-all]">
              {bt(
                "툰스튜디오 통합 3D 캐릭터 셰이퍼 · 페이지 구조 통합 지도",
                "ToonStudio Unified 3D Character Shaper · Site Page Consolidation Map",
              )}
            </span>
          </summary>
          {unifiedWorkbenchOpen ? (
            <div className="mt-4 border-t border-line pt-4">
              <Suspense
                fallback={
                  <div className="rounded-xl border border-line bg-card p-4 text-xs text-fg-2">
                    {bt(
                      "통합 3D 캐릭터 셰이퍼와 페이지 구조 지도를 불러오는 중입니다.",
                      "Loading the unified 3D character shaper and page consolidation map.",
                    )}
                  </div>
                }
              >
                <LazyStudioCharacterShaperUnifiedPanel />
              </Suspense>
            </div>
          ) : null}
        </details>
      </section>

    </div>
  );
}

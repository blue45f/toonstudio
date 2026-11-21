import { SITE_URL } from "@toonstudio/core/business";
import { Suspense, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import { CharacterShaperEditorLoading } from "./character-shaper/CharacterShaperEditorLoading";
import {
  CHARACTER_SHAPER_LANDING_PATH,
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
// 기본 진입 시 마케팅 랜딩 게이트를 두지 않고 WebGL 지원 환경이면 인터랙티브 3D 편집기를 즉시 마운트한다.
// 사용 가이드·FAQ·단축키 안내가 필요할 때는 편집기를 닫거나 `?guide=1` / `#how-to`로 진입해 확인한다.

const SHAPER_PATH = CHARACTER_SHAPER_LANDING_PATH;

const CharacterShaperStandaloneEditor = lazyRetry(
  () => import("./character-shaper/CharacterShaperStandaloneEditor").then((module) => ({
    default: module.CharacterShaperStandaloneEditor,
  })),
  "CharacterShaperStandaloneEditor",
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

  return (
    <div className="studio-character-guide">
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <SiteContextualSubNav pathnameOverride="/studio/assets/characters/new" className="mb-4" />
      </div>
      <CharacterShaperLandingHero
        editor={
          webglStatus === "unsupported" && !editor.webglBlocked
            ? { ...editor, webglBlocked: true, close: handleCloseEditor }
            : editor
        }
      />
      <CharacterShaperLandingSteps />
      <CharacterShaperLandingGuide />
      <CharacterShaperLandingFaq />
      <CharacterShaperLandingClosing editor={editor} />

      {showEditor ? (
        <Suspense fallback={<CharacterShaperEditorLoading />}>
          <CharacterShaperStandaloneEditor onClose={handleCloseEditor} />
        </Suspense>
      ) : null}
    </div>
  );
}

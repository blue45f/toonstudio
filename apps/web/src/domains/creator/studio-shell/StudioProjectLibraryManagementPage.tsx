import { Suspense } from "react";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import Link from "@/shared/navigation/router-link";

import { StudioCreatorLobby } from "./StudioCreatorLobby";
import { StudioProjectLibraryManagementContent } from "./StudioProjectLibraryManagementContent";
import { StudioProjectLibraryManagementDialogs } from "./StudioProjectLibraryManagementDialogs";
import { StudioProjectLibraryManagementHeader } from "./StudioProjectLibraryManagementHeader";
import { useStudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

import "./studio-visual-identity.css";
import "./studio-visual-identity-v2.css";
import "./studio-illustrated-project-surfaces.css";

// 떠 있는 음성 안내 버튼(음성 합성·자막 모듈)은 목록 첫 화면 뒤에 불러온다.
const VoiceGuideButton = lazyRetry(
  () => import("@/shared/voice").then((module) => ({ default: module.VoiceGuideButton })),
  "StudioLibraryVoiceGuideButton",
);

/**
 * R-3: 개인화 센터는 설정의 "내 직군 · 작업환경"(/settings/role) 단일 진입점으로 이관됐다.
 * 이 딥링크(#role-personalization)는 깨지 않도록 요약과 이동 링크만 남긴다.
 */
function StudioLibraryPersonalizeDetails() {
  const bt = useBilingual("StudioProjectLibraryManagementPage");
  return (
    <details id="role-personalization" className="workspace-library-personalize scroll-mt-28">
      <summary>{bt("작업 방식과 시작 가이드 설정", "Work preferences and getting started")}</summary>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm leading-6 text-fg-2">
          {bt(
            "직군별 빠른 실행 순서·기본 작업공간·알림 수준 같은 작업환경 개인화는 설정의 '내 직군 · 작업환경'으로 모았습니다.",
            "Role-based quick actions, default workspace and notification levels now live under Settings → My role · workspace.",
          )}
        </p>
        <Link href="/settings/role?tab=workspace" className={buttonClass({ variant: "outline", className: "shrink-0" })}>
          {bt("내 직군 · 작업환경에서 바꾸기", "Change in My role · workspace")}
        </Link>
      </div>
    </details>
  );
}

export function StudioProjectLibraryManagementPage() {
  const controller = useStudioProjectLibraryManagementController();
  return (
    <div data-studio-illustrated-surface="library" data-route-ready="studio-project-library" className="studio-visual-identity-page min-h-[calc(100vh-4rem)] min-w-0 bg-bg">
      <Suspense fallback={null}>
        <VoiceGuideButton scriptId="studio" variant="fixed" />
      </Suspense>
      <Container size="wide" className="min-w-0 py-7 sm:py-11">
        {controller.view === "active" ? <StudioCreatorLobby controller={controller} /> : null}
        <StudioProjectLibraryManagementHeader controller={controller} />
        <StudioProjectLibraryManagementContent controller={controller} />
        {controller.view === "active" ? <StudioLibraryPersonalizeDetails /> : null}
      </Container>
      <StudioProjectLibraryManagementDialogs controller={controller} />
    </div>
  );
}

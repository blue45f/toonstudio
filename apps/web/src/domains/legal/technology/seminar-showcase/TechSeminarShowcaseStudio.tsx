/**
 * 기술 세미나 Remotion 모션 도식 + 타 사이트 재사용 실무 레시피 6선 통합 스튜디오.
 *
 * `EngineeringDeckPage.tsx`에서 `React.lazy()` 경계로만 불러와 초기 번들(check:studio-eager-graph)
 * 증가를 0B로 유지하고, 모션 도식 챕터와 실무 레시피 카드 사이의 양방향 점프를 조정한다.
 */

import { useCallback, useRef, useState } from "react";

import { TechSeminarRemotionShowcase } from "./TechSeminarRemotionShowcase";
import { TechSeminarReusableCodePanel } from "./TechSeminarReusableCodePanel";
import type {
  TechSeminarChapterId,
  TechSeminarLinkedRecipeId,
} from "./tech-seminar-remotion-data";

function scrollElementIntoViewRespectingMotion(element: HTMLElement | null): void {
  if (!element || typeof element.scrollIntoView !== "function") return;
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
}

export function TechSeminarShowcaseStudio() {
  const remotionRef = useRef<HTMLDivElement>(null);
  const recipesRef = useRef<HTMLDivElement>(null);

  const [activeRecipeId, setActiveRecipeId] =
    useState<TechSeminarLinkedRecipeId>("kakao-oauth-unlink");
  const [requestedChapter, setRequestedChapter] = useState<{
    readonly id: TechSeminarChapterId;
    readonly nonce: number;
  } | null>(null);

  const handleSelectRecipeFromMotion = useCallback((recipeId: TechSeminarLinkedRecipeId) => {
    setActiveRecipeId(recipeId);
    scrollElementIntoViewRespectingMotion(recipesRef.current);
  }, []);

  const handleJumpToMotionChapter = useCallback((chapterId: TechSeminarChapterId) => {
    setRequestedChapter((prev) => ({ id: chapterId, nonce: (prev?.nonce ?? 0) + 1 }));
    scrollElementIntoViewRespectingMotion(remotionRef.current);
  }, []);

  return (
    <section
      id="tech-seminar-showcase-studio"
      aria-labelledby="tech-seminar-showcase-heading"
      data-tech-seminar-showcase-studio="true"
      className="mt-12 grid gap-8"
    >
      <header className="grid gap-2.5 border-t border-line/75 pt-10">
        <p className="eyebrow text-accent">INTERACTIVE SEMINAR STUDIO</p>
        <h2
          id="tech-seminar-showcase-heading"
          className="text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl"
        >
          Remotion 모션 도식 플레이어 &amp; 타 사이트 실무 재사용 레시피 6선
        </h2>
        <p className="max-w-4xl break-keep text-sm leading-7 text-fg-2">
          발표 현장에서는 위쪽 모션 도식으로 전체 데이터 흐름을 1분 안에 짚어 주고, Q&amp;A나 코드
          리뷰 시간에는 아래 실무 레시피 6선에서 실제 ToonStudio 소스·API 명세·3단계 도입 절차를
          바로 복사해 공유할 수 있습니다.
        </p>
      </header>

      <div ref={remotionRef} className="scroll-mt-24">
        <TechSeminarRemotionShowcase
          requestedChapter={requestedChapter}
          onSelectRecipe={handleSelectRecipeFromMotion}
        />
      </div>

      <div ref={recipesRef} className="scroll-mt-24">
        <TechSeminarReusableCodePanel
          activeRecipeId={activeRecipeId}
          onSelectRecipeId={setActiveRecipeId}
          onJumpToMotionChapter={handleJumpToMotionChapter}
        />
      </div>
    </section>
  );
}

export default TechSeminarShowcaseStudio;

import { LearnSectionShell } from "@/domains/learn/public/learn-section-shell";
import { RecipesPage } from "@/domains/creator-resources/RecipesPage";

/**
 * 제작 레시피(/learn/recipes) 라우트 요소.
 *
 * 레시피는 /learn 아래에 사는 학습 화면이지만 LearnPage 밖 라우트라, 학습 셸을 라우트 레이어에서
 * 감싼다(셸의 공개 경계는 learn/public 배럴이 소유한다). 셸은 학습 콘텐츠(learning-content)와
 * 진행 모델을 함께 끌어오므로, 이 요소는 라우트 표가 정적으로 import하지 않고
 * creator-resource-pages의 지연 로딩 선언(LearnRecipesRoute)으로만 가져온다 —
 * 셸·학습 콘텐츠·레시피 화면이 한 청크로 묶여 앱 진입 번들에 학습 콘텐츠가 섞이지 않는다.
 */
export function LearnRecipesRoute() {
  return (
    <LearnSectionShell>
      <RecipesPage />
    </LearnSectionShell>
  );
}

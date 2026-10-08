import { EngineeringPageFrame, EngineeringPageIntro } from "./EngineeringStoryUi";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringLibrariesPage", ko, en);

/**
 * 라이브러리 해설 페이지의 뼈대. 라우트·메뉴·사이트맵 연결을 먼저 맞추기 위한 최소 본문이며,
 * 영역별 도식·라이브러리 카드·선택 이유는 이 파일을 확장해 채운다.
 */
export function EngineeringLibrariesPage() {
  useBilingualI18nRevision();
  useDocumentTitle(bi("주요 라이브러리와 선택 이유 · ToonStudio", "Main libraries and why we chose them · ToonStudio"));

  return (
    <EngineeringPageFrame pageId="libraries">
      <EngineeringPageIntro
        pageId="libraries"
        eyebrow="LIBRARIES · WHAT IT IS BUILT WITH, AND WHY"
        title={bi("무엇으로 만들었고, 왜 그것을 골랐나", "What it is built with, and why we chose it")}
        description={bi(
          "브러시 엔진, VRM 캐릭터, 3D, 협업, 저장, AI까지 쓰인 주요 라이브러리를 영역별로 소개하고, 설계와 선택의 이유를 쉬운 말로 풀었습니다.",
          "The main libraries behind the brush engines, VRM characters, 3D, collaboration, storage and AI, area by area, with the reasons behind each design and choice in plain words.",
        )}
      />
    </EngineeringPageFrame>
  );
}

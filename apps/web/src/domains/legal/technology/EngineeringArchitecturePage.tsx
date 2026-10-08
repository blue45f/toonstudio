import { EngineeringArchitectureDiagram } from "./EngineeringArchitectureDiagram";
import { EngineeringPageFrame, EngineeringPageIntro } from "./EngineeringStoryUi";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringArchitecturePage", ko, en);

/**
 * 아키텍처 해설 페이지의 뼈대. 라우트·메뉴·사이트맵 연결을 먼저 맞추기 위한 최소 본문이며,
 * 구간별 도식·배경 지식·한글 요약은 이 파일을 확장해 채운다.
 */
export function EngineeringArchitecturePage() {
  useBilingualI18nRevision();
  useDocumentTitle(bi("아키텍처 해설 · ToonStudio", "Architecture guide · ToonStudio"));

  return (
    <EngineeringPageFrame pageId="architecture">
      <EngineeringPageIntro
        pageId="architecture"
        eyebrow="ARCHITECTURE · THE BIG PICTURE"
        title={bi("한 장으로 보는 ToonStudio 구조", "ToonStudio's structure on one page")}
        description={bi(
          "브라우저, 엣지, 서버, 데이터가 어떻게 맞물리는지 도식으로 먼저 보고, 필요한 배경 지식을 쉬운 말로 풀었습니다.",
          "See how the browser, edge, server and data fit together in diagrams first, then the background you need in plain words.",
        )}
      />
      <div className="rounded-[2rem] border border-line/70 bg-panel/65 p-4 shadow-sm sm:p-6">
        <EngineeringArchitectureDiagram />
      </div>
    </EngineeringPageFrame>
  );
}

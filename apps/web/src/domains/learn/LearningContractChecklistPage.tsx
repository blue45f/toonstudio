import { Link } from "react-router-dom";

import { LazyContractReviewChecklist } from "@/shared/components/contract-review/LazyContractReviewChecklist";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/**
 * 웹툰 계약서 검토 체크리스트 (/learn/contract-checklist).
 *
 * 문화체육관광부 만화 분야 표준계약서와 해설집이 다루는 항목을 작가가 자기 계약서와 대조한다.
 * 법률 자문이 아니다. 체크리스트 본문(항목·출처·저장)은 제작 관리의 계약·정산 화면과 같은
 * 공용 컴포넌트이며, 답은 이 브라우저에만 저장된다.
 */
export function LearningContractChecklistPage() {
  const bt = useBilingual("LearningContractChecklistPage");
  return (
    <section className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-fg sm:px-6 sm:py-10" aria-labelledby="learn-contract-checklist-title">
      <header>
        <p className="text-xs font-bold tracking-[.16em] text-accent">{bt("계약서 읽기", "READING CONTRACTS")}</p>
        <h1 id="learn-contract-checklist-title" className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
          {bt("웹툰 계약서 검토 체크리스트", "Webtoon contract review checklist")}
        </h1>
        <p className="mt-4 text-base leading-8 text-fg-2">
          {bt(
            "서명하기 전에 내 계약서를 문화체육관광부 표준계약서가 다루는 항목과 하나씩 맞춰 보세요. 마감 지연에 따른 금전적 부담, 2차 저작(영상화·게임화) 권리, 수익 배분(RS), 정산 주기, 해지와 권리 반환까지 — 항목마다 표준계약서의 설명과 내 계약서에서 볼 점을 함께 보여 줍니다.",
            "Before you sign, compare your contract item by item with the topics covered by the Ministry of Culture, Sports and Tourism's standard contracts: money owed for late delivery, secondary-works rights (film, games), revenue share (RS), settlement cycle, termination and getting rights back. Each item shows how the standard contract treats it and what to look for in yours.",
          )}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-fg-3">
          {bt("제작 프로젝트의 ‘계약·정산’ 화면에서도 같은 체크리스트를 쓸 수 있고, 답은 두 화면이 함께 써요. ", "The same checklist is available in a production project's “Rights & pay” screen, and both screens share your answers. ")}
          <Link className="text-accent underline underline-offset-2 hover:text-accent-2" to="/production/projects">
            {bt("제작 프로젝트 보기", "Open production projects")}
          </Link>
        </p>
      </header>
      <LazyContractReviewChecklist headingLevel={2} />
    </section>
  );
}

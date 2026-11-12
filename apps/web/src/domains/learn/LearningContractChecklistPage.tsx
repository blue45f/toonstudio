import { useState } from "react";
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
  const [clauseFocus, setClauseFocus] = useState<"mg-recoup-net" | "secondary-ip-split" | "hiatus-welfare">("mg-recoup-net");
  const [rsSplitRatio, setRsSplitRatio] = useState<"70-30" | "60-40" | "50-50">("70-30");
  return (
    <section
      className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-fg sm:px-6 sm:py-10"
      aria-labelledby="learn-contract-checklist-title"
      data-own-control-size=""
    >
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
          <Link
            className="inline-flex min-h-11 items-center rounded text-accent underline underline-offset-2 hover:text-accent-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            to="/production/projects"
          >
            {bt("제작 프로젝트 보기", "Open production projects")}
          </Link>
        </p>
      </header>
      <section
        aria-label={bt("계약 조항과 수익 배분 연습", "Contract and revenue-sharing practice")}
        data-own-control-size=""
        data-testid="contract-rea-mg-rs-simulator"
        className="rounded-2xl border border-line bg-card/85 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-extrabold text-fg">
            {bt("계약에서 확인할 권리와 정산 조건을 비교해 보세요", "Compare rights and payment terms to review in a contract")}
          </span>
          <span data-testid="contract-rea-mg-rs-status" className="rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-accent">
            {clauseFocus === "mg-recoup-net"
              ? bt(`작가:플랫폼 RS ${rsSplitRatio.replace("-", ":")} · 당월 MG 미회수분 이월 금지(비누적 차감) 권장`, `Creator:Platform RS ${rsSplitRatio.replace("-", ":")} · Non-cumulative monthly MG recoupment`)
              : clauseFocus === "secondary-ip-split"
                ? bt(`2차적 저작물(드라마·게임·굿즈) 별도 서면 합의 필수 · 작가 몫 ${rsSplitRatio.split("-")[0]}% 기준`, `Secondary IP (drama/game/merch) requires separate written agreement · Creator ${rsSplitRatio.split("-")[0]}%`)
                : bt(`50화당 유급 건강 휴재권(2~4주) 보장 · 계약 종료/해지 시 전송권 즉시 반환 (${rsSplitRatio.replace("-", ":")})`, `Paid health hiatus (2-4 wks per 50 eps) · Immediate rights reversion on termination (${rsSplitRatio.replace("-", ":")})`)}
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={bt("핵심 계약 조항 시뮬레이션", "Contract clause simulation")}>
            {([
              ["mg-recoup-net", bt("MG 차감 방식 & 총매출(Gross) RS", "MG Recoupment & Gross RS")],
              ["secondary-ip-split", bt("2차적 저작물(영상·게임·굿즈) 별도 합의", "Secondary IP Separate Agreement")],
              ["hiatus-welfare", bt("50화 건강 휴재권 & 해지 시 권리 반환", "50-Ep Health Hiatus & Rights Reversion")],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-testid={`contract-rea-clause-${id}`}
                aria-pressed={clauseFocus === id}
                onClick={() => setClauseFocus(id)}
                className={`inline-flex min-h-11 items-center rounded-lg border px-3.5 py-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${clauseFocus === id ? "border-accent bg-accent text-on-accent" : "border-line bg-panel text-fg-2 hover:border-accent/50"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5" role="group" aria-label={bt("RS 배분 비율", "RS split ratio")}>
            {(["70-30", "60-40", "50-50"] as const).map((ratio) => (
              <button
                key={ratio}
                type="button"
                data-testid={`contract-rea-rs-${ratio}`}
                aria-pressed={rsSplitRatio === ratio}
                onClick={() => setRsSplitRatio(ratio)}
                className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${rsSplitRatio === ratio ? "border-accent bg-accent/15 text-accent" : "border-line bg-panel text-fg-2 hover:border-accent/50"}`}
              >
                {bt(`RS ${ratio.replace("-", ":")}`, `RS ${ratio.replace("-", ":")}`)}
              </button>
            ))}
          </div>
        </div>
      </section>
      <LazyContractReviewChecklist headingLevel={2} />
    </section>
  );
}

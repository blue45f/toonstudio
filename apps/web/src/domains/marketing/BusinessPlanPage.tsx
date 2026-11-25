import { useState } from "react";

import "./ir-interactive-moat.css";

import type { PlanTable } from "./business-plan-data";
import { BUSINESS_PLAN_DOCUMENT_BASIS, BUSINESS_PLAN_SECTIONS, WAVE_IMPLEMENTATION_MILESTONES } from "./business-plan-data";
import { IR_SHARED_VERIFIED_DATE } from "./ir-bizplan-shared-facts";
import { IrInteractiveMoatShowcase } from "./IrInteractiveMoatShowcase";
import {
  IrDefenseQaAccordion,
  IrSoloLicenseIntegrityCard,
  IrVerifiedSnapshotStrip,
} from "./IrQaAndLicenseSection";

import { Container } from "@/shared/components/section";
import { HeroBlock } from "@/shared/components/layout";
import { useDocumentTitle, useMetaDescription } from "@/shared/seo/use-document-title";

/**
 * 사업계획서 페이지 (/business-plan).
 * IR 페이지(/ir, /ir/present)와 같은 마케팅 도메인에 두되, 발표 플레이어가 아니라
 * 2026-11-04 초안의 Q1–Q4와 붙임에 2026-11-22 실측 근거·2026-11-25 웨이브 45~49 구현 마일스톤·
 * 라이브 검증 위젯·심사 방어 Q&A를 통합한 페이지다. 제출용 docx가 아니며, 팀 가격은 미결정,
 * 검증 목표는 결과로 적지 않는다.
 * 표의 “입력 필요” 셀은 단가를 지어내지 않았다는 뜻이지, 빈칸 오류가 아니다.
 */


function PlanTableBlock({ table }: { table: PlanTable }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm text-fg">
        <caption className="border-b border-line bg-panel px-4 py-3 text-left font-bold text-fg">
          {table.caption}
        </caption>
        <thead>
          <tr className="bg-panel/60">
            {table.headers.map((header) => (
              <th key={header} scope="col" className="border-b border-line px-4 py-2.5 align-top font-semibold text-fg">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-line/70 last:border-b-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="break-keep px-4 py-2.5 align-top leading-6 text-fg-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BusinessPlanPage() {
  useDocumentTitle("툰스튜디오 사업계획서 · 웹툰 제작 협업 업무툴");
  useMetaDescription(
    "툰스튜디오 사업계획서: 문제 인식, 실현 가능성, 성장전략, 향후 발전방안(PSST)과 2026-11-22 실측 근거, 2026-11-25 웨이브 45~49 구현 마일스톤, 7밴드 KM 분광·₩0 인프라 라이브 검증을 한 페이지에 정리했다.",
  );
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);

  async function handleDownload(kind: "pdf" | "docx"): Promise<void> {
    setDownloading(kind);
    setDownloadStatus(kind === "pdf" ? "PDF를 만들고 있습니다…" : "DOCX를 만들고 있습니다…");
    try {
      // docx·pdf-lib·폰트킷은 내려받기를 누를 때만 불러와 첫 화면 번들을 키우지 않는다.
      const downloads = await import("./business-plan-download");
      const filename =
        kind === "pdf"
          ? await downloads.downloadBusinessPlanPdf()
          : await downloads.downloadBusinessPlanDocx();
      setDownloadStatus(`${filename} 내려받기를 시작했습니다.`);
    } catch {
      setDownloadStatus("파일을 만들지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-var(--site-header-height,4.25rem))] py-5 sm:py-8 lg:py-10">
      <Container>
        <HeroBlock
          eyebrow="TOONSTUDIO BUSINESS PLAN · PSST"
          title={
            <>
              웹툰 제작 전 과정의
              <br />
              협업 업무툴, 툰스튜디오.
            </>
          }
          lede="기획·콘티·작화·배경·채색·검수·연재를 한 파일·한 화면에서 잇는 방향을, 문제 인식부터 성장전략과 향후 발전방안까지 문항 순서대로 정리했다. 작성자 김희준(1인 예비창업자, 팀 없음), 멘토기관 한국핀테크지원센터."
        />

        <p className="mt-3 text-sm text-fg-2">
          {BUSINESS_PLAN_DOCUMENT_BASIS} · 페이지 라이브 실측 기준일 {IR_SHARED_VERIFIED_DATE} · 웨이브 45~49 구현 동기화 2026-11-25
        </p>

        <section
          aria-labelledby="business-plan-download-title"
          className="ir-print-hide mt-6 rounded-2xl border border-line bg-card p-5 sm:p-6"
        >
          <h2 id="business-plan-download-title" className="text-base font-bold text-fg">
            사업계획서 내려받기 · A4 출력
          </h2>
          <p className="mt-1.5 break-keep text-sm leading-6 text-fg-2">
            이 페이지의 PSST 본문과 같은 내용으로 PDF·DOCX 파일을 내려받는다. 파일은 누를 때
            이 페이지의 데이터 원본에서 바로 만들며, A4·본문 12pt·줄 간격 160%·표 10pt 형식을
            따른다. HWP는 만들 방법이 확인되지 않아 제공하지 않는다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleDownload("pdf")}
              disabled={downloading !== null}
              className="inline-flex min-h-11 items-center rounded-xl border border-accent bg-accent-soft px-4 py-2 text-sm font-bold text-accent transition-colors hover:border-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            >
              PDF로 내려받기
            </button>
            <button
              type="button"
              onClick={() => void handleDownload("docx")}
              disabled={downloading !== null}
              className="inline-flex min-h-11 items-center rounded-xl border border-line bg-panel px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            >
              DOCX로 내려받기
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-11 items-center rounded-xl border border-line bg-panel px-4 py-2 text-sm font-semibold text-fg-2 transition-colors hover:border-accent hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              고대비 인쇄 (A4)
            </button>
          </div>
          {downloadStatus !== null && (
            <p aria-live="polite" className="mt-2.5 text-sm font-medium text-fg-2">
              {downloadStatus}
            </p>
          )}
        </section>

        <nav
          aria-label="사업계획서 문항 바로가기"
          className="ir-print-hide mt-5 flex flex-wrap gap-2"
        >
          {BUSINESS_PLAN_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3.5 py-2 text-sm font-semibold text-fg-2 transition-colors hover:border-accent hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {section.eyebrow}
            </a>
          ))}
          <a
            href="#psst-wave-milestones"
            className="inline-flex min-h-11 items-center rounded-xl border border-accent/50 bg-accent-soft px-3.5 py-2 text-sm font-bold text-accent transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            2026-11-25 구현 마일스톤
          </a>
          <a
            href="#psst-live-proof"
            className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3.5 py-2 text-sm font-semibold text-fg-2 transition-colors hover:border-accent hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            실측 위젯 · 분광·₩0 원가
          </a>
          <a
            href="#psst-defense-qa"
            className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3.5 py-2 text-sm font-semibold text-fg-2 transition-colors hover:border-accent hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            상용 라이선스 · 심사 Q&amp;A
          </a>
          <a
            href="/compare/studio"
            className="inline-flex min-h-11 items-center rounded-xl border border-line bg-panel px-3.5 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            제작 도구 비교 자료
          </a>
        </nav>

        <div className="mt-6 grid gap-5">
          <IrVerifiedSnapshotStrip surface="site" lang="ko" />

          <section
            id="psst-wave-milestones"
            aria-labelledby="psst-wave-milestones-title"
            className="ir-moat-scope ir-moat-card grid gap-4 scroll-mt-24"
            data-surface="site"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="ir-moat-pill" data-tone="current">
                  현재 구현 마일스톤 (2026-11-25 · 웨이브 45~49)
                </span>
                <span className="ir-moat-pill" data-tone="target">
                  운영 매출·고객 검증 목표와 별개
                </span>
              </div>
              <a
                href="/compare/studio"
                className="ir-moat-btn ir-print-hide"
              >
                제작 도구 비교 자료 (/compare/studio)
              </a>
            </div>
            <h2
              id="psst-wave-milestones-title"
              className="break-keep text-lg font-bold text-fg sm:text-xl"
            >
              소스·계산 예제 기록과 남은 검증
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {WAVE_IMPLEMENTATION_MILESTONES.map(({ id, ko: milestone }) => (
                <li key={id} className="ir-moat-subpanel grid content-start gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="break-keep text-sm text-fg">{milestone.title}</strong>
                    <span className="ir-moat-pill" data-tone="current">
                      {milestone.tag}
                    </span>
                  </div>
                  <p className="break-keep text-xs leading-5 text-fg-2">
                    {milestone.detail}
                  </p>
                </li>
              ))}
            </ul>
            <p className="break-keep border-t border-line/70 pt-3 text-xs leading-5 text-fg-2">
              위 항목은 소스·계산 예제 기록입니다. 실제 장면 적용·저장·권한·기기·운영 GPU·보안 검증과 운영 배포를 뜻하지 않습니다. 베타 사용자 수·유료 전환율·매출은 기존 Q3·붙임 표의 가정 및 미달성 목표로 유지합니다.
            </p>
          </section>
        </div>

        {BUSINESS_PLAN_SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-title`}
            className="mt-10 scroll-mt-24 border-t border-line/70 pt-8"
          >
            <p className="text-xs font-bold tracking-wider text-accent">{section.eyebrow}</p>
            <h2 id={`${section.id}-title`} className="mt-1.5 break-keep text-2xl font-bold text-fg">
              {section.title}
            </h2>
            <p className="mt-2.5 max-w-4xl break-keep text-base font-semibold leading-7 text-fg">
              {section.lead}
            </p>
            {section.paragraphs.map((paragraph, index) => (
              <p key={index} className="mt-3 max-w-4xl break-keep text-sm leading-7 text-fg-2">
                {paragraph}
              </p>
            ))}
            {section.bullets.length > 0 && (
              <ul className="mt-3 max-w-4xl list-disc space-y-1.5 pl-5 text-sm leading-6 text-fg-2">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="break-keep">
                    {bullet}
                  </li>
                ))}
              </ul>
            )}
            {section.tables.map((table) => (
              <div key={table.caption} className="mt-6">
                <PlanTableBlock table={table} />
              </div>
            ))}
            {section.note != null && (
              <p className="mt-4 max-w-4xl break-keep rounded-r-xl border-l-2 border-warn bg-panel/60 px-4 py-3 text-sm leading-6 text-fg-2">
                <strong className="text-fg">주의 · </strong>
                {section.note}
              </p>
            )}
          </section>
        ))}

        <section
          id="psst-live-proof"
          aria-labelledby="psst-live-proof-title"
          className="mt-12 scroll-mt-24 border-t border-line/70 pt-8"
        >
          <p className="text-xs font-bold tracking-wider text-accent">
            PSST 실현가능성 · 성장전략 라이브 검증
          </p>
          <h2 id="psst-live-proof-title" className="mt-1.5 break-keep text-2xl font-bold text-fg">
            말로만 적지 않고, 브라우저에서 직접 돌려 보는 기술·원가 근거
          </h2>
          <p className="mt-2 max-w-4xl break-keep text-sm leading-7 text-fg-2">
            Q2(실현가능성)의 자체 WebGPU 7밴드 KM 분광 안료 물리 엔진과 Q3(성장전략)의 브라우저 로컬
            분산·₩0 베타 인프라 원가 구조를 이 화면에서 직접 조작해 확인할 수 있다. 실측값과 가정
            시뮬레이션은 라벨로 엄격히 분리한다.
          </p>
          <div className="mt-5">
            <IrInteractiveMoatShowcase mode="full" surface="site" lang="ko" />
          </div>
        </section>

        <section
          id="psst-defense-qa"
          aria-labelledby="psst-defense-qa-title"
          className="mt-12 scroll-mt-24 border-t border-line/70 pt-8"
        >
          <p className="text-xs font-bold tracking-wider text-accent">
            PSST · VC 심사 방어 &amp; 상용 라이선스 무결성
          </p>
          <h2 id="psst-defense-qa-title" className="mt-1.5 break-keep text-2xl font-bold text-fg">
            1인 기업 상용 준비 실측과 심사위원 5대 핵심 질문 답변
          </h2>
          <div className="mt-5 grid gap-5">
            <IrSoloLicenseIntegrityCard surface="site" lang="ko" />
            <IrDefenseQaAccordion surface="site" lang="ko" />
          </div>
        </section>
      </Container>
    </div>
  );
}

import type { PlanTable } from "./business-plan-data";
import { BUSINESS_PLAN_SECTIONS } from "./business-plan-data";

import { Container } from "@/shared/components/section";
import { HeroBlock } from "@/shared/components/layout";
import { useDocumentTitle, useMetaDescription } from "@/shared/seo/use-document-title";

/**
 * 사업계획서 페이지 (/business-plan).
 * IR 페이지(/ir, /ir/present)와 같은 마케팅 도메인에 두되, 발표 플레이어가 아니라
 * 2026-11-04 고도화 초안 v11의 Q1–Q4와 붙임을 문항 순서대로 읽는 별도 페이지다.
 * 제출용 docx가 아니며, 팀 가격은 미결정, 검증 목표는 결과로 적지 않는다.
 * 표의 “입력 필요” 셀은 단가를 지어내지 않았다는 뜻이지, 빈칸 오류가 아니다.
 */

function PlanTableBlock({ table }: { table: PlanTable }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <caption className="pb-2 text-left font-semibold">{table.caption}</caption>
        <thead>
          <tr>
            {table.headers.map((header) => (
              <th key={header} scope="col" className="border-b px-3 py-2 align-top">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 align-top">
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
    "툰스튜디오 사업계획서: 문제 인식, 실현 가능성, 성장전략, 향후 발전방안을 문항 순서대로 정리한 페이지. 팀 가격은 미결정이며 검증 목표는 결과로 적지 않는다.",
  );

  return (
    <div className="min-h-[calc(100dvh-var(--site-header-height,4.25rem))] py-5 sm:py-8 lg:py-10">
      <Container>
        <HeroBlock
          eyebrow="TOONSTUDIO BUSINESS PLAN"
          title={
            <>
              웹툰 제작 전 과정의
              <br />
              협업 업무툴, 툰스튜디오.
            </>
          }
          lede="기획·콘티·작화·배경·채색·검수·연재를 한 파일·한 화면에서 잇는 방향을, 문제 인식부터 성장전략과 향후 발전방안까지 문항 순서대로 정리했다. 작성자 김희준(1인 예비창업자, 팀 없음), 멘토 정진호, 멘토기관 한국핀테크지원센터."
        />
        <nav aria-label="사업계획서 문항 바로가기" className="mt-6 flex flex-wrap gap-2">
          {BUSINESS_PLAN_SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="rounded-full border px-3 py-1 text-sm">
              {section.eyebrow}
            </a>
          ))}
        </nav>
        {BUSINESS_PLAN_SECTIONS.map((section) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="mt-10 scroll-mt-24">
            <p className="text-sm font-semibold">{section.eyebrow}</p>
            <h2 id={`${section.id}-title`} className="mt-1 text-2xl font-bold">
              {section.title}
            </h2>
            <p className="mt-2">{section.lead}</p>
            {section.paragraphs.map((paragraph, index) => (
              <p key={index} className="mt-3">
                {paragraph}
              </p>
            ))}
            {section.bullets.length > 0 && (
              <ul className="mt-3 list-disc pl-5">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="mt-1">
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
              <p className="mt-4 border-l-2 pl-3 text-sm">
                <strong>주의 · </strong>
                {section.note}
              </p>
            )}
          </section>
        ))}
      </Container>
    </div>
  );
}

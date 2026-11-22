import { useId, useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";

import {
  INVESTOR_DEFENSE_QA,
  IR_SHARED_TARGET_SUMMARY,
  IR_SHARED_VERIFIED_DATE,
  IR_SHARED_VERIFIED_METRICS,
  SOLO_LICENSE_INTEGRITY_CHECKS,
} from "./ir-bizplan-shared-facts";
import type { MoatSurface } from "./IrInteractiveMoatShowcase";

interface SharedPanelProps {
  readonly surface?: MoatSurface;
  readonly lang?: "ko" | "en";
  readonly compact?: boolean;
}

/**
 * 2026-11-22 단일 정본 실측 요약 스트립.
 * 현재 구현·실측(Current)과 협약·검증 목표(Target)를 시각적으로 분리한다.
 */
export function IrVerifiedSnapshotStrip({
  surface = "site",
  lang = "ko",
}: SharedPanelProps) {
  const ko = lang === "ko";

  return (
    <section
      className="ir-moat-scope ir-moat-card grid gap-4"
      data-surface={surface}
      aria-label={ko ? `${IR_SHARED_VERIFIED_DATE} 실측 근거 요약` : `Verified evidence snapshot as of ${IR_SHARED_VERIFIED_DATE}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="ir-moat-pill" data-tone="current">
            {ko ? `현재 구현·실측 (${IR_SHARED_VERIFIED_DATE})` : `Current · Measured (${IR_SHARED_VERIFIED_DATE})`}
          </span>
          <span className="ir-moat-pill" data-tone="target">
            {ko ? "검증 목표 별도 구분" : "Targets Separated"}
          </span>
        </div>
        <span className="text-xs font-semibold" style={{ color: "var(--irm-fg-3)" }}>
          {ko ? "저장소·감사 스크립트·인프라 지도 실측 정본" : "Verified from repo, audit scripts & infra map"}
        </span>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {IR_SHARED_VERIFIED_METRICS.map((metric) => (
          <div key={metric.id} className="ir-moat-subpanel grid content-start gap-1.5">
            <dt className="text-xs font-semibold" style={{ color: "var(--irm-fg-2)" }}>
              {ko ? metric.labelKo : metric.labelEn}
            </dt>
            <dd className="ir-moat-tabular text-2xl font-bold tracking-tight">
              {ko ? metric.valueKo : metric.valueEn}
            </dd>
            <p className="break-keep text-xs leading-5" style={{ color: "var(--irm-fg-2)" }}>
              {ko ? metric.detailKo : metric.detailEn}
            </p>
            <p className="text-xs" style={{ color: "var(--irm-fg-3)" }}>
              {ko ? metric.sourceKo : metric.sourceEn}
            </p>
          </div>
        ))}
      </dl>

      <p
        className="break-keep border-t pt-3 text-xs leading-5"
        style={{ borderColor: "var(--irm-line)", color: "var(--irm-fg-2)" }}
      >
        <strong style={{ color: "var(--irm-warn)" }}>
          [{ko ? "협약·향후 목표 (Target)" : "Target · Not Achieved Yet"}]
        </strong>{" "}
        {ko ? IR_SHARED_TARGET_SUMMARY.ko : IR_SHARED_TARGET_SUMMARY.en}
      </p>
    </section>
  );
}

/** 1인 기업 상용 라이선스 무결성 · 크로스-LLM 거버넌스 점검 카드. */
export function IrSoloLicenseIntegrityCard({
  surface = "site",
  lang = "ko",
  compact = false,
}: SharedPanelProps) {
  const ko = lang === "ko";
  const headingId = useId();

  return (
    <section
      className="ir-moat-scope ir-moat-card grid gap-4"
      data-surface={surface}
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} style={{ color: "var(--irm-good)" }} aria-hidden="true" />
          <h3 id={headingId} className="break-keep text-base font-bold sm:text-lg">
            {ko
              ? "1인 기업 상용 라이선스 무결성 & 크로스-LLM 배포 가드"
              : "Solo Commercial License Integrity & Cross-LLM Deploy Guard"}
          </h3>
        </div>
        <span className="ir-moat-pill" data-tone="current">
          {ko ? `실측 통과 · ${IR_SHARED_VERIFIED_DATE}` : `Audit Passed · ${IR_SHARED_VERIFIED_DATE}`}
        </span>
      </div>

      <ul className={`grid gap-2.5 ${compact ? "sm:grid-cols-2" : "md:grid-cols-2"}`}>
        {SOLO_LICENSE_INTEGRITY_CHECKS.map((item) => (
          <li key={item.id} className="ir-moat-subpanel grid gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="break-keep text-sm">{ko ? item.titleKo : item.titleEn}</strong>
              <span
                className="ir-moat-pill"
                data-tone={item.tone === "good" ? "current" : "target"}
              >
                {ko ? item.statusKo : item.statusEn}
              </span>
            </div>
            <p className="break-keep text-xs leading-5" style={{ color: "var(--irm-fg-2)" }}>
              {ko ? item.detailKo : item.detailEn}
            </p>
          </li>
        ))}
      </ul>

      <p className="break-keep text-xs leading-5" style={{ color: "var(--irm-fg-3)" }}>
        {ko
          ? "배포 매니페스트 정본: deploy/DEPLOY_MANIFEST.json · deploy:doctor -- --json · 파괴적 명령(--attach-db, onpod app rollback, rm) 및 퇴역 인프라 재도입 차단."
          : "Canonical deploy manifest: deploy/DEPLOY_MANIFEST.json · deploy:doctor -- --json · destructive commands (--attach-db, onpod app rollback, rm) and retired infra blocked."}
      </p>
    </section>
  );
}

/** VC 투자자 & PSST 심사위원 5대 핵심 방어 Q&A 아코디언. */
export function IrDefenseQaAccordion({
  surface = "site",
  lang = "ko",
  compact = false,
}: SharedPanelProps) {
  const ko = lang === "ko";
  const baseId = useId();
  const [openIds, setOpenIds] = useState<readonly string[]>([INVESTOR_DEFENSE_QA[0].id]);

  const allOpen = openIds.length === INVESTOR_DEFENSE_QA.length;

  const toggleItem = (id: string) => {
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleAll = () => {
    setOpenIds(allOpen ? [] : INVESTOR_DEFENSE_QA.map((item) => item.id));
  };

  return (
    <section
      className="ir-moat-scope ir-moat-card grid gap-3"
      data-surface={surface}
      aria-labelledby={`${baseId}-title`}
      data-ir-interactive-control="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-0.5">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--irm-accent)" }}>
            {ko ? "PSST · VC 심사 방어 Q&A" : "PSST · VC Due-Diligence Q&A"}
          </span>
          <h3 id={`${baseId}-title`} className="break-keep text-base font-bold sm:text-lg">
            {ko
              ? "투자자·심사위원이 가장 먼저 묻는 5가지 질문"
              : "Five Questions Investors & Grant Evaluators Ask First"}
          </h3>
        </div>
        <button
          type="button"
          className="ir-moat-btn ir-print-hide"
          onClick={toggleAll}
        >
          {allOpen
            ? ko
              ? "모두 접기"
              : "Collapse all"
            : ko
              ? "5문항 모두 펼치기"
              : "Expand all 5"}
        </button>
      </div>

      <div className="divide-y" style={{ borderColor: "var(--irm-line)" }}>
        {INVESTOR_DEFENSE_QA.map((item, idx) => {
          const isOpen = openIds.includes(item.id);
          const panelId = `${baseId}-panel-${item.id}`;
          const triggerId = `${baseId}-trigger-${item.id}`;
          const copy = ko ? item.ko : item.en;

          return (
            <div key={item.id} style={{ borderColor: "var(--irm-line)" }}>
              <button
                id={triggerId}
                type="button"
                className="ir-moat-qa-trigger"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggleItem(item.id)}
              >
                <span className="grid gap-1">
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="ir-moat-tabular font-bold" style={{ color: "var(--irm-accent)" }}>
                      Q{idx + 1}
                    </span>
                    <span className="font-semibold" style={{ color: "var(--irm-fg-2)" }}>
                      {ko ? item.pillarKo : item.pillarEn}
                    </span>
                    <span className="ir-moat-pill" data-tone="current">
                      {ko ? item.evidenceTagKo : item.evidenceTagEn}
                    </span>
                  </span>
                  <span className={`break-keep font-bold ${compact ? "text-sm" : "text-sm sm:text-base"}`}>
                    {copy.question}
                  </span>
                </span>
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className="shrink-0"
                  style={{
                    color: "var(--irm-fg-2)",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>
              <div
                id={panelId}
                role="region"
                aria-labelledby={triggerId}
                hidden={!isOpen}
                className="ir-moat-qa-panel pb-4"
              >
                <p
                  className="break-keep text-sm leading-6"
                  style={{ color: "var(--irm-fg-2)" }}
                >
                  {copy.answer}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

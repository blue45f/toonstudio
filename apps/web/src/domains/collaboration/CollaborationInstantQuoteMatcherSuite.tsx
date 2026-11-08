/**
 * 숨고(Soomgo 즉시 견적 요청·고수 매칭 퍼널) + 위시켓(Wishket 표준 과업·계약 명세 빌더) +
 * 크몽(Kmong 원본 파일·저작재산권 범위 패키지) 역공학 내재화 컴포넌트.
 */

import { useMemo, useState } from "react";
import { Calculator, CheckCircle2, Clock, FileCheck2, ShieldCheck, Sparkles } from "lucide-react";

import {
  evaluateInstantQuoteAndSpecialistMatch,
  type IpRightsScopeTier,
  type SourceFileDeliveryTier,
  type TurnaroundUrgencyTier,
  type WebtoonQuoteProcessRole,
} from "./collaboration-instant-quote-matcher-model";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const ROLE_OPTIONS: readonly {
  readonly id: WebtoonQuoteProcessRole;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = Object.freeze([
  { id: "ink", labelKo: "선화·펜선 어시 (Inking)", labelEn: "Line Art & Inking" },
  { id: "color", labelKo: "밑색·명암·채색 (Coloring)", labelEn: "Flats & Shading" },
  { id: "background", labelKo: "3D·배경 (Background)", labelEn: "3D & Backgrounds" },
  { id: "story", labelKo: "각색·콘티 연출 (Storyboard)", labelEn: "Storyboard & Story" },
  { id: "lettering", labelKo: "식자·효과음 타이포 (Lettering)", labelEn: "Lettering & SFX" },
]);

const URGENCY_OPTIONS: readonly {
  readonly id: TurnaroundUrgencyTier;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = Object.freeze([
  { id: "standard-7d", labelKo: "표준 마감 (7일 이내 · 1.0x)", labelEn: "Standard 7d (1.0x)" },
  { id: "express-72h", labelKo: "빠른 마감 (72시간 이내 · 1.25x)", labelEn: "Express 72h (1.25x)" },
  { id: "urgent-24h", labelKo: "긴급 세이브 방어 (24시간 이내 · 1.55x)", labelEn: "Urgent 24h (1.55x)" },
]);

const RIGHTS_OPTIONS: readonly {
  readonly id: IpRightsScopeTier;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = Object.freeze([
  {
    id: "serial-webtoon-only",
    labelKo: "국내 본편 연재권 한정 (1.0x)",
    labelEn: "Primary Webtoon Serialization Only (1.0x)",
  },
  {
    id: "global-localization",
    labelKo: "글로벌 플랫폼 번역·유통 포함 (1.18x)",
    labelEn: "Global Multi-Platform Distribution (1.18x)",
  },
  {
    id: "merch-and-secondary",
    labelKo: "단행본·굿즈·2차 저작물 특약 포함 (1.35x)",
    labelEn: "Print, Merch & Secondary IP Addendum (1.35x)",
  },
]);

const DELIVERY_OPTIONS: readonly {
  readonly id: SourceFileDeliveryTier;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = Object.freeze([
  {
    id: "layered-clip-psd",
    labelKo: "선화·밑색·명암 분리 .clip/.psd 원본 (1.15x)",
    labelEn: "Separated .clip/.psd Source Layers (1.15x)",
  },
  {
    id: "flattened-png",
    labelKo: "병합 무손실 PNG 납품 (1.0x)",
    labelEn: "Flattened Lossless PNG (1.0x)",
  },
  {
    id: "full-3d-scene-bundle",
    labelKo: "원본 레이어 + 3D 씬/카메라 프리셋 번들 (1.3x)",
    labelEn: "Source Layers + 3D Camera Preset Bundle (1.3x)",
  },
]);

export function CollaborationInstantQuoteMatcherSuite({
  onApplyRoleFilter,
}: {
  readonly onApplyRoleFilter?: (role: WebtoonQuoteProcessRole) => void;
}) {
  const bt = useBilingual("CollaborationInstantQuoteMatcherSuite");
  const [processRole, setProcessRole] = useState<WebtoonQuoteProcessRole>("ink");
  const [episodeCutCount, setEpisodeCutCount] = useState<number>(65);
  const [turnaroundUrgency, setTurnaroundUrgency] = useState<TurnaroundUrgencyTier>("standard-7d");
  const [ipRightsScope, setIpRightsScope] = useState<IpRightsScopeTier>("serial-webtoon-only");
  const [sourceFileDelivery, setSourceFileDelivery] =
    useState<SourceFileDeliveryTier>("layered-clip-psd");
  const [dispatchedProId, setDispatchedProId] = useState<string | null>(null);

  const evaluation = useMemo(
    () =>
      evaluateInstantQuoteAndSpecialistMatch({
        processRole,
        episodeCutCount,
        turnaroundUrgency,
        ipRightsScope,
        sourceFileDelivery,
      }),
    [processRole, episodeCutCount, turnaroundUrgency, ipRightsScope, sourceFileDelivery]
  );

  const clauses = bt("ko", "en") === "ko" ? evaluation.contractClausesKo : evaluation.contractClausesEn;

  return (
    <section
      data-testid="collaboration-instant-quote-matcher-suite"
      data-own-control-size=""
      aria-label={bt(
        "숨고·위시켓·크몽 역공학 웹툰 공정별 즉시 견적 및 표준계약 매칭기",
        "Instant Webtoon Stage Quote & Standard Contract Matcher"
      )}
      className="mt-8 rounded-3xl border border-line bg-panel p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-bold text-accent">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {bt(
                "Soomgo · Wishket · Kmong 역공학 내재화",
                "Soomgo · Wishket · Kmong Internalized"
              )}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-0.5 text-xs font-semibold text-fg-2">
              <ShieldCheck className="size-3.5 text-good" aria-hidden="true" />
              {bt("문체부 웹툰 표준계약서 조항 자동 반영", "Standard Webtoon Contract Clauses Linked")}
            </span>
          </div>
          <h2 className="mt-2.5 text-lg font-bold text-fg sm:text-xl">
            {bt(
              "웹툰 공정별 즉시 견적 산출 & 전문 파트너 매칭 시뮬레이터",
              "Instant Stage Quote Estimator & Pro Partner Matcher"
            )}
          </h2>
          <p className="mt-1 text-xs leading-5 text-fg-2 sm:text-sm">
            {bt(
              "회차 컷 수, 마감 긴급도, 원본 레이어(.clip/.psd) 인도 여부, 저작재산권 범위를 선택하면 3단계 마일스톤 견적과 최적 전문 작업자를 즉시 산출합니다.",
              "Select cut count, turnaround urgency, source layer delivery, and IP rights scope to compute 3-milestone quotes and match verified specialists."
            )}
          </p>
        </div>
        <div
          data-testid="instant-quote-total-badge"
          className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-right"
        >
          <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-fg-3">
            {bt("예상 총 의뢰 금액", "Estimated Episode Total")}
          </p>
          <p className="mt-0.5 text-2xl font-black text-fg">
            ₩{evaluation.estimatedTotalKRW.toLocaleString("ko-KR")}
          </p>
          <p className="text-[0.6875rem] text-fg-2">
            {bt(
              `컷당 ₩${evaluation.perCutUnitKRW.toLocaleString("ko-KR")} × ${evaluation.clampedCutCount}컷`,
              `₩${evaluation.perCutUnitKRW.toLocaleString("en-US")}/cut × ${evaluation.clampedCutCount} cuts`
            )}
          </p>
        </div>
      </div>

      {/* 입력 폼 그리드 */}
      <div
        role="group"
        aria-label={bt("즉시 견적 산출 조건", "Instant quote estimation parameters")}
        className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="block text-xs font-semibold text-fg-2">
          {bt("1. 의뢰 공정 분야", "1. Process Stage")}
          <select
            data-testid="quote-role-select"
            value={processRole}
            onChange={(event) => {
              const nextRole = event.target.value as WebtoonQuoteProcessRole;
              setProcessRole(nextRole);
              onApplyRoleFilter?.(nextRole);
            }}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {bt(opt.labelKo, opt.labelEn)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold text-fg-2">
          {bt("2. 회차 컷 수 (10~200컷)", "2. Episode Cut Count")}
          <input
            type="number"
            min={10}
            max={200}
            step={5}
            data-testid="quote-cut-count-input"
            value={episodeCutCount}
            onChange={(event) => setEpisodeCutCount(Number(event.target.value))}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </label>

        <label className="block text-xs font-semibold text-fg-2">
          {bt("3. 마감 납기 조건", "3. Turnaround SLA")}
          <select
            data-testid="quote-urgency-select"
            value={turnaroundUrgency}
            onChange={(event) => setTurnaroundUrgency(event.target.value as TurnaroundUrgencyTier)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {URGENCY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {bt(opt.labelKo, opt.labelEn)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold text-fg-2">
          {bt("4. 저작재산권·유통 범위", "4. IP Rights Scope")}
          <select
            data-testid="quote-rights-select"
            value={ipRightsScope}
            onChange={(event) => setIpRightsScope(event.target.value as IpRightsScopeTier)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {RIGHTS_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {bt(opt.labelKo, opt.labelEn)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold text-fg-2">
          {bt("5. 납품 파일 규격", "5. Source File Spec")}
          <select
            data-testid="quote-delivery-select"
            value={sourceFileDelivery}
            onChange={(event) =>
              setSourceFileDelivery(event.target.value as SourceFileDeliveryTier)
            }
            className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {DELIVERY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {bt(opt.labelKo, opt.labelEn)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 3단계 대금 보호 분할 & 표준계약 필수 특약 */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-raised/50 p-4">
          <div className="flex items-center gap-2">
            <Calculator className="size-4 text-accent" aria-hidden="true" />
            <h3 className="text-xs font-bold text-fg sm:text-sm">
              {bt(
                "위시켓·크몽형 3단계 마일스톤 정산 분할표",
                "3-Milestone Escrow Settlement Breakdown"
              )}
            </h3>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {evaluation.milestoneSplit.map((slice) => (
              <div
                key={slice.stepId}
                data-testid={`quote-milestone-${slice.stepId}`}
                className="rounded-xl border border-line bg-panel p-3"
              >
                <p className="text-[0.6875rem] font-semibold text-fg-3">
                  {bt(slice.labelKo, slice.labelEn)}
                </p>
                <p className="mt-1 text-base font-extrabold text-fg">
                  ₩{slice.amountKRW.toLocaleString("ko-KR")}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-raised/50 p-4">
          <div className="flex items-center gap-2">
            <FileCheck2 className="size-4 text-good" aria-hidden="true" />
            <h3 className="text-xs font-bold text-fg sm:text-sm">
              {bt(
                "자동 생성된 과업지시서·표준계약 필수 조항",
                "Auto-Generated Statement of Work & Contract Clauses"
              )}
            </h3>
          </div>
          <ul className="mt-2.5 space-y-1.5 text-xs leading-5 text-fg-2">
            {clauses.map((clause) => (
              <li key={clause} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-good" aria-hidden="true" />
                <span>{clause}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 매칭된 전문 파트너 추천 */}
      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-fg sm:text-sm">
            {bt(
              "조건 부합도 상위 웹툰 전문 파트너 (즉시 견적 요청 가능)",
              "Top-Matched Webtoon Specialists (Ready for Instant Quote)"
            )}
          </h3>
          <div aria-live="polite" className="text-xs font-semibold text-good">
            {dispatchedProId
              ? bt(
                  `선택한 파트너(${dispatchedProId})에게 표준 과업지시서 초안을 첨부해 견적 요청을 보냈습니다.`,
                  `Dispatched quote request with SOW draft to specialist (${dispatchedProId}).`
                )
              : null}
          </div>
        </div>
        <div
          role="group"
          aria-label={bt("추천 웹툰 전문 파트너 목록", "Recommended webtoon specialists")}
          className="mt-3 grid gap-3 md:grid-cols-3"
        >
          {evaluation.matchedSpecialists.slice(0, 3).map((pro) => {
            const isSent = dispatchedProId === pro.id;
            return (
              <article
                key={pro.id}
                data-testid={`matched-pro-card-${pro.id}`}
                className="flex flex-col justify-between rounded-2xl border border-line bg-raised/40 p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[0.6875rem] font-extrabold text-accent">
                      {bt(`매칭도 ${pro.matchScore}%`, `Match ${pro.matchScore}%`)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[0.6875rem] text-fg-3">
                      <Clock className="size-3" aria-hidden="true" />
                      {bt(`평균 ${pro.avgResponseMinutes}분 응답`, `${pro.avgResponseMinutes}m response`)}
                    </span>
                  </div>
                  <h4 className="mt-2 text-sm font-bold text-fg">
                    {bt(pro.displayNameKo, pro.displayNameEn)}
                  </h4>
                  <p className="mt-1 text-xs leading-5 text-fg-2">
                    {bt(pro.highlightKo, pro.highlightEn)}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {pro.verifiedTools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded border border-line bg-panel px-2 py-0.5 text-[0.6875rem] text-fg-3"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
                  <span className="text-[0.6875rem] text-fg-3">
                    {bt(`누적 완주 ${pro.completedEpisodes}회차`, `${pro.completedEpisodes} episodes done`)}
                  </span>
                  <button
                    type="button"
                    data-testid={`dispatch-quote-btn-${pro.id}`}
                    aria-pressed={isSent}
                    onClick={() => setDispatchedProId(pro.id)}
                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl px-3.5 py-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      isSent
                        ? "bg-good/20 text-good"
                        : "bg-accent text-on-accent hover:bg-accent/90"
                    }`}
                  >
                    {isSent
                      ? bt("견적 발송 완료", "Quote Sent")
                      : bt("1분 견적 요청", "Request Quote")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

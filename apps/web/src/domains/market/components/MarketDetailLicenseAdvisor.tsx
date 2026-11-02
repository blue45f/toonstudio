import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Layers,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

import { marketLicenseMeta } from "../models/market-kind";
import {
  MarketWebtoonLicensingEngine,
  type WebtoonLicenseTier,
} from "../models/market-webtoon-licensing";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const ENGINE_LABELS: Record<string, string> = {
  canvas2d: "Canvas 2D",
  webgl2: "WebGL 2",
  webgpu: "WebGPU",
  three: "Three.js",
};

const licensingEngine = new MarketWebtoonLicensingEngine();

interface MarketDetailLicenseAdvisorProps {
  readonly record: CreatorMarketplaceResourceRecord;
}

/**
 * 게시 manifest 기반 권리·호환성 확인 섹션 + 권리 허용 매트릭스 + 팀 인원 자가점검 + 원클릭 출처 표기문 복사.
 * 주의: 과장 문구("상업용 웹툰 정식 연재 100% 허용", "저작권 분쟁으로부터 안전", "NoAI 조건 공개", "순수 창작")를 절대 생성하지 않고
 * manifest에 기록된 선언 사실만 정직하게 안내한다.
 */
export function MarketDetailLicenseAdvisor({
  record,
}: MarketDetailLicenseAdvisorProps) {
  const t = useBilingual("MarketDetailLicenseAdvisor");
  const license = marketLicenseMeta(record.license);

  const defaultTier: WebtoonLicenseTier =
    record.license === "cc0-1.0" ? "open-cc0" : "solo-creator";
  const [selectedTier, setSelectedTier] = useState<WebtoonLicenseTier>(defaultTier);
  const [teamSeats, setTeamSeats] = useState<number>(1);
  const [resellingRaw, setResellingRaw] = useState(false);
  const [copiedCredit, setCopiedCredit] = useState(false);

  const commercialAllowed = record.license !== "cc-by-nc-4.0";
  const attributionRequired =
    record.license === "cc-by-4.0" ||
    record.license === "cc-by-nc-4.0" ||
    record.attributionText.trim().length > 0;
  const rawRedistributionAllowed =
    record.license === "cc0-1.0" ||
    record.license === "cc-by-4.0" ||
    record.license === "cc-by-nc-4.0";

  const effectiveTier = record.license === "cc0-1.0" ? "open-cc0" : selectedTier;
  const compliance = useMemo(
    () => licensingEngine.verifyCompliance(effectiveTier, teamSeats, resellingRaw),
    [effectiveTier, resellingRaw, teamSeats],
  );

  const creditTemplate = useMemo(() => {
    const baseAttribution =
      record.attributionText.trim() || `© ${record.publisher.name}`;
    return `${record.name} — ${baseAttribution} (${license.label})`;
  }, [license.label, record.attributionText, record.name, record.publisher.name]);

  const handleCopyCredit = async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(creditTemplate);
      } catch {
        // Clipboard restricted
      }
    }
    setCopiedCredit(true);
    window.setTimeout(() => setCopiedCredit(false), 2000);
  };

  return (
    <section
      aria-labelledby="market-trust-guarantee-heading"
      className="space-y-4 rounded-xl border border-line bg-card p-5"
    >
      <div>
        <h2
          id="market-trust-guarantee-heading"
          className="flex items-center gap-2 text-sm font-bold text-fg"
        >
          <ShieldCheck className="h-4 w-4 text-good" aria-hidden="true" />
          {t("게시 manifest 기반 권리·호환성 확인", "Manifest rights & compatibility declaration")}
        </h2>
        <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
          {t(
            "아래 내용은 배급자가 게시한 현재 릴리스의 선언입니다. 독립적인 법률·성능 보증으로 해석하지 말고 실제 프로젝트 적용 전에 세부 조건을 확인하세요.",
            "The statements below reflect the publisher's declaration in the current release manifest. Verify detailed terms before production use.",
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-panel/50 p-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-fg">{license.label}</p>
            <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
              {t("사용 조건: ", "Terms: ")}
              {license.summary}
            </p>
            <p className="mt-1 break-words text-[0.65rem] leading-relaxed text-fg-3">
              {record.attributionText
                ? `${t("출처 표기: ", "Attribution: ")}${record.attributionText}`
                : t("게시된 출처 표기문 없음", "No custom attribution line declared")}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-panel/50 p-3">
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-fg">
              {t("Studio 호환 선언", "Studio compatibility")}
            </p>
            <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
              {record.compatibility.engines
                .map((engine) => ENGINE_LABELS[engine] ?? engine)
                .join(", ")}
            </p>
            <p className="mt-1 text-[0.65rem] text-fg-3">
              {t("최소 Studio v", "Minimum Studio v")}
              {record.minimumStudioVersion}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-panel/50 p-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-fg">
              {record.containsAi
                ? t("AI 사용 포함으로 공개", "Disclosed as containing AI")
                : t("AI 사용 미포함으로 공개", "Disclosed as not containing AI")}
            </p>
            <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
              {t(
                "배급자 manifest의 공개값이며 ToonStudio의 독립 감정이나 보증 배지가 아닙니다.",
                "Publisher-declared manifest disclosure, not an independent legal certification.",
              )}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-panel/50 p-3">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-cool" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-fg">
              {record.provenance.origin === "original"
                ? t("배급자 직접 제작으로 공개", "Disclosed as publisher-authored")
                : t("외부 허용 출처로 공개", "Disclosed from permissive source")}
            </p>
            {record.provenance.origin === "permissive" ? (
              <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
                {record.provenance.sourceName} ·{" "}
                <a
                  href={record.provenance.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-line-strong underline-offset-2 hover:text-accent"
                >
                  {t("원본 확인", "Source")}
                </a>
                {" · "}
                <a
                  href={record.provenance.sourceLicenseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-line-strong underline-offset-2 hover:text-accent"
                >
                  {t("원본 사용권", "Source license")}
                </a>
              </p>
            ) : (
              <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
                {t(
                  "배급자가 원본 제작자로 선언한 릴리스입니다.",
                  "Release declared as authored by the publisher.",
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 시각 권리 조건 매트릭스 */}
      <div
        data-testid="market-license-permission-matrix"
        className="grid grid-cols-2 gap-2 border-t border-line/70 pt-3.5 text-xs sm:grid-cols-4"
      >
        <div className="rounded-lg border border-line bg-panel/60 p-2.5">
          <span className="block text-[11px] text-fg-3">{t("상업 작품 사용", "Commercial work")}</span>
          <strong className={cn("mt-0.5 inline-flex items-center gap-1 font-bold", commercialAllowed ? "text-good" : "text-warn")}>
            {commercialAllowed ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <XCircle className="size-3.5" aria-hidden="true" />}
            {commercialAllowed ? t("허용 선언", "Permitted") : t("비상업 전용", "Non-commercial")}
          </strong>
        </div>
        <div className="rounded-lg border border-line bg-panel/60 p-2.5">
          <span className="block text-[11px] text-fg-3">{t("원고 내 가공·편집", "Adaptation in cuts")}</span>
          <strong className="mt-0.5 inline-flex items-center gap-1 font-bold text-good">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {t("가능", "Allowed")}
          </strong>
        </div>
        <div className="rounded-lg border border-line bg-panel/60 p-2.5">
          <span className="block text-[11px] text-fg-3">{t("출처 표기 조건", "Attribution")}</span>
          <strong className={cn("mt-0.5 inline-flex items-center gap-1 font-bold", attributionRequired ? "text-accent" : "text-fg")}>
            {attributionRequired ? t("표기 필요", "Required") : t("선택 사항", "Optional")}
          </strong>
        </div>
        <div className="rounded-lg border border-line bg-panel/60 p-2.5">
          <span className="block text-[11px] text-fg-3">{t("리소스 단독 재배포", "Raw redistribution")}</span>
          <strong className={cn("mt-0.5 inline-flex items-center gap-1 font-bold", rawRedistributionAllowed ? "text-fg" : "text-bad")}>
            {rawRedistributionAllowed ? t("라이선스 조건부", "Per CC terms") : t("금지", "Prohibited")}
          </strong>
        </div>
      </div>

      {/* 출처 표기문 1-Click 복사 & 팀 작업 인원 시뮬레이터 */}
      <div className="grid gap-3 rounded-xl border border-line bg-panel/60 p-3.5 text-xs lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <strong className="font-bold text-fg">
              {t("웹툰 회차 하단 출처 표기문", "Episode credit line")}
            </strong>
            <button
              type="button"
              onClick={() => void handleCopyCredit()}
              className={buttonClass({
                variant: "outline",
                size: "sm",
                className: "min-h-7 gap-1 px-2 text-[11px]",
              })}
            >
              {copiedCredit ? (
                <Check className="size-3 text-good" aria-hidden="true" />
              ) : (
                <ClipboardCopy className="size-3" aria-hidden="true" />
              )}
              {copiedCredit ? t("복사 완료", "Copied") : t("출처 표기문 복사", "Copy credit")}
            </button>
          </div>
          <code className="block break-words rounded-lg border border-line bg-card px-2.5 py-2 font-mono text-[11px] text-fg-2">
            {creditTemplate}
          </code>
        </div>

        <div className="space-y-2 border-t border-line/60 pt-2.5 lg:border-l lg:border-t-0 lg:pl-3.5 lg:pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="inline-flex items-center gap-1 font-bold text-fg">
              <Users className="size-3.5 text-accent" aria-hidden="true" />
              {t("작업 인원·재배포 사전 자가점검", "Team seat & resale check")}
            </strong>
            {record.license !== "cc0-1.0" ? (
              <select
                aria-label={t("작업 범위 유형", "Usage tier")}
                value={selectedTier}
                onChange={(event) => setSelectedTier(event.target.value as WebtoonLicenseTier)}
                className="h-7 rounded border border-line bg-card px-2 text-[11px] text-fg"
              >
                <option value="solo-creator">{t("1인 작가 기준", "Solo creator (1)")}</option>
                <option value="studio-team">{t("팀 작업 (최대 5인)", "Studio team (≤5)")}</option>
                <option value="corporate-agency">{t("에이전시·법인", "Agency / studio")}</option>
              </select>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-fg-2">
              <span>{t("동시 작업 인원:", "Active seats:")}</span>
              <input
                type="number"
                min={1}
                max={50}
                value={teamSeats}
                onChange={(event) =>
                  setTeamSeats(Math.max(1, Number.parseInt(event.target.value || "1", 10) || 1))
                }
                aria-label={t("동시 작업 인원", "Active team members")}
                className="h-7 w-14 rounded border border-line bg-card px-1.5 text-center font-mono text-xs text-fg"
              />
            </label>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-fg-2">
              <input
                type="checkbox"
                checked={resellingRaw}
                onChange={(event) => setResellingRaw(event.target.checked)}
              />
              <span>{t("원본 파일 재판매 포함", "Reselling raw files")}</span>
            </label>
          </div>

          <p
            className={cn(
              "flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium",
              compliance.isCompliant
                ? "bg-good/10 text-good"
                : "bg-warn/15 text-fg",
            )}
          >
            {compliance.isCompliant ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden="true" />
            )}
            <span>
              {compliance.isCompliant
                ? !commercialAllowed
                  ? t(
                      "인원·재배포 위반은 없으나 CC BY-NC 사용권이므로 비상업 작품에만 사용할 수 있습니다.",
                      "Seat count is valid, but CC BY-NC restricts usage to non-commercial works.",
                    )
                  : t(
                      "선택한 작업 인원 및 사용 범위 기준에 부합합니다.",
                      "Complies with the selected seat count and usage scope.",
                    )
                : compliance.violationReason}
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

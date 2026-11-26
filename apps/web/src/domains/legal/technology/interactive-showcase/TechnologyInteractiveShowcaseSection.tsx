import { Compass } from "lucide-react";
import { useId } from "react";

import { InteractiveArchitectureBlueprint } from "./InteractiveArchitectureBlueprint";
import { InteractiveFiveStageTourPreview } from "./InteractiveFiveStageTourPreview";
import { InteractiveMathSandboxCard } from "./InteractiveMathSandboxCard";
import { QualitySecurityAttestationStrip } from "./QualitySecurityAttestationStrip";
import { TcoAndBenchmarkMatrix } from "./TcoAndBenchmarkMatrix";
import { showcaseBi } from "./interactive-showcase-models";

import { cx } from "@/shared/lib/cx";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

export interface TechnologyInteractiveShowcaseSectionProps {
  readonly id?: string;
  readonly className?: string;
}

/**
 * 기술 허브(`TechnologyPage`) 및 기술 도감(`EngineeringAtlasPage`)에 한 줄로 마운트하는
 * 5종 인터랙티브 엔지니어링 쇼케이스 통합 섹션.
 */
export function TechnologyInteractiveShowcaseSection({
  id = "interactive-engineering-showcase",
  className,
}: TechnologyInteractiveShowcaseSectionProps) {
  useBilingualI18nRevision();
  const baseId = useId();
  const headingId = `${baseId}-showcase-section-title`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-technology-interactive-showcase=""
      className={cx("grid gap-6", className)}
    >
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-line/75 bg-card/70 px-5 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 font-display text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">
            <Compass size={14} aria-hidden="true" />
            {showcaseBi("인터랙티브 엔지니어링 쇼케이스", "Interactive Engineering Showcase")}
          </p>
          <h2
            id={headingId}
            className="mt-1.5 text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl"
          >
            {showcaseBi(
              "수식·청사진·원가·5단계 공정·보안 게이트를 직접 조작해 검증하세요",
              "Explore the Live Math, Blueprint, TCO, 5-Stage Pipeline & Security Gates",
            )}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 break-keep text-fg-2">
            {showcaseBi(
              "모든 슬라이더와 도식은 외부 API 호출 없이 브라우저 안에서 즉시 계산되며, 저장소에 실재하는 커널과 검증 스크립트에 연결되어 있습니다.",
              "Every slider and blueprint node runs locally in your browser with zero external API calls, backed by verified repository kernels and CI gates.",
            )}
          </p>
        </div>
      </header>

      <InteractiveMathSandboxCard />
      <InteractiveArchitectureBlueprint />
      <InteractiveFiveStageTourPreview />
      <TcoAndBenchmarkMatrix />
      <QualitySecurityAttestationStrip />
    </section>
  );
}

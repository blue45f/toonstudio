import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import { useBilingual, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import {
  WEBTOON_PROCESS_TOOLCHAIN,
  type ProcessToolKind,
  type ProcessToolPricing,
} from "./webtoon-process-toolchain";

type ToolFilter = "all" | ProcessToolKind;

const PRICING_LABELS: Record<ProcessToolPricing, { ko: string; en: string }> = {
  free: { ko: "무료", en: "Free" },
  freemium: { ko: "부분 무료", en: "Freemium" },
  paid: { ko: "유료", en: "Paid" },
  subscription: { ko: "구독", en: "Subscription" },
};

/**
 * `/learn/process` 가이드의 "공정별로 쓰이는 도구들" 섹션.
 *
 * 웹툰 제작은 한 가지 프로그램으로 끝나지 않는다. 기획부터 홍보까지
 * 각 공정에서 널리 쓰이는 외부 도구와, 그 공정을 돕는 툰스튜디오 내장
 * 기능을 단계별로 함께 정리한다. 내장 기능은 배지로 구분하고, 독립
 * 화면이 있는 기능은 이름에서 바로 열 수 있게 잇는다.
 * 특정 제작사의 도구 구성은 작품마다 다르다는 전제를 문구에 그대로 남긴다.
 */
export function WebtoonProcessToolchain() {
  const bt = useBilingual("WebtoonProcessToolchain");
  const localize = useBilingualLocalizer("WebtoonProcessToolchain");
  const [filter, setFilter] = useState<ToolFilter>("all");

  const filterOptions: readonly { value: ToolFilter; ko: string; en: string }[] = [
    { value: "all", ko: "전체", en: "All" },
    { value: "external", ko: "외부 도구", en: "External tools" },
    { value: "builtin", ko: "툰스튜디오 내장", en: "Built into ToonStudio" },
  ];

  const stages = WEBTOON_PROCESS_TOOLCHAIN.map((stage, index) => ({
    id: stage.id,
    index,
    title: localize(stage.title.ko, stage.title.en),
    summary: localize(stage.summary.ko, stage.summary.en),
    tools: stage.tools
      .filter((tool) => filter === "all" || tool.kind === filter)
      .map((tool) => ({
        name: localize(tool.name.ko, tool.name.en),
        role: localize(tool.role.ko, tool.role.en),
        kind: tool.kind,
        pricing: tool.pricing,
        href: tool.href,
      })),
  })).filter((stage) => stage.tools.length > 0);

  return (
    <section aria-labelledby="process-toolchain-title" className="scroll-mt-28 space-y-4" id="process-toolchain">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-accent">Process toolchain</p>
        <h2 className="mt-2 text-2xl font-black leading-tight text-ink md:text-3xl" id="process-toolchain-title">
          {bt("공정별로 쓰이는 도구들", "The tools used at each stage")}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-body">
          {bt(
            "웹툰 한 편은 한 가지 프로그램으로 완성되지 않습니다. 기획부터 홍보까지, 각 공정에서 널리 쓰이는 외부 도구와 그 공정을 돕는 툰스튜디오 내장 기능을 함께 정리했습니다. 어떤 제작사가 어떤 도구를 쓰는지는 작품마다 다르므로, 아래 목록은 업계에서 일반적으로 알려진 공정별 도구 구성을 보여 주는 가이드입니다. 과금 형태는 확인된 도구에만 적었습니다.",
            "No webtoon is finished in a single program. These are the external tools commonly used at each stage, from planning to promotion, listed together with the ToonStudio features built in for the same stage. Lineups differ by studio and title, so treat this as a general guide to how the industry equips each stage. Pricing is shown only where it could be confirmed.",
          )}
        </p>
      </div>

      <div aria-label={bt("도구 종류 필터", "Tool kind filter")} className="flex flex-wrap gap-2" role="group">
        {filterOptions.map((option) => (
          <button
            aria-pressed={filter === option.value}
            className={
              filter === option.value
                ? "min-h-10 rounded-full bg-accent px-4 py-2 text-sm font-bold text-on-accent"
                : "min-h-10 rounded-full border border-line px-4 py-2 text-sm font-bold text-fg hover:bg-raised"
            }
            key={option.value}
            onClick={() => setFilter(option.value)}
            type="button"
          >
            {bt(option.ko, option.en)}
          </button>
        ))}
      </div>

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stages.map((stage) => (
          <li className="rounded-2xl border border-line bg-panel p-4" data-process-toolchain-stage={stage.id} key={stage.id}>
            <div className="flex items-baseline gap-2">
              <span aria-hidden="true" className="text-xs font-black text-accent">
                {String(stage.index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-base font-black text-ink">{stage.title}</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-body">{stage.summary}</p>
            <ul className="mt-3 space-y-2">
              {stage.tools.map((tool) => (
                <li className="rounded-xl bg-accent-soft px-3 py-2" key={tool.name}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {tool.href ? (
                      <Link className="inline-flex items-center gap-1 text-sm font-bold text-accent hover:underline" to={tool.href}>
                        {tool.name}
                        <ArrowUpRight aria-hidden="true" size={14} />
                      </Link>
                    ) : (
                      <span className="text-sm font-bold text-ink">{tool.name}</span>
                    )}
                    {tool.kind === "builtin" ? (
                      <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-black text-on-accent">
                        {bt("툰스튜디오 내장", "Built-in")}
                      </span>
                    ) : null}
                    {tool.pricing ? (
                      <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] font-bold text-body">
                        {localize(PRICING_LABELS[tool.pricing].ko, PRICING_LABELS[tool.pricing].en)}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-body">{tool.role}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl border border-line bg-panel p-5">
        <h3 className="text-base font-black text-ink">
          {bt("툰스튜디오는 이 도구들을 잇는 자리입니다", "Where ToonStudio fits")}
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-body">
          {bt(
            "툰스튜디오는 위 도구들을 대체하려는 제품이 아닙니다. 기획 문서, 콘티, 선화, 채색본이 도구마다 흩어질 때 생기는 버전 혼선과 피드백 누락을 줄이도록, 공정과 공정을 하나의 작품 흐름으로 이어 주는 역할을 합니다. 위에 배지로 표시한 내장 기능은 그 흐름을 툰스튜디오 안에서 바로 이어 주는 자리입니다.",
            "ToonStudio is not here to replace the tools above. When planning docs, boards, line art, and color files scatter across tools, versions tangle and feedback gets lost. ToonStudio connects the stages into one production flow for the title — and the badged built-in features above are where that flow continues without leaving ToonStudio.",
          )}
        </p>
      </div>
    </section>
  );
}

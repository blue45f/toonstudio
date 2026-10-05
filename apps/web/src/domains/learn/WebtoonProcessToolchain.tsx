import { useBilingual, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import { WEBTOON_PROCESS_TOOLCHAIN } from "./webtoon-process-toolchain";

/**
 * `/learn/process` 가이드의 "공정별로 쓰이는 도구들" 섹션.
 *
 * 웹툰 제작은 한 가지 프로그램으로 끝나지 않는다. 기획부터 홍보까지
 * 각 공정에서 널리 쓰이는 외부 도구(툰스튜디오 제외)를 단계별로 정리하고,
 * 마지막에 툰스튜디오가 그 단계들을 어떻게 잇는지를 밝힌다.
 * 특정 제작사의 도구 구성은 작품마다 다르다는 전제를 문구에 그대로 남긴다.
 */
export function WebtoonProcessToolchain() {
  const bt = useBilingual("WebtoonProcessToolchain");
  const localize = useBilingualLocalizer("WebtoonProcessToolchain");
  const stages = WEBTOON_PROCESS_TOOLCHAIN.map((stage) => ({
    id: stage.id,
    copy: localize(stage.copy.ko, stage.copy.en),
  }));

  return (
    <section aria-labelledby="process-toolchain-title" className="scroll-mt-28 space-y-4" id="process-toolchain">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-accent">Process toolchain</p>
        <h2 className="mt-2 text-2xl font-black leading-tight text-ink md:text-3xl" id="process-toolchain-title">
          {bt("공정별로 쓰이는 도구들", "The tools used at each stage")}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-body">
          {bt(
            "웹툰 한 편은 한 가지 프로그램으로 완성되지 않습니다. 기획부터 홍보까지, 각 공정에서 널리 쓰이는 외부 도구들을 정리했습니다. 어떤 제작사가 어떤 도구를 쓰는지는 작품마다 다르므로, 아래 목록은 업계에서 일반적으로 알려진 공정별 도구 구성을 보여 주는 가이드입니다.",
            "No webtoon is finished in a single program. These are the external tools commonly used at each stage, from planning to promotion. Lineups differ by studio and title, so treat this as a general guide to how the industry equips each stage.",
          )}
        </p>
      </div>

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stages.map((stage, index) => (
          <li className="rounded-2xl border border-line bg-panel p-4" data-process-toolchain-stage={stage.id} key={stage.id}>
            <div className="flex items-baseline gap-2">
              <span aria-hidden="true" className="text-xs font-black text-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-base font-black text-ink">{stage.copy.title}</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-body">{stage.copy.summary}</p>
            <ul className="mt-3 space-y-2">
              {stage.copy.tools.map((tool) => (
                <li className="rounded-xl bg-accent-soft px-3 py-2" key={tool.name}>
                  <span className="text-sm font-bold text-ink">{tool.name}</span>
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
            "툰스튜디오는 위 도구들을 대체하려는 제품이 아닙니다. 기획 문서, 콘티, 선화, 채색본이 도구마다 흩어질 때 생기는 버전 혼선과 피드백 누락을 줄이도록, 공정과 공정을 하나의 작품 흐름으로 이어 주는 역할을 합니다.",
            "ToonStudio is not here to replace the tools above. When planning docs, boards, line art, and color files scatter across tools, versions tangle and feedback gets lost. ToonStudio connects the stages into one production flow for the title.",
          )}
        </p>
      </div>
    </section>
  );
}

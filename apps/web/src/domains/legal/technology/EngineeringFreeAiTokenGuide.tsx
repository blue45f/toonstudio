import { ExternalLink, KeyRound, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { externalLinkForName } from "./engineering-external-links";
import {
  FREE_AI_TOKEN_CATEGORIES,
  FREE_AI_TOKEN_CAUTIONS,
  FREE_AI_TOKEN_GUIDE_VERIFIED_ON,
  FREE_AI_TOKEN_METHODS,
  TOONSTUDIO_FREE_AI_ROUTES,
} from "./engineering-free-ai-token-guide";
import type { LocalizedText } from "./engineering-story-content";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const tr = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("free-ai-token-guide", ko, en);

const pickLocalized = (value: LocalizedText) => tr(value.ko, value.en);

const matchesQuery = (query: string, ...texts: readonly string[]) => {
  if (!query) return true;
  const haystack = texts.join(" ").toLowerCase();
  return haystack.includes(query);
};

const methodMatches = (
  query: string,
  method: (typeof FREE_AI_TOKEN_METHODS)[number],
) =>
  matchesQuery(
    query,
    method.name.ko,
    method.name.en,
    method.freeScope.ko,
    method.freeScope.en,
    method.limits.ko,
    method.limits.en,
    method.start.ko,
    method.start.en,
  );

export function EngineeringFreeAiTokenGuide({ query = "" }: { query?: string }) {
  useBilingualI18nRevision();
  const normalizedQuery = query.trim().toLowerCase();
  const visibleCategories = FREE_AI_TOKEN_CATEGORIES.map((category) => ({
    category,
    methods: FREE_AI_TOKEN_METHODS.filter(
      (method) =>
        method.categoryId === category.id && methodMatches(normalizedQuery, method),
    ),
  })).filter((group) => group.methods.length > 0);
  const routes = TOONSTUDIO_FREE_AI_ROUTES.filter(
    (route) =>
      !normalizedQuery ||
      matchesQuery(normalizedQuery, route.title.ko, route.title.en, route.body.ko, route.body.en),
  );
  const cautions = FREE_AI_TOKEN_CAUTIONS.filter(
    (caution) =>
      !normalizedQuery || matchesQuery(normalizedQuery, caution.ko, caution.en),
  );
  const hasAnyContent =
    visibleCategories.length > 0 || routes.length > 0 || cautions.length > 0;

  return (
    <section className="border-t border-[#e8ebf0] bg-[#fbfaf8] px-5 py-14 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-[#7a4b21] uppercase">
              <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />
              {tr("실전 정리 · 발표 자료", "Field guide · Seminar material")}
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] text-[#191b1f]">
              {tr("무료로 AI 토큰을 쓰는 방법", "How to use AI tokens for free")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#5d6470]">
              {tr(
                "무료로 AI를 쓰는 길은 다섯 갈래로 나뉩니다. 제공자 무료 티어, 무료 모델 라우터, 본인 키를 등록하는 BYOK, 토큰 요금이 없는 로컬·온디바이스 추론, 그리고 기간이 정해진 체험 크레딧입니다. 아래 표의 수치와 상태는 각 제공자의 공식 요금·문서 페이지에서 확인한 것만 적었고, 종료된 무료 티어는 종료됐다고 그대로 표시했습니다.",
                "There are five roads to free AI: provider free tiers, free-model routers, BYOK with your own key, local and on-device inference with no token bill, and time-boxed trial credits. Every figure and status below was checked on the provider's official pricing or docs pages, and ended free tiers are labelled as ended.",
              )}
            </p>
          </div>
          <p className="rounded-full border border-[#e2e5ea] bg-white px-3 py-1.5 text-xs font-semibold text-[#555c68]">
            {tr("공식 페이지 확인일", "Verified on official pages")}:{" "}
            {FREE_AI_TOKEN_GUIDE_VERIFIED_ON}
          </p>
        </div>

        {!hasAnyContent && normalizedQuery ? (
          <p className="mt-8 rounded-2xl border border-dashed border-[#d7dce4] bg-white px-4 py-5 text-sm text-[#697180]">
            {tr(
              "검색어와 맞는 무료 AI 방법이 없습니다.",
              "No free AI method matches your search.",
            )}
          </p>
        ) : null}

        {visibleCategories.map(({ category, methods }) => (
          <div className="mt-12" key={category.id}>
            <h3 className="text-xl font-black tracking-[-0.02em] text-[#24272c]">
              {pickLocalized(category.title)}
            </h3>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#5d6470]">
              {pickLocalized(category.summary)}
            </p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {methods.map((method) => {
                const external = method.linkName
                  ? externalLinkForName(method.linkName)
                  : undefined;
                return (
                  <article
                    className="flex flex-col rounded-[1.25rem] border border-[#e2e5ea] bg-white p-5"
                    key={method.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-bold text-[#24272c]">
                        {pickLocalized(method.name)}
                      </h4>
                      {method.badge ? (
                        <span className="rounded-full bg-[#fdf0ec] px-2 py-0.5 text-[11px] font-bold text-[#a33d1f]">
                          {pickLocalized(method.badge)}
                        </span>
                      ) : null}
                    </div>
                    <dl className="mt-3 space-y-2.5 text-sm leading-6 text-[#454c58]">
                      <div>
                        <dt className="inline font-bold text-[#24272c]">
                          {tr("무료 범위", "Free scope")}:{" "}
                        </dt>
                        <dd className="inline">{pickLocalized(method.freeScope)}</dd>
                      </div>
                      <div>
                        <dt className="inline font-bold text-[#24272c]">
                          {tr("제한·주의", "Limits")}:{" "}
                        </dt>
                        <dd className="inline">{pickLocalized(method.limits)}</dd>
                      </div>
                      <div>
                        <dt className="inline font-bold text-[#24272c]">
                          {tr("시작 방법", "How to start")}:{" "}
                        </dt>
                        <dd className="inline">{pickLocalized(method.start)}</dd>
                      </div>
                    </dl>
                    <div className="mt-4 pt-1">
                      {external ? (
                        <a
                          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#8a4b12] underline decoration-[#e9c48f] underline-offset-4 hover:text-[#6f3a0c]"
                          href={external.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {tr("공식 페이지", "Official page")}
                          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                        </a>
                      ) : method.internalHref ? (
                        <Link
                          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#8a4b12] underline decoration-[#e9c48f] underline-offset-4 hover:text-[#6f3a0c]"
                          to={method.internalHref}
                        >
                          {tr("툰스튜디오에서 열기", "Open in ToonStudio")}
                        </Link>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}

        {routes.length > 0 ? (
          <div className="mt-14">
            <h3 className="text-xl font-black tracking-[-0.02em] text-[#24272c]">
              {tr("툰스튜디오는 이렇게 씁니다", "How ToonStudio actually does it")}
            </h3>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#5d6470]">
              {tr(
                "위 방법들을 조합한 실제 운영 방식입니다. 근거 파일 경로를 함께 적었으니 코드에서 바로 확인할 수 있습니다. 단, 운영 환경의 키와 승인은 배포 설정 단계라 '코드에 구현됨'과 '운영에서 켜짐'은 구분해서 표기합니다.",
                "The production combination of the methods above, with the source files named so you can check the code directly. Production keys and approvals are deployment configuration, so 'implemented in code' and 'enabled in production' are kept as separate claims.",
              )}
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {routes.map((route) => (
                <article
                  className="rounded-[1.25rem] border border-[#e2e5ea] bg-white p-5"
                  key={route.id}
                >
                  <h4 className="text-base font-bold text-[#24272c]">
                    {pickLocalized(route.title)}
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-[#454c58]">
                    {pickLocalized(route.body)}
                  </p>
                  <ul className="mt-3 space-y-1">
                    {route.evidence.map((path) => (
                      <li key={path}>
                        <code className="rounded bg-[#f2ede6] px-1.5 py-0.5 text-[11px] font-semibold break-all text-[#7a4b21]">
                          {path}
                        </code>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {cautions.length > 0 ? (
          <div className="mt-14 rounded-[1.25rem] border border-[#f0ddc8] bg-[#fffaf3] p-5 sm:p-6">
            <h3 className="flex items-center gap-2 text-lg font-black tracking-[-0.02em] text-[#7a3c10]">
              <ShieldAlert aria-hidden="true" className="h-5 w-5" />
              {tr("쓰기 전에 확인할 것", "Check before you rely on it")}
            </h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[#5d4a33]">
              {cautions.map((caution) => (
                <li key={caution.ko}>{pickLocalized(caution)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

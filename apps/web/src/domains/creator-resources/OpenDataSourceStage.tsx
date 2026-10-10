import { Link } from "react-router-dom";

import {
  OPEN_DATA_KEYLESS_PROVIDERS,
  RESOURCE_SEARCH_CONFIG,
} from "./resource-search-config";
import type { ResourceSearchProvider } from "./resource-search-config";
import {
  researchSourceArtSrc,
  researchSourceIdentity,
} from "./research-source-identity";

import {
  translateCurrentStaticSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const SCOPE = "domains.creator.resources.OpenDataSourceStage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);
const txEn = (source: string): string => translateCurrentStaticSourceText(SCOPE, "en", source);

/**
 * 공개 데이터 상세 첫 화면 무대 (디자인 웨이브 15 파일럿 → 웨이브 16 전파 본편).
 *
 * 허브(/research/open-data, 웨이브 14)의 무대 문법을 상세 템플릿으로 전파한다.
 * 제공처의 실물 장면 아트를 전폭 무대로 세우고, 제목·한 줄 정체성·소개·접근
 * 방식(키 유무)을 스크림 위 무대 안에 종속 배치한다.
 * 장면 아트가 없는 제공처는 무대를 만들지 않는다 — 타이포로 위장하지 않는
 * 것이 웨이브 8 전례의 조건이라, 호출부는 아트가 있을 때만 이 무대를 얹고
 * 없으면 기존 마스트헤드로 남긴다. 적용 범위는 라우트 래퍼가 정한다 —
 * /research/open-data/* 상세 래퍼만 ResourceSearchPage의 heroStage 옵션을
 * 켠다 (별칭 경로는 래퍼 자체가 없다). 웨이브 17에서 ambientCG·NEIS 전용
 * 장면이 제작·배정돼 상세 14곳 전부가 장면 보유로 닫혔다.
 */
export function OpenDataSourceStage({ provider }: { provider: ResourceSearchProvider }) {
  useBilingualI18nRevision();
  const config = RESOURCE_SEARCH_CONFIG[provider];
  const identity = researchSourceIdentity(provider);
  const art = researchSourceArtSrc(identity);
  if (!art) return null;
  const keyless = OPEN_DATA_KEYLESS_PROVIDERS.has(provider);
  return (
    <section aria-label={tx("공개 데이터 제공처 소개")} className="relative overflow-hidden rounded-3xl border border-line bg-panel">
      <img
        src={art}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        className="absolute inset-0 size-full object-cover motion-safe:animate-fade-up"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_top,oklch(0.08_0.02_265/0.95)_0%,oklch(0.08_0.02_265/0.78)_44%,oklch(0.08_0.02_265/0.28)_78%,oklch(0.08_0.02_265/0.4)_100%)]"
      />
      <div className="relative flex min-h-[26rem] flex-col justify-end gap-4 p-6 sm:p-8">
        <Link
          to="/research/open-data"
          className="inline-flex min-h-8 items-center self-start text-xs font-semibold tracking-[.12em] text-white/75 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          TOONSTUDIO / {tx("공개 데이터 창작실")}
        </Link>
        <p className="eyebrow text-white/70">{txEn("OPEN DATA SOURCE")} · {identity.name}</p>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">{config.title}</h1>
        <p className="flex items-start gap-2.5 text-sm font-semibold leading-6 text-white/85">
          <span className="resource-source-dot mt-[.45rem] h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden="true" />
          <span><strong className="font-bold text-white">{identity.name}</strong> — {identity.tagline}</span>
        </p>
        <p className="max-w-2xl text-base leading-7 text-white/85">{config.intro}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-baseline gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 backdrop-blur-sm">
            <span className="text-xs font-medium text-white/85">{keyless ? tx("가입·키 없이 즉시 검색") : tx("무료 서버 키 연결형")}</span>
          </span>
          {config.featured ? (
            <span className="inline-flex items-baseline gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 backdrop-blur-sm">
              <span className="text-xs font-medium text-white/85">{tx("대표 검색어")}</span>
              <span className="text-sm font-bold text-white">{config.featured.query}</span>
            </span>
          ) : null}
          <span className="ms-auto flex flex-wrap items-center gap-3">
            <span className="text-xs text-white/65">
              {tx("제공처 장면")} · {identity.name}
            </span>
            <a
              href={config.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-bold text-[oklch(0.15_0.02_265)] transition-colors hover:bg-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {tx("공식 사이트 열기")}
            </a>
          </span>
        </div>
      </div>
    </section>
  );
}

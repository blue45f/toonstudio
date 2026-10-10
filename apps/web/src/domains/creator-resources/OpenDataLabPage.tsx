import { Link } from "react-router-dom";

import {
  OPEN_DATA_KEYLESS_PROVIDERS,
  OPEN_DATA_PROVIDERS,
  RESOURCE_SEARCH_CONFIG,
} from "./resource-search-config";
import { RESOURCE_BUTTON } from "./navigation";
import { researchSourceArtSrc, researchSourceIdentity } from "./research-source-identity";
import { ResourceLayout } from "./ResourceLayout";
import { ResearchSourceCardCover } from "./ResearchSourceCover";
import { StaggerReveal } from "@/shared/components/stagger-reveal";

import { RESOURCE_LABELS } from "@/shared/lib/creator-resources";
import {
  translateCurrentStaticSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { MotionIllustration } from "@/shared/motion-assets";

const SCOPE = "domains.creator.resources.OpenDataLabPage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);
const txEn = (source: string): string => translateCurrentStaticSourceText(SCOPE, "en", source);

const KEYLESS = OPEN_DATA_KEYLESS_PROVIDERS;
const WORKFLOW: Record<typeof OPEN_DATA_PROVIDERS[number], string> = {
  ambientcg: "배경 재질·HDRI·3D 소품",
  vam: "복식·직물·가구 고증",
  nasa: "우주·과학·SF 장면",
  gbif: "동식물·크리처 설정",
  musicbrainz: "장면별 음악 레퍼런스",
  internetarchive: "역사 도서·잡지·영상",
  kheritage: "한국 시대·장소 고증",
  neis: "학교물 배경 설정",
  tourapi: "실제 장소 기반 장면",
  korean: "캐릭터 어휘·대사",
  smithsonian: "박물관·과학·문화유산",
  wikimedia: "백과 조회 관심 변화",
  europeana: "유럽 문화유산 횡단 검색",
  dpla: "미국 역사 자료 횡단 검색",
};
export function OpenDataLabPage() {
  useBilingualI18nRevision();
  const keylessCount = OPEN_DATA_PROVIDERS.filter((provider) => KEYLESS.has(provider)).length;
  const keyedCount = OPEN_DATA_PROVIDERS.filter((provider) => !KEYLESS.has(provider)).length;
  // 첫 화면 무대 (디자인 웨이브 14 — 구도 교체): 대표 제공처 NASA의 실물 장면 아트를
  // 전폭 무대로 세우고, 제목·소개·제공처 통계를 스크림 위 무대 안에 종속 배치한다.
  // 통계 스트립은 무대와 중복돼 제거했고, 주의 패널·제공처 그리드·하단 동선은 그대로다.
  const heroIdentity = researchSourceIdentity("nasa");
  const heroArt = researchSourceArtSrc(heroIdentity);
  const stats = [
    { value: keylessCount, label: tx("가입·키 없이 즉시 검색") },
    { value: keyedCount, label: tx("무료 서버 키 연결형") },
    { value: 1, label: tx("공통 출처·권리 보드") },
  ];
  const heroStage = (
    <section aria-label={tx("공개 데이터 창작실 소개")} className="relative overflow-hidden rounded-3xl border border-line bg-panel">
      {heroArt ? (
        <img
          src={heroArt}
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover motion-safe:animate-fade-up"
        />
      ) : null}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_top,oklch(0.08_0.02_265/0.95)_0%,oklch(0.08_0.02_265/0.78)_44%,oklch(0.08_0.02_265/0.28)_78%,oklch(0.08_0.02_265/0.4)_100%)]"
      />
      <div className="relative flex min-h-[26rem] flex-col justify-end gap-4 p-6 sm:p-8">
        <Link
          to="/research"
          className="inline-flex min-h-8 items-center self-start text-xs font-semibold tracking-[.12em] text-white/75 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          TOONSTUDIO / 리서치 데스크
        </Link>
        <p className="eyebrow text-white/70">{txEn("OPEN DATA FOR CREATORS")}</p>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">{tx("공개 데이터 창작실")}</h1>
        <p className="max-w-2xl text-base leading-7 text-white/85">
          {tx("국내외 공식 Open API를 장면·고증·대사·생물·음악·역사 자료로 검색하고, 출처와 이용 범위를 보존한 채 하나의 제작 보드에 저장하세요.")}
        </p>
        <p className="text-sm text-white/70">{tx("공식 제공처만 사용합니다. 가입·키 없이 바로 검색하거나, 무료 서버 키로 연결하세요.")}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {stats.map((stat) => (
            <span
              key={stat.label}
              className="inline-flex items-baseline gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 backdrop-blur-sm"
            >
              <span className="numeral text-lg font-bold text-white">{stat.value}</span>
              <span className="text-xs font-medium text-white/85">{stat.label}</span>
            </span>
          ))}
          <span className="ms-auto flex flex-wrap items-center gap-3">
            <span className="text-xs text-white/65">
              {tx("대표 제공처")} · {heroIdentity.name}
            </span>
            <Link
              to="/research/open-data/nasa"
              className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-bold text-[oklch(0.15_0.02_265)] transition-colors hover:bg-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {tx("NASA 검색 도구 열기")}
            </Link>
          </span>
        </div>
      </div>
    </section>
  );
  return <ResourceLayout
    title={tx("공개 데이터 창작실")}
    intro={tx("국내외 공식 Open API를 장면·고증·대사·생물·음악·역사 자료로 검색하고, 출처와 이용 범위를 보존한 채 하나의 제작 보드에 저장하세요.")}
    heroStage={heroStage}
  >
    <section className="rounded-2xl border border-line bg-panel p-6">
      <div className="flex items-start gap-5">
        <MotionIllustration
          name="eye"
          size="lg"
          className="hidden shrink-0 text-accent sm:block"
          title={tx("레퍼런스 확인 일러스트")}
        />
        <div>
          <h2 className="text-xl font-bold">{tx("검색 결과를 바로 완성 에셋으로 오해하지 않습니다")}</h2>
          <p className="mt-3 text-sm leading-7 text-fg-2">{tx("Studio 직접 가져오기는 CC0가 확인된 ambientCG에만 허용합니다. NASA·V&A는 안전한 미리보기를 레퍼런스 전용으로 표시하고, 나머지 제공처는 메타데이터와 원문 링크만 저장합니다. 이미지·본문·음원·가사의 권리는 원 레코드에서 다시 확인합니다.")}</p>
        </div>
      </div>
    </section>
    <section aria-labelledby="open-data-providers-title">
      <h2 id="open-data-providers-title" className="sr-only">{tx("공개 데이터 제공처")}</h2>
      <StaggerReveal className="grid gap-4 md:grid-cols-2" itemClassName="h-full">
      {OPEN_DATA_PROVIDERS.map((provider) => {
        const config = RESOURCE_SEARCH_CONFIG[provider];
        const keyless = KEYLESS.has(provider);
        const identity = researchSourceIdentity(provider);
        return <article key={provider} className={`research-source research-source--${provider} flex h-full flex-col gap-3 rounded-2xl border border-line bg-panel p-5`}>
          <ResearchSourceCardCover identity={identity} />
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${keyless ? "border-good/30 bg-good/10" : "border-accent/30 bg-accent-soft text-accent"}`}>
              {keyless ? tx("가입·키 없음") : tx("무료 서버 키 필요")}
            </span>
            <span className="text-xs text-fg-2">{tx(WORKFLOW[provider])}</span>
          </div>
          <h3 className="text-lg font-bold">{RESOURCE_LABELS[provider]}</h3>
          <p className="flex items-center gap-2 text-sm font-semibold text-fg-2">
            <span aria-hidden="true" className="resource-source-dot" />
            {identity.tagline}
          </p>
          <p className="flex-1 text-sm leading-7 text-fg-2">{tx(config.intro)}</p>
          <Link className={`${RESOURCE_BUTTON} self-start bg-accent-soft`} to={`/research/open-data/${provider}`}>
            {tx("검색 도구 열기")}
          </Link>
        </article>;
      })}
      </StaggerReveal>
    </section>
    <section className="flex flex-wrap gap-3 rounded-2xl border border-line bg-panel p-6">
      <Link className={RESOURCE_BUTTON} to="/research">{tx("전체 저장 보드")}</Link>
      <Link className={RESOURCE_BUTTON} to="/research/material-assets">{tx("무료 소재 도감")}</Link>
      <Link className={RESOURCE_BUTTON} to="/research/open-creation">{tx("무료 창작 재료실")}</Link>
      <Link className={RESOURCE_BUTTON} to="/insights/resources">{tx("전체 제공처·연동 상태")}</Link>
    </section>
  </ResourceLayout>;
}

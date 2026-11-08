import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { MotionIllustration, type MotionIllustrationName } from "@/shared/motion-assets";
import { searchYouTubeLearningResources, type YouTubeLearningSearchResponse } from "./learning-resource-client";
import {
  CURATED_LEARNING_RESOURCES,
  LEARNING_RESOURCE_FORMATS,
  LEARNING_RESOURCE_SOURCES,
  LEARNING_ROLES,
  PRODUCTION_STEPS,
  PRODUCTION_STEP_LABELS,
  RESOURCE_FORMAT_LABELS,
  RESOURCE_SOURCE_LABELS,
  ROLE_LABELS,
  filterLearningResources,
  rankLearningResources,
  type LearningResource,
  type LearningResourceFormat,
  type LearningResourceSource,
  type LearningRole,
  type ProductionStep,
} from "./learning-resources";
import { LEARNING_LEVELS, type LearningLevel } from "./learning-paths";
import { learnStatusText } from "./learn-status-i18n";

const LEVEL_LABELS: Readonly<Record<LearningLevel, string>> = {
  starter: "처음 시작",
  growing: "기초를 익힌 뒤",
  advanced: "완성·연재 단계",
};

/** 자료 형식별 큐레이션 카드 썸네일 일러스트. */
const RESOURCE_FORMAT_ILLUSTRATIONS: Readonly<Record<LearningResourceFormat, MotionIllustrationName>> = {
  course: "lightbulb",
  video: "camera",
  article: "scroll",
  guide: "sparkles",
  worksheet: "pen-tool",
} as const;

function oneOf<T extends string>(value: string | null, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function ResourceAction({ resource }: { readonly resource: LearningResource }) {
  const label = resource.external ? "원문 보기 ↗" : "강좌 열기 →";
  const actionClass =
    "academy-resource-primary inline-flex min-h-11 items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  if (resource.external) {
    return <a className={actionClass} href={resource.url} target="_blank" rel="noopener noreferrer">{label}</a>;
  }
  return <Link className={actionClass} to={resource.url}>{label}</Link>;
}

function ResourceCard({ resource }: { readonly resource: LearningResource }) {
  const thumbnail = RESOURCE_FORMAT_ILLUSTRATIONS[resource.format];
  return (
    <article className="academy-resource-card">
      <div className="academy-resource-thumbnail" aria-hidden="true">
        <MotionIllustration name={thumbnail} size="lg" animated={false} />
      </div>
      <div className="academy-resource-card-head">
        <span>{RESOURCE_SOURCE_LABELS[resource.source]}</span>
        {resource.verified && <span className="academy-verified">공식·검증 출처</span>}
      </div>
      <div className="academy-resource-meta">
        <span>{RESOURCE_FORMAT_LABELS[resource.format]}</span>
        <span>{LEVEL_LABELS[resource.level]}</span>
        <span>{resource.language === "ko" ? "한국어" : "영어"}</span>
      </div>
      <h2>{resource.title}</h2>
      <p>{resource.summary}</p>
      <div className="academy-resource-tags" role="group" aria-label="관련 제작 단계">
        {resource.steps.map((step) => <span key={step}>{PRODUCTION_STEP_LABELS[step]}</span>)}
      </div>
      <p className="academy-resource-provider">{resource.provider} · {resource.rights === "internal" ? "자체 콘텐츠" : "외부 사이트 링크"}</p>
      {resource.note && <p className="academy-resource-note">{resource.note}</p>}
      <div className="academy-resource-actions">
        <ResourceAction resource={resource} />
        {resource.practicePath && (
          <a
            className="inline-flex min-h-11 items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            href={resource.practicePath}
            target="_blank"
            rel="noopener noreferrer"
          >
            바로 실습 ↗
          </a>
        )}
        {resource.lessonId && resource.external && (
          <Link
            className="inline-flex min-h-11 items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            to={`/learn/lessons/${encodeURIComponent(resource.lessonId)}`}
          >
            관련 자체 강좌 →
          </Link>
        )}
      </div>
    </article>
  );
}

export function LearningResourcesPage() {
  const [params, setParams] = useSearchParams();
  const [youtubeQuery, setYoutubeQuery] = useState("");
  const [youtubeState, setYoutubeState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [youtubeResult, setYoutubeResult] = useState<YouTubeLearningSearchResponse | null>(null);
  const [skillTrack, setSkillTrack] = useState<"storyboard-pacing" | "anatomy-croquis" | "bg3d-perspective" | "color-lighting">("storyboard-pacing");

  useEffect(() => { document.title = "강좌·자료 라이브러리 · 툰스튜디오"; }, []);

  const query = (params.get("q") ?? "").slice(0, 200);
  const role = oneOf(params.get("role"), LEARNING_ROLES) ? params.get("role") as LearningRole : "all";
  const source = oneOf(params.get("source"), LEARNING_RESOURCE_SOURCES) ? params.get("source") as LearningResourceSource : "all";
  const format = oneOf(params.get("format"), LEARNING_RESOURCE_FORMATS) ? params.get("format") as LearningResourceFormat : "all";
  const level = oneOf(params.get("level"), LEARNING_LEVELS) ? params.get("level") as LearningLevel : "all";
  const step = oneOf(params.get("step"), PRODUCTION_STEPS) ? params.get("step") as ProductionStep : "all";

  const visibleResources = useMemo(() => {
    const filtered = filterLearningResources(CURATED_LEARNING_RESOURCES, { query, role, source, format, level, step });
    return role === "all" ? filtered : rankLearningResources(filtered, role);
  }, [format, level, query, role, source, step]);

  function setFilter(key: string, value: string, replace = false) {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace });
  }

  async function searchYouTube(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = youtubeQuery.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, 120);
    if (normalized.length < 2) return;
    setYoutubeState("loading");
    setYoutubeResult(null);
    try {
      const result = await searchYouTubeLearningResources(normalized);
      setYoutubeResult(result);
      setYoutubeState("done");
    } catch {
      setYoutubeState("error");
    }
  }

  return (
    <div className="learn-page academy-resources-page" data-own-control-size="" lang="ko">
      <header className="academy-page-hero">
        <div>
          <p className="learn-eyebrow">ACADEMY RESOURCE HUB</p>
          <h1>좋은 강의를 찾고,<br />바로 작업으로 연결하세요.</h1>
          <p className="learn-intro">자체 실습 강좌와 공공·공식 교육 자료를 한곳에서 찾습니다. 외부 자료는 원문을 존중해 링크 중심으로 제공하고, 가능한 경우 툰스튜디오 실습으로 바로 이어집니다.</p>
        </div>
        <aside>
          <strong>{CURATED_LEARNING_RESOURCES.length}</strong>
          <span>현재 큐레이션 자료</span>
          <p>검증된 공식 출처를 우선 노출합니다. YouTube 실시간 검색 결과는 별도로 표시하며 자동으로 공식 강좌로 간주하지 않습니다.</p>
        </aside>
      </header>

      <section className="academy-resource-discovery" aria-labelledby="resource-library-title">
        <div className="learn-section-heading">
          <div><p className="learn-eyebrow">CURATED LIBRARY</p><h2 id="resource-library-title">웹툰 제작 전 과정을 찾는 자료 라이브러리</h2></div>
          <p className="learn-small">스토리 → 콘티 → 작화 → 채색 → 배경 → 게시까지 제작 단계로 좁혀보세요.</p>
        </div>
        <div
          data-own-control-size=""
          data-testid="learn-resources-rea-skilltree-bar"
          role="group"
          aria-label="REA 직무별 스킬트리 및 실습 키트 매처"
          className="mb-4 rounded-2xl border border-line bg-card/90 p-3.5 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="font-extrabold text-accent">
              COLOSO · CLASS101 · PROKO · CGMA · DRAWABOX · SCOTT ROBERTSON 직무 스킬트리 & 1-Click 필터 매처
            </strong>
            <span data-testid="learn-resources-rea-match-badge" className="rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-accent">
              매칭 자료 {visibleResources.length}개 · 현재 직군 {role === "all" ? "전체" : ROLE_LABELS[role]}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="직무별 커리큘럼 스킬트리">
            {([
              { id: "storyboard-pacing", label: "① 스토리·연출 콘티 (Save the Cat! · 필름문법)", roleValue: "story", stepValue: "storyboard", desc: "Save the Cat! 15비트 서사 구조와 스크롤 호흡·컷 연출 강좌를 즉시 필터링합니다." },
              { id: "anatomy-croquis", label: "② 인체 해부학·선화 (Proko · Vilppu · 포스드로잉)", roleValue: "line-art", stepValue: "lineart", desc: "Proko·Glenn Vilppu 제스처 드로잉과 필압 선화·펜터치 교정 자료를 즉시 연결합니다." },
              { id: "bg3d-perspective", label: "③ 3D 배경·투시 도법 (Drawabox · SketchUp · LT)", roleValue: "background", stepValue: "background", desc: "Drawabox·Scott Robertson 투시 도법과 SketchUp/Blender 6-Pass 은선 추출 자료를 매칭합니다." },
              { id: "color-lighting", label: "④ 채색·시네마틱 조명 (Marco Bucci · ShotDeck)", roleValue: "color", stepValue: "coloring", desc: "Marco Bucci 색채 설계·림라이트/역광 보정·그라데이션 맵 채색 커리큘럼을 매칭합니다." },
            ] as const).map((track) => (
              <button
                key={track.id}
                type="button"
                aria-pressed={skillTrack === track.id}
                data-testid={`learn-resources-rea-track-${track.id}`}
                onClick={() => {
                  setSkillTrack(track.id);
                  const next = new URLSearchParams(params);
                  next.set("role", track.roleValue);
                  next.set("step", track.stepValue);
                  setParams(next);
                }}
                className={
                  skillTrack === track.id
                    ? "inline-flex min-h-11 items-center rounded-lg border border-accent bg-accent px-3.5 py-2 font-bold text-on-accent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    : "inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-3.5 py-2 text-fg-2 transition-colors hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                }
              >
                {track.label}
              </button>
            ))}
          </div>
          <p data-testid="learn-resources-rea-skilltree-status" className="mt-2 rounded-xl border border-line bg-panel/70 px-3 py-2 text-[11px] leading-relaxed text-fg-2">
            {skillTrack === "storyboard-pacing"
              ? "콜로소·CGMA·Save the Cat! 기준: 로그라인 설계 → 15비트 플롯 → 스마트폰 세로 스크롤 시선 유도 콘티 실습으로 이어집니다."
              : skillTrack === "anatomy-croquis"
                ? "Proko·New Masters Academy·Vilppu 기준: 30초 포스(Force) 크로키 → 해부학 랜드마크 → G펜/벡터 선화 필압 정리로 이어집니다."
                : skillTrack === "bg3d-perspective"
                  ? "Drawabox·Scott Robertson·ACON3D 기준: 1·2·3점 투시 그리드 → 3D 에셋 카메라 화각(24~50mm) → 6패스 은선 합성으로 이어집니다."
                  : "Marco Bucci·ShotDeck·Schoolism 기준: 평면 밑색 분리 → 색온도 대비(한색 그림자·난색 조명) → 대기원근 후보정으로 이어집니다."}
          </p>
        </div>
        <div className="academy-resource-filters" role="group" aria-label="자료 검색 및 필터">
          <label className="academy-wide-filter" htmlFor="academy-resource-search">자료 검색
            <input id="academy-resource-search" type="search" maxLength={200} value={query} placeholder="예: 액션 콘티, 투시, 채색, 포트폴리오" onChange={(event) => setFilter("q", event.currentTarget.value, true)} />
          </label>
          <label htmlFor="academy-role-filter">직군
            <select id="academy-role-filter" value={role} onChange={(event) => setFilter("role", event.currentTarget.value)}>
              <option value="all">모든 직군</option>
              {LEARNING_ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}
            </select>
          </label>
          <label htmlFor="academy-step-filter">제작 단계
            <select id="academy-step-filter" value={step} onChange={(event) => setFilter("step", event.currentTarget.value)}>
              <option value="all">모든 단계</option>
              {PRODUCTION_STEPS.map((item) => <option key={item} value={item}>{PRODUCTION_STEP_LABELS[item]}</option>)}
            </select>
          </label>
          <label htmlFor="academy-source-filter">출처
            <select id="academy-source-filter" value={source} onChange={(event) => setFilter("source", event.currentTarget.value)}>
              <option value="all">모든 출처</option>
              {LEARNING_RESOURCE_SOURCES.filter((item) => item !== "youtube").map((item) => <option key={item} value={item}>{RESOURCE_SOURCE_LABELS[item]}</option>)}
            </select>
          </label>
          <label htmlFor="academy-format-filter">형식
            <select id="academy-format-filter" value={format} onChange={(event) => setFilter("format", event.currentTarget.value)}>
              <option value="all">모든 형식</option>
              {LEARNING_RESOURCE_FORMATS.map((item) => <option key={item} value={item}>{RESOURCE_FORMAT_LABELS[item]}</option>)}
            </select>
          </label>
          <label htmlFor="academy-level-filter">난이도
            <select id="academy-level-filter" value={level} onChange={(event) => setFilter("level", event.currentTarget.value)}>
              <option value="all">모든 난이도</option>
              {LEARNING_LEVELS.map((item) => <option key={item} value={item}>{LEVEL_LABELS[item]}</option>)}
            </select>
          </label>
        </div>
        <div className="academy-resource-result-row">
          <p role="status">검색 결과 <strong>{visibleResources.length}</strong>개</p>
          {params.size > 0 && (
            <button
              type="button"
              className="min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              onClick={() => setParams({})}
            >
              필터 초기화
            </button>
          )}
        </div>
        {visibleResources.length > 0
          ? <div className="academy-resource-grid">{visibleResources.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}</div>
          : (
            <div className="learn-empty">
              <h2>{learnStatusText("learn.status.resources.empty", "조건에 맞는 자료가 없습니다.")}</h2>
              <p>직군이나 제작 단계 필터를 넓혀 보세요.</p>
              <button
                type="button"
                className="min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                onClick={() => setParams({})}
              >
                전체 자료 보기
              </button>
            </div>
          )}
      </section>

      <section className="academy-youtube-search" aria-labelledby="academy-youtube-title">
        <div className="academy-youtube-copy">
          <p className="learn-eyebrow">YOUTUBE DISCOVERY</p>
          <h2 id="academy-youtube-title">공개 영상도 필요할 때만 검색</h2>
          <p>서버에 YouTube Data API 키가 연결되어 있으면 공개 메타데이터 검색 결과를 가져옵니다. 영상이나 자막을 복제하지 않으며, 검색 결과는 외부 콘텐츠이므로 공식 커리큘럼과 구분해 표시합니다.</p>
          <form onSubmit={(event) => void searchYouTube(event)}>
            <label htmlFor="academy-youtube-query">찾고 싶은 기술
              <input id="academy-youtube-query" value={youtubeQuery} maxLength={120} placeholder="예: 손 그리기, 액션 연출, 배경 투시" onChange={(event) => setYoutubeQuery(event.currentTarget.value)} />
            </label>
            <button
              type="submit"
              className="min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              disabled={youtubeQuery.trim().length < 2 || youtubeState === "loading"}
            >
              {youtubeState === "loading" ? learnStatusText("learn.status.resources.searching", "검색 중…") : "YouTube에서 찾기"}
            </button>
          </form>
        </div>

        <div className="academy-youtube-results" aria-live="polite">
          {youtubeState === "idle" && <p>검색어를 입력하면 YouTube의 공개 영상 메타데이터를 별도 영역에서 확인할 수 있습니다.</p>}
          {youtubeState === "error" && <p>{learnStatusText("learn.status.resources.apiUnavailable", "현재 API 검색을 사용할 수 없습니다. 잠시 후 다시 시도하거나 YouTube 검색으로 이동하세요.")}</p>}
          {youtubeResult && !youtubeResult.configured && (
            <div className="academy-youtube-fallback">
              <strong>YouTube API가 아직 연결되지 않았습니다.</strong>
              <p>서비스 동작은 유지됩니다. API 키를 설정하기 전에는 외부 검색 페이지로 안전하게 연결합니다.</p>
              <a
                className="inline-flex min-h-11 items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                href={youtubeResult.fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                YouTube 검색 열기 ↗
              </a>
            </div>
          )}
          {youtubeResult?.configured && youtubeResult.items.length === 0 && <p>{learnStatusText("learn.status.resources.youtubeLoadFailed", "검색 결과를 가져오지 못했습니다. 검색어를 바꾸거나 직접 YouTube 검색을 열어보세요.")}</p>}
          {youtubeResult?.configured && youtubeResult.items.length > 0 && (
            <div className="academy-youtube-grid">
              {youtubeResult.items.map((video) => (
                <article key={video.id}>
                  {video.thumbnailUrl && <img src={video.thumbnailUrl} alt="" width={320} height={180} loading="lazy" referrerPolicy="no-referrer" />}
                  <div>
                    <span>검수 전 외부 영상 · {video.channelTitle}</span>
                    <h3>{video.title}</h3>
                    <p>{video.description}</p>
                    <a
                      className="inline-flex min-h-11 items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      YouTube에서 보기 ↗
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
          {youtubeResult && (
            <a
              className="academy-youtube-direct inline-flex min-h-11 items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              href={youtubeResult.fallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              YouTube 전체 검색 결과 ↗
            </a>
          )}
        </div>
      </section>

      <section className="learn-banner">
        <div>
          <p className="learn-eyebrow">TEACH WITH IT</p>
          <h2>좋은 자료를 수업 흐름으로 묶으세요.</h2>
          <p>교육기관용 Classroom에서 주차별 자체 강좌와 외부 자료, 과제를 하나의 커리큘럼으로 구성할 수 있습니다.</p>
        </div>
        <Link
          className="learn-secondary inline-flex min-h-11 items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          to="/learn/classroom"
        >
          Classroom 열기 →
        </Link>
      </section>
    </div>
  );
}

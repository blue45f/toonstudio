/**
 * 타 사이트 표준 재사용 실무 레시피 6선 패널.
 *
 * 각 레시피 카드마다:
 * ① 쉬운 비유 & 한 줄 요약 → ② SVG 흐름 도식 → ③ API·인터페이스 명세 표 →
 * ④ 실제 ToonStudio 핵심 소스 코드(원본 경로 + 복사 버튼) → ⑤ 타 사이트 3단계 표준 도입 가이드 →
 * ⑥ 실무 함정(Gotcha) + 발표자 대본(Speaker Notes) 토글 + 공식 문서 링크를 제공한다.
 */

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileCode2,
  Film,
  Layers,
  LayoutList,
  Lightbulb,
  Mic,
} from "lucide-react";
import { useState } from "react";

import { EngineeringCodeBlock } from "../EngineeringCodeBlock";
import { TechSeminarRecipeSvgDiagram } from "./TechSeminarRecipeSvgDiagram";
import type {
  TechSeminarChapterId,
  TechSeminarLinkedRecipeId,
} from "./tech-seminar-remotion-data";
import {
  SEMINAR_RECIPE_FILTERS,
  TECH_SEMINAR_REUSABLE_RECIPES,
  type SeminarRecipeCategory,
  type TechSeminarReusableRecipe,
} from "./tech-seminar-reusable-recipes";

import { cx } from "@/shared/lib/cx";

export interface TechSeminarReusableCodePanelProps {
  readonly activeRecipeId: TechSeminarLinkedRecipeId;
  readonly onSelectRecipeId: (id: TechSeminarLinkedRecipeId) => void;
  readonly onJumpToMotionChapter?: (chapterId: TechSeminarChapterId) => void;
}

type RecipeDisplayMode = "focused" | "all";

function RecipeCard({
  recipe,
  speakerNotesOpen,
  onToggleSpeakerNotes,
  onJumpToMotionChapter,
}: {
  readonly recipe: TechSeminarReusableRecipe;
  readonly speakerNotesOpen: boolean;
  readonly onToggleSpeakerNotes: () => void;
  readonly onJumpToMotionChapter?: (chapterId: TechSeminarChapterId) => void;
}) {
  const notesPanelId = `recipe-speaker-notes-${recipe.id}`;

  return (
    <article
      id={`seminar-recipe-${recipe.id}`}
      data-seminar-recipe-card={recipe.id}
      className="grid gap-5 rounded-[2rem] border border-line/80 bg-card/80 p-5 shadow-sm sm:p-7"
    >
      {/* 카드 머리말 */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line/70 pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-black text-on-accent">
              레시피 0{recipe.order}
            </span>
            <span className="inline-flex items-center rounded-full border border-line bg-panel px-2.5 py-0.5 text-xs font-bold text-fg-2">
              {recipe.badge}
            </span>
          </div>
          <h4 className="mt-2.5 text-balance break-keep text-xl font-black tracking-tight text-fg sm:text-2xl">
            {recipe.title}
          </h4>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onJumpToMotionChapter ? (
            <button
              type="button"
              onClick={() => onJumpToMotionChapter(recipe.relatedChapterId)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3.5 py-2 text-xs font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
            >
              <Film size={15} aria-hidden="true" />
              모션 도식에서 보기
            </button>
          ) : null}
          <button
            type="button"
            aria-expanded={speakerNotesOpen}
            aria-controls={notesPanelId}
            onClick={onToggleSpeakerNotes}
            className={cx(
              "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
              speakerNotesOpen
                ? "border-accent bg-accent text-on-accent"
                : "border-accent/40 bg-accent-soft/45 text-accent hover:bg-accent hover:text-on-accent",
            )}
          >
            <Mic size={15} aria-hidden="true" />
            {speakerNotesOpen ? "발표자 대본 닫기" : "발표자 대본 보기"}
          </button>
        </div>
      </header>

      {/* ① 쉬운 비유 + 한 줄 요약 */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-accent/25 bg-accent-soft/25 p-4">
          <p className="flex items-center gap-1.5 text-xs font-black text-accent">
            <Lightbulb size={15} aria-hidden="true" />
            쉬운 비유
          </p>
          <p className="mt-1.5 break-keep text-sm leading-7 text-fg">{recipe.analogy}</p>
        </div>
        <div className="rounded-2xl border border-line bg-panel/80 p-4">
          <p className="flex items-center gap-1.5 text-xs font-black text-fg-2">
            <CheckCircle2 size={15} className="text-good" aria-hidden="true" />
            핵심 한 줄 요약
          </p>
          <p className="mt-1.5 break-keep text-sm font-semibold leading-7 text-fg">
            {recipe.oneLineSummary}
          </p>
        </div>
      </div>

      {/* 발표자 대본 토글 패널 */}
      {speakerNotesOpen ? (
        <section
          id={notesPanelId}
          aria-label={`${recipe.title} 발표자 대본`}
          data-seminar-speaker-notes={recipe.id}
          className="rounded-2xl border border-accent/40 bg-raised p-4 sm:p-5"
        >
          <p className="flex items-center gap-2 text-xs font-black text-accent">
            <Mic size={15} aria-hidden="true" />
            현장 발표자 대본 (약 2분 분량 · 그대로 읽어도 자연스러운 구어체)
          </p>
          <ol className="mt-3 grid gap-2.5">
            {recipe.speakerNotes.map((line, index) => (
              <li
                key={line}
                className="flex items-start gap-3 rounded-xl border border-line/70 bg-card/80 px-3.5 py-2.5 text-sm leading-7 text-fg"
              >
                <span className="mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[0.72rem] font-black text-on-accent">
                  {index + 1}
                </span>
                <span className="break-keep">{line}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* ② SVG 흐름 도식 */}
      <TechSeminarRecipeSvgDiagram recipeId={recipe.id} diagram={recipe.diagram} />

      {/* ③ API · 인터페이스 명세 표 */}
      <section aria-labelledby={`recipe-api-${recipe.id}`} className="grid gap-2.5">
        <h5 id={`recipe-api-${recipe.id}`} className="text-sm font-black text-fg">
          API · 핵심 인터페이스 명세
        </h5>
        <div className="overflow-x-auto rounded-2xl border border-line/80 bg-panel/60">
          <table className="w-full min-w-[680px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line bg-raised/70 text-fg-2">
                <th scope="col" className="px-3.5 py-2.5 font-black">엔드포인트 / 심볼</th>
                <th scope="col" className="px-3.5 py-2.5 font-black">구분</th>
                <th scope="col" className="px-3.5 py-2.5 font-black">요청 · 입력 계약</th>
                <th scope="col" className="px-3.5 py-2.5 font-black">응답 · 출력 계약</th>
                <th scope="col" className="px-3.5 py-2.5 font-black">실패 · 보안 경계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 text-fg-2">
              {recipe.apiSpecs.map((spec) => (
                <tr key={spec.endpointOrSymbol} className="align-top">
                  <td className="px-3.5 py-3 font-mono font-bold text-fg">{spec.endpointOrSymbol}</td>
                  <td className="whitespace-nowrap px-3.5 py-3 font-bold text-accent">{spec.methodOrKind}</td>
                  <td className="px-3.5 py-3 leading-6">{spec.requestOrInput}</td>
                  <td className="px-3.5 py-3 leading-6">{spec.responseOrOutput}</td>
                  <td className="px-3.5 py-3 leading-6">{spec.errorContract}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ④ 실제 ToonStudio 핵심 소스 코드 발췌 + 원본 파일 칩 */}
      <section aria-labelledby={`recipe-code-${recipe.id}`} className="grid gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h5 id={`recipe-code-${recipe.id}`} className="text-sm font-black text-fg">
            실제 ToonStudio 핵심 소스 코드
          </h5>
          <div className="flex flex-wrap gap-1.5">
            {recipe.repoEvidencePaths.map((path) => (
              <span
                key={path}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2 py-1 font-mono text-[0.68rem] text-fg-3"
              >
                <FileCode2 size={12} aria-hidden="true" />
                {path}
              </span>
            ))}
          </div>
        </div>
        <EngineeringCodeBlock
          code={recipe.codeExcerpt.code}
          language={recipe.codeExcerpt.language}
          title={recipe.codeExcerpt.title}
          sourcePath={recipe.codeExcerpt.sourcePath}
        />
      </section>

      {/* ⑤ 타 사이트 표준 도입 3단계 가이드 */}
      <section aria-labelledby={`recipe-adopt-${recipe.id}`} className="grid gap-3">
        <h5 id={`recipe-adopt-${recipe.id}`} className="text-sm font-black text-fg">
          다른 웹 프로젝트에 바로 옮기는 3단계 절차
        </h5>
        <ol className="grid gap-3 lg:grid-cols-3">
          {recipe.adoptionSteps.map((step) => (
            <li
              key={step.step}
              className="flex flex-col justify-between gap-3 rounded-2xl border border-line/75 bg-panel/70 p-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-7 items-center justify-center rounded-full bg-accent text-xs font-black text-on-accent">
                    {step.step}
                  </span>
                  <span className="break-keep text-sm font-black text-fg">{step.title}</span>
                </div>
                <p className="mt-2.5 break-keep text-xs leading-6 text-fg-2">{step.action}</p>
              </div>
              <p className="rounded-xl border border-good/30 bg-good/10 px-3 py-2 text-[0.72rem] font-semibold leading-5 text-fg-2">
                <strong className="mr-1 text-good">완료 기준</strong>
                {step.check}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ⑥ 실무 함정(Gotcha) & 공식 문서 링크 */}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section
          aria-labelledby={`recipe-gotchas-${recipe.id}`}
          className="rounded-2xl border border-warn/30 bg-warn/8 p-4"
        >
          <h5
            id={`recipe-gotchas-${recipe.id}`}
            className="flex items-center gap-1.5 text-sm font-black text-fg"
          >
            <AlertTriangle size={16} className="text-warn" aria-hidden="true" />
            현장에서 자주 밟는 실무 함정 (Gotcha)
          </h5>
          <ul className="mt-2.5 grid gap-2">
            {recipe.gotchas.map((gotcha) => (
              <li
                key={gotcha}
                className="flex items-start gap-2.5 break-keep text-xs leading-6 text-fg-2"
              >
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warn" aria-hidden="true" />
                <span>{gotcha}</span>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby={`recipe-links-${recipe.id}`}
          className="rounded-2xl border border-line/80 bg-panel/75 p-4"
        >
          <h5
            id={`recipe-links-${recipe.id}`}
            className="flex items-center gap-1.5 text-sm font-black text-fg"
          >
            <BookOpen size={16} className="text-accent" aria-hidden="true" />
            관련 공식 문서 · 표준 스펙
          </h5>
          <ul className="mt-2.5 grid gap-2">
            {recipe.officialLinks.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold text-fg transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                >
                  <span className="min-w-0 truncate">{link.label}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[0.68rem] text-fg-3">
                    <span>{link.kind}</span>
                    <ExternalLink size={13} aria-hidden="true" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}

export function TechSeminarReusableCodePanel({
  activeRecipeId,
  onSelectRecipeId,
  onJumpToMotionChapter,
}: TechSeminarReusableCodePanelProps) {
  const [categoryFilter, setCategoryFilter] = useState<"all" | SeminarRecipeCategory>("all");
  const [displayMode, setDisplayMode] = useState<RecipeDisplayMode>("focused");
  const [openNotesById, setOpenNotesById] = useState<Readonly<Record<string, boolean>>>({});

  const filteredRecipes =
    categoryFilter === "all"
      ? TECH_SEMINAR_REUSABLE_RECIPES
      : TECH_SEMINAR_REUSABLE_RECIPES.filter((recipe) => recipe.category === categoryFilter);

  const focusedRecipe =
    filteredRecipes.find((recipe) => recipe.id === activeRecipeId) ??
    filteredRecipes[0] ??
    TECH_SEMINAR_REUSABLE_RECIPES[0];

  const visibleRecipes = displayMode === "all" ? filteredRecipes : [focusedRecipe];

  const toggleNotes = (recipeId: TechSeminarLinkedRecipeId): void => {
    setOpenNotesById((prev) => ({ ...prev, [recipeId]: !prev[recipeId] }));
  };

  return (
    <section
      id="seminar-reusable-recipes"
      aria-labelledby="seminar-recipes-title"
      data-seminar-reusable-panel="true"
      className="grid gap-5 rounded-[2rem] border border-line/80 bg-panel/65 p-5 shadow-sm sm:p-7"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow text-accent">REUSABLE PRODUCTION RECIPES</span>
            <span className="inline-flex items-center rounded-full border border-line bg-card px-2.5 py-0.5 text-[0.72rem] font-bold text-fg-2">
              실무 표준 레시피 6선 · 실제 코드 검증 완료
            </span>
          </div>
          <h3
            id="seminar-recipes-title"
            className="text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl"
          >
            다른 웹 프로젝트에 바로 옮겨 쓰는 핵심 실무 레시피 6선
          </h3>
          <p className="max-w-3xl break-keep text-sm leading-7 text-fg-2">
            ToonStudio 운영 코드에서 검증한 카카오·구글 OAuth, 포인터 DnD, 핵심 라이브러리 5종,
            WebGPU CPU 동등성, 오프라인 멱등 큐·₩0 배포 패턴을 API 명세·SVG 도식·3단계 도입 절차와
            함께 정리했습니다.
          </p>
        </div>

        {/* 발표 집중 보기 vs 6선 전체 펼치기 */}
        <div
          role="group"
          aria-label="레시피 표시 방식"
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            aria-pressed={displayMode === "focused"}
            onClick={() => setDisplayMode("focused")}
            className={cx(
              "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
              displayMode === "focused"
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
            )}
          >
            <Layers size={15} aria-hidden="true" />
            발표 집중 보기 (1개씩)
          </button>
          <button
            type="button"
            aria-pressed={displayMode === "all"}
            onClick={() => setDisplayMode("all")}
            className={cx(
              "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
              displayMode === "all"
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
            )}
          >
            <LayoutList size={15} aria-hidden="true" />
            6선 전체 펼치기
          </button>
        </div>
      </header>

      {/* 영역 필터 + 6개 레시피 탭 레일 */}
      <div className="grid gap-3">
        <div
          role="group"
          aria-label="실무 레시피 영역 필터"
          className="flex flex-wrap gap-2"
        >
          {SEMINAR_RECIPE_FILTERS.map((filter) => {
            const active = categoryFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setCategoryFilter(filter.id);
                  const nextList =
                    filter.id === "all"
                      ? TECH_SEMINAR_REUSABLE_RECIPES
                      : TECH_SEMINAR_REUSABLE_RECIPES.filter((item) => item.category === filter.id);
                  if (nextList[0] && !nextList.some((item) => item.id === activeRecipeId)) {
                    onSelectRecipeId(nextList[0].id);
                  }
                }}
                className={cx(
                  "min-h-11 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <div
          role="group"
          aria-label="실무 레시피 직접 선택"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filteredRecipes.map((recipe) => {
            const selected = displayMode === "focused" && recipe.id === focusedRecipe.id;
            return (
              <button
                key={recipe.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  onSelectRecipeId(recipe.id);
                  setDisplayMode("focused");
                }}
                className={cx(
                  "flex min-h-14 flex-col items-start justify-center rounded-2xl border px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                  selected
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
                )}
              >
                <span className="text-[0.7rem] font-extrabold opacity-85">
                  0{recipe.order} · {recipe.badge}
                </span>
                <span className="mt-0.5 line-clamp-1 break-keep text-sm font-black">
                  {recipe.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 선택된 레시피(또는 전체 6선) 카드 목록 */}
      <div className="grid gap-6">
        {visibleRecipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            speakerNotesOpen={Boolean(openNotesById[recipe.id])}
            onToggleSpeakerNotes={() => toggleNotes(recipe.id)}
            onJumpToMotionChapter={onJumpToMotionChapter}
          />
        ))}
      </div>
    </section>
  );
}

import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { RESOURCE_BUTTON } from "./navigation";
import { exerciseSvg, recipeById, RECIPES } from "./recipes";
import { LocalSaveNotice } from "./ResourceLayout";
import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import { Container } from "@/shared/components/container";
import { SectionArt } from "@/shared/components/section-art";
import { downloadText, useCreatorWorkspace } from "./workspace";

import type { Recipe } from "./recipes";

function RecipePreview({ recipe, amount }: { recipe: Recipe; amount: number }) {
  const captions = ["문이 열렸다.", "그런데…", "이곳에 네가 왜?"];
  return <div className="space-y-3">
    <p className="text-xs text-fg-2">직접 제작한 도형 예시 · 완성 원고가 아닌 연출 실험입니다.</p>
    <div className="rounded-xl border border-line bg-canvas p-4" aria-label="실습 예시">
      {captions.map((caption, index) => <div key={caption} className="relative overflow-hidden rounded-lg border border-line" style={{ marginTop: index ? recipe.id === "scroll" ? amount : 20 : 0, height: index === 2 && recipe.id === "beats" ? amount : 140, background: recipe.id === "values" ? `hsl(0 0% ${amount}%)` : "#eeeeee" }}>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 140" aria-hidden="true">
          {recipe.id === "motion" && Array.from({ length: amount }, (_, line) => <line key={`motion-${line}`} x1="15" x2={95 + line % 3 * 20} y1={12 + line * 7} y2={12 + line * 7} stroke="#606060" strokeWidth="2" />)}
          <g transform={`translate(210 90) scale(${recipe.id === "camera" ? amount / 100 : 1})`}>
            <circle cy="-32" r="15" fill="#555" /><path d="M-20 18 Q-24-19 0-14 Q24-19 20 18Z" fill="#555" /><path d="M-10 18L-13 45M10 18L13 45" fill="none" stroke="#555" strokeWidth="9" />
          </g>
        </svg>
        <p className="relative m-3 inline-block rounded-2xl border border-black bg-white px-3 py-2 text-sm text-black" style={{ maxWidth: recipe.id === "dialogue" ? `${amount}ch` : "24ch" }}>{recipe.id === "dialogue" ? "문이 열렸어. 우리가 기다리던 사람이 돌아온 걸까?" : caption}</p>
      </div>)}
    </div>
  </div>;
}
function RecipeLesson({ recipe }: { recipe: Recipe }) {
  const [amount, setAmount] = useState<number>(recipe.initial);
  const { workspace, update, error, ready, saving, writable } = useCreatorWorkspace();
  const completeCount = recipe.steps.filter((_, index) => workspace.checks.includes(`recipe-${recipe.id}-${index}`)).length;
  return <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-7">
    <header><p className="text-sm text-accent">{recipe.tag} · 약 {recipe.minutes}분 실습</p><h2 className="mt-2 text-2xl font-bold">{recipe.title}</h2><p className="mt-3 leading-7 text-fg-2">{recipe.intro}</p></header>
    <div className="grid gap-7 lg:grid-cols-2"><div className="space-y-4">
      <label htmlFor="recipe-amount" className="block font-semibold">{recipe.control}: {amount}</label>
      <input id="recipe-amount" type="range" min={recipe.min} max={recipe.max} value={amount} onChange={(event) => setAmount(Number(event.target.value))} className="min-h-11 w-full accent-current" />
      <RecipePreview recipe={recipe} amount={amount} />
    </div><div className="space-y-4"><p className="font-semibold">실습 체크 · {completeCount}/{recipe.steps.length}</p>
      {recipe.steps.map((step, index) => {
        const id = `recipe-${recipe.id}-${index}`;
        return <label key={id} htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 leading-7">
          <input id={id} type="checkbox" className="mt-1.5 size-5 shrink-0" checked={workspace.checks.includes(id)} disabled={!ready || !writable || saving} onChange={(event) => { const checked = event.target.checked; void update((value) => ({ ...value, checks: checked ? [...new Set([...value.checks, id])] : value.checks.filter((key) => key !== id) })); }} />
          <span>{index + 1}. {step}</span>
        </label>;
      })}
      <p className="rounded-xl bg-accent-soft p-4 text-sm leading-7">{recipe.tip}</p>
      <button className={RESOURCE_BUTTON} onClick={() => downloadText(`${recipe.id}-exercise.svg`, exerciseSvg(recipe, amount), "image/svg+xml;charset=utf-8")}>편집 가능한 SVG 실습 시트</button>
      <p className="text-xs leading-6 text-fg-2">SVG는 빈 컷 프레임입니다. 여백·반응 컷 높이만 시트에 반영하며, 다른 슬라이더는 화면 실험용입니다. 스튜디오에 자동으로 프로젝트를 생성하지 않습니다.</p>
    </div></div>
    <LocalSaveNotice error={error} writable={writable} saving={saving} />
  </section>;
}

/**
 * 실습 목차 — 여섯 실습을 첫 화면에서 펼쳐 보여 고르게 한다.
 * 선택은 지금까지와 같은 ?lesson= 딥링크가 소유하고, 카드가 드롭다운을 대신한다.
 */
function RecipeIndex({ current, onSelect }: { current: Recipe; onSelect: (id: string) => void }) {
  return <section aria-labelledby="recipe-index-title" className="space-y-4">
    <div>
      <h2 id="recipe-index-title" className="text-xl font-bold">실습 고르기</h2>
      <p className="mt-1.5 text-sm leading-6 text-fg-2">여섯 가지 연출 실험 중 하나를 고르면 아래에서 바로 시작합니다. 실습 체크는 이 브라우저에 저장됩니다.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {RECIPES.map((item) => {
        const selected = item.id === current.id;
        return <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          aria-pressed={selected}
          className={`fx-press flex h-full flex-col rounded-2xl border p-5 text-left ${selected ? "border-accent bg-accent-soft" : "border-line bg-panel hover:bg-raised"}`}
        >
          <span className="text-xs font-semibold text-accent">{item.tag} · 약 {item.minutes}분</span>
          <span className="mt-2 font-bold leading-6">{item.title}</span>
          <span className="mt-2 line-clamp-3 text-sm leading-6 text-fg-2">{item.intro}</span>
          <span className="mt-4 text-sm font-semibold">{selected ? "지금 실습 중" : "이 실습 열기 →"}</span>
        </button>;
      })}
    </div>
  </section>;
}

export function RecipesPage() {
  const [params, setParams] = useSearchParams();
  const recipe = recipeById(params.get("lesson"));
  const minutes = RECIPES.map((item) => item.minutes);
  return <Container size="wide" className="py-7 sm:py-10 lg:py-12">
    <CampusObjectSource objects={RECIPES.map((item) => ({
      id: item.id,
      title: item.title,
      href: `/learn/recipes?${new URLSearchParams({ lesson: item.id })}`,
      kind: "recipe",
      exposure: "public",
    }))} />
    <div className="space-y-8">
      <header className="overflow-hidden rounded-3xl border border-line bg-panel">
        <SectionArt image="learn" className="h-28 w-full object-cover sm:h-36" />
        <div className="p-6 sm:p-8">
          <p className="eyebrow text-accent">배우기 · 실습 레시피</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">웹툰 제작 레시피</h1>
          <p className="mt-4 max-w-3xl leading-7 text-fg-2">설명을 읽고 끝내지 말고, 값을 바꾸어 차이를 확인하세요. 여섯 개의 자체 제작 실습과 편집 가능한 컷 시트를 제공합니다.</p>
          <p className="mt-3 text-sm font-semibold text-fg-2">실습 {RECIPES.length}종 · 각 {Math.min(...minutes)}~{Math.max(...minutes)}분 · 슬라이더 실험 + 실습 체크</p>
        </div>
      </header>
      <RecipeIndex current={recipe} onSelect={(id) => setParams({ lesson: id })} />
      <RecipeLesson key={recipe.id} recipe={recipe} />
    </div>
  </Container>;
}

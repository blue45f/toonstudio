import {
  BookOpen,
  Bug,
  ChevronRight,
  Command,
  ExternalLink,
  HelpCircle,
  Home,
  LifeBuoy,
  Search,
  Scale,
  Stethoscope,
  Wrench,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { buildStudioToolHelp } from "./studio-current-tool-help";
import { frozenStatus5Text } from "./status-i18n/studio-frozen5-status-i18n";
import {
  filterStudioHelpRecipes,
  getStudioContextHelpGuide,
  getStudioHelpRecipe,
  STUDIO_HELP_RECIPES,
  type StudioContextHelpView,
  type StudioHelpRecipe,
  type StudioHelpRecipeDestination,
} from "./studio-help-content";
import {
  requestStudioCommandSearch,
  type StudioHelpCenterSection,
} from "./studio-help-center-channel";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface StudioContextHelpDialogProps {
  readonly open: boolean;
  readonly toolCommandId: string | null;
  readonly onClose: () => void;
  readonly onOpenSection: (section: StudioHelpCenterSection) => void;
}

interface QuickActionProps {
  readonly icon: ReactNode;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly visual: string;
  readonly visualPosition?: string;
  readonly onClick: () => void;
}

function QuickAction({ icon, eyebrow, title, description, visual, visualPosition, onClick }: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-52 flex-col overflow-hidden rounded-2xl border border-line/70 bg-card/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-accent/45 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transform-none"
    >
      <span data-studio-help-visual="true" className="relative -mx-4 -mt-4 mb-4 block h-24 overflow-hidden border-b border-line/60 bg-raised">
        <img
          src={visual}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover opacity-90 transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transform-none"
          style={{ objectPosition: visualPosition ?? "center" }}
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card/60 via-transparent to-white/[0.04]" />
      </span>
      <span className="mb-4 inline-flex size-9 items-center justify-center rounded-xl bg-raised text-fg-2 transition group-hover:bg-accent/10 group-hover:text-accent">
        {icon}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-2">
        {eyebrow}
      </span>
      <span className="mt-1 text-sm font-semibold text-fg">{title}</span>
      <span className="mt-2 text-xs leading-5 text-fg-2">{description}</span>
      <ChevronRight className="mt-auto size-4 self-end text-fg-2 transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
    </button>
  );
}

interface HomePanelProps {
  readonly toolCommandId: string | null;
  readonly onViewChange: (view: StudioContextHelpView) => void;
  readonly onOpenSection: (section: StudioHelpCenterSection) => void;
  readonly onOpenCommandSearch: () => void;
  readonly onOpenManual: () => void;
  readonly onOpenRecipe: (recipeId: string) => void;
}

function HomePanel({
  toolCommandId,
  onViewChange,
  onOpenSection,
  onOpenCommandSearch,
  onOpenManual,
  onOpenRecipe,
}: HomePanelProps) {
  const toolHelp = useMemo(
    () => (toolCommandId ? buildStudioToolHelp(toolCommandId) : null),
    [toolCommandId],
  );
  const guide = getStudioContextHelpGuide(toolHelp?.commandId);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-6 sm:px-8 sm:py-8">
      <section className="relative grid overflow-hidden rounded-3xl border border-accent/20 bg-gradient-to-br from-accent/12 via-card to-card p-6 sm:p-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,.9fr)] lg:items-center lg:gap-8">
        <div className="pointer-events-none absolute -right-16 -top-16 size-52 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            <HelpCircle className="size-3.5" aria-hidden="true" />
            작업 흐름을 끊지 않는 도움말
          </span>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            지금 막힌 지점에서 바로 해결하세요
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-fg-2">
            현재 도구의 30초 가이드부터 증상별 점검 순서, 시스템 진단과 복구까지 한 곳에서 연결합니다.
            기능 이름을 알고 있다면 F1 명령 검색이 가장 빠릅니다.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenCommandSearch}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent shadow-sm transition hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <Search className="size-4" aria-hidden="true" />
              기능·설정 찾기
              <kbd className="ml-1 rounded border border-on-accent/25 bg-on-accent/10 px-1.5 py-0.5 text-[10px] font-medium">F1</kbd>
            </button>
            <button
              type="button"
              onClick={() => onViewChange("troubleshooting")}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-canvas/70 px-4 text-sm font-semibold text-fg transition hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Wrench className="size-4" aria-hidden="true" />
              증상으로 해결하기
            </button>
          </div>
        </div>
        <div data-studio-help-hero-visual="true" className="relative mt-6 hidden min-h-56 overflow-hidden rounded-2xl border border-accent/20 bg-raised shadow-lg lg:block">
          <img
            src="/brand/production-os-workspace.svg"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-white/[0.05]" />
          <div className="absolute inset-x-3 bottom-3 flex flex-wrap gap-1.5">
            {["30초 가이드", "문제 진단", "작업 복구"].map((label) => (
              <span key={label} className="rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">{label}</span>
            ))}
          </div>
        </div>
      </section>

      {toolHelp ? (
        <section aria-labelledby="current-tool-help-heading" className="rounded-2xl border border-line bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">지금 선택한 도구</p>
              <h3 id="current-tool-help-heading" className="mt-1 truncate text-lg font-bold text-fg">
                {guide?.title ?? toolHelp.label}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-2">
                {guide?.summary ?? toolHelp.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onViewChange("tool")}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 text-sm font-semibold text-accent transition hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              30초 가이드
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-line bg-raised/30 p-5">
          <p className="text-sm font-semibold text-fg">현재 도구 정보가 아직 연결되지 않았습니다.</p>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            기능·설정 찾기에서 명령 이름을 검색하거나 증상별 해결 레시피를 사용하세요.
          </p>
        </section>
      )}

      <section aria-labelledby="help-paths-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-2">빠른 경로</p>
            <h3 id="help-paths-heading" className="mt-1 text-lg font-bold text-fg">목적에 맞는 도움말 열기</h3>
          </div>
          <p className="hidden text-xs text-fg-2 sm:block">검색 · 학습 · 진단 · 복구</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <QuickAction
            icon={<BookOpen className="size-4" aria-hidden="true" />}
            visual="/brand/theme-scenes/ink-studio.svg"
            visualPosition="center 46%"
            eyebrow="Learn"
            title="현재 도구 익히기"
            description="핵심 결과, 3단계 사용법, 자주 발생하는 문제를 현재 도구 기준으로 봅니다."
            onClick={() => onViewChange("tool")}
          />
          <QuickAction
            icon={<Wrench className="size-4" aria-hidden="true" />}
            visual="/brand/theme-scenes/graphite-studio.svg"
            visualPosition="center 45%"
            eyebrow="Solve"
            title="문제 해결 레시피"
            description="증상을 검색하고 재현 가능한 점검 순서대로 원인을 좁힙니다."
            onClick={() => onViewChange("troubleshooting")}
          />
          <QuickAction
            icon={<Command className="size-4" aria-hidden="true" />}
            visual="/brand/theme-scenes/contrast-studio.svg"
            visualPosition="center 47%"
            eyebrow="Find"
            title="기능·설정 검색"
            description="메뉴 위치를 외우지 않고 기능 이름이나 별칭으로 명령을 찾습니다."
            onClick={onOpenCommandSearch}
          />
          <QuickAction
            icon={<Stethoscope className="size-4" aria-hidden="true" />}
            visual="/brand/theme-scenes/midnight-studio.svg"
            visualPosition="center 43%"
            eyebrow="Inspect"
            title="시스템 진단"
            description="입력 이벤트, 렌더러, GPU와 브라우저 상태를 한 번에 확인합니다."
            onClick={() => onOpenSection("diagnostics")}
          />
          <QuickAction
            icon={<LifeBuoy className="size-4" aria-hidden="true" />}
            visual="/brand/theme-scenes/paper-studio.svg"
            visualPosition="center 48%"
            eyebrow="Recover"
            title="작업 복구"
            description="저장·자동 복구 후보를 확인하고 안전하게 이전 상태로 돌아갑니다."
            onClick={() => onOpenSection("recovery")}
          />
          <QuickAction
            icon={<BookOpen className="size-4" aria-hidden="true" />}
            visual="/brand/theme-scenes/aurora-studio.svg"
            visualPosition="center 44%"
            eyebrow="Reference"
            title="사용자 설명서"
            description="개념과 전체 작업 흐름을 길게 읽어야 할 때 별도 설명서를 엽니다."
            onClick={onOpenManual}
          />
        </div>
      </section>

      <section aria-labelledby="popular-fixes-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-2">자주 막히는 지점</p>
            <h3 id="popular-fixes-heading" className="mt-1 text-lg font-bold text-fg">먼저 확인할 문제</h3>
          </div>
          <button
            type="button"
            onClick={() => onViewChange("troubleshooting")}
            className="text-xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            전체 보기
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {STUDIO_HELP_RECIPES.slice(0, 4).map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              onClick={() => onOpenRecipe(recipe.id)}
              className="flex items-start gap-3 rounded-2xl border border-line/70 bg-card/60 p-4 text-left transition hover:border-accent/35 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-raised text-fg-2">
                <Wrench className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-fg">{recipe.title}</span>
                <span className="mt-1 block text-xs leading-5 text-fg-2">{recipe.summary}</span>
              </span>
              <ChevronRight className="ml-auto mt-1 size-4 shrink-0 text-fg-2" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

interface ToolPanelProps {
  readonly toolCommandId: string | null;
  readonly onOpenRecipe: (recipeId: string) => void;
  readonly onOpenCommandSearch: () => void;
  readonly onOpenDiagnostics: () => void;
}

function ToolPanel({
  toolCommandId,
  onOpenRecipe,
  onOpenCommandSearch,
  onOpenDiagnostics,
}: ToolPanelProps) {
  const help = useMemo(
    () => (toolCommandId ? buildStudioToolHelp(toolCommandId) : null),
    [toolCommandId],
  );
  const guide = getStudioContextHelpGuide(help?.commandId);

  if (!help) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-3xl items-center px-5 py-12 sm:px-8">
        <div className="w-full rounded-3xl border border-dashed border-line bg-card/60 p-8 text-center">
          <HelpCircle className="mx-auto size-10 text-fg-2" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-bold text-fg">{frozenStatus5Text("studio.frozenStatus5.contextHelp.toolUnknown", "현재 도구를 확인할 수 없습니다")}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-fg-2">
            캔버스로 돌아가 도구를 선택한 뒤 다시 열거나, 기능·설정 검색에서 알고 있는 이름을 검색하세요.
          </p>
          <button type="button" onClick={onOpenCommandSearch}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Search className="size-4" aria-hidden="true" />
            기능·설정 찾기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-6 sm:px-8 sm:py-8">
      <header className="rounded-3xl border border-accent/20 bg-gradient-to-br from-accent/10 via-card to-card p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-fg-2">
          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-accent">{guide?.eyebrow ?? "현재 도구"}</span>
          <span>{help.commandId}</span>
          {help.shortcut ? <kbd className="rounded-md border border-line bg-canvas px-2 py-1 font-mono text-[11px] text-fg">{help.shortcut}</kbd> : null}
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          {guide?.title ?? help.label}
        </h2>
        {help.labelEn ? <p className="mt-1 text-sm font-medium text-fg-2">{help.labelEn}</p> : null}
        <p className="mt-4 max-w-2xl text-sm leading-6 text-fg-2">
          {guide?.summary ?? help.description}
        </p>
        {guide ? (
          <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/8 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">완료하면</p>
            <p className="mt-1 text-sm font-medium leading-6 text-fg">{guide.outcome}</p>
          </div>
        ) : null}
      </header>

      {guide ? (
        <>
          <section aria-labelledby="quick-guide-heading" className="rounded-2xl border border-line bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-2">30초 가이드</p>
                <h3 id="quick-guide-heading" className="mt-1 text-lg font-bold text-fg">가장 짧은 성공 경로</h3>
              </div>
              <span className="rounded-full bg-raised px-2.5 py-1 text-xs font-medium text-fg-2">{guide.steps.length}단계</span>
            </div>
            <ol className="mt-5 space-y-4">
              {guide.steps.map((step, index) => (
                <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-3">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-accent/10 text-sm font-bold text-accent">{index + 1}</span>
                  <div className="pt-0.5">
                    <p className="text-sm font-semibold text-fg">{step.title}</p>
                    <p className="mt-1 text-sm leading-6 text-fg-2">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="tool-tips-heading" className="rounded-2xl border border-line bg-card p-5">
              <h3 id="tool-tips-heading" className="text-sm font-bold text-fg">품질을 높이는 팁</h3>
              <ul className="mt-3 space-y-3">
                {guide.tips.map((tip) => (
                  <li key={tip} className="flex gap-2 text-sm leading-6 text-fg-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    {tip}
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="tool-fixes-heading" className="rounded-2xl border border-line bg-card p-5">
              <h3 id="tool-fixes-heading" className="text-sm font-bold text-fg">이럴 때 확인</h3>
              <div className="mt-3 space-y-3">
                {guide.troubleshooting.map((item) => (
                  <div key={item.symptom} className="rounded-xl bg-raised/55 p-3">
                    <p className="text-xs font-semibold text-fg">{item.symptom}</p>
                    <p className="mt-1 text-xs leading-5 text-fg-2">{item.resolution}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section aria-labelledby="related-help-heading" className="rounded-2xl border border-line bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 id="related-help-heading" className="text-sm font-bold text-fg">관련 문제 해결</h3>
              {guide.tutorialId ? (
                <span className="rounded-full bg-raised px-2.5 py-1 text-[11px] font-medium text-fg-2">
                  튜토리얼 연결됨
                </span>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {guide.relatedRecipeIds.map((recipeId) => {
                const recipe = getStudioHelpRecipe(recipeId);
                if (!recipe) return null;
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => onOpenRecipe(recipe.id)}
                    className="flex items-center gap-3 rounded-xl border border-line/70 p-3 text-left transition hover:border-accent/35 hover:bg-raised/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Wrench className="size-4 shrink-0 text-fg-2" aria-hidden="true" />
                    <span className="text-xs font-semibold text-fg">{recipe.title}</span>
                    <ChevronRight className="ml-auto size-4 shrink-0 text-fg-2" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-dashed border-line bg-card/50 p-6">
          <h3 className="text-base font-bold text-fg">{frozenStatus5Text("studio.frozenStatus5.contextHelp.guideInPreparation", "핵심 도구 가이드를 준비 중입니다")}</h3>
          <p className="mt-2 text-sm leading-6 text-fg-2">
            명령 설명과 별칭은 사용할 수 있으며, 상세 작성형 가이드가 없는 도구는 기능·설정 검색과 진단으로 이어집니다.
          </p>
          {help.aliases.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {help.aliases.map((alias) => (
                <span
                  key={`${alias.vendor}:${alias.term}`}
                  className="rounded-full border border-line bg-canvas px-2.5 py-1 text-xs text-fg-2"
                >
                  {alias.term}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-5">
        <button
          type="button"
          onClick={onOpenCommandSearch}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-xs font-semibold text-fg hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Search className="size-3.5" aria-hidden="true" />
          관련 기능 찾기
        </button>
        <button
          type="button"
          onClick={onOpenDiagnostics}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-xs font-semibold text-fg hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Stethoscope className="size-3.5" aria-hidden="true" />
          입력·렌더링 진단
        </button>
      </div>
    </div>
  );
}

interface TroubleshootingPanelProps {
  readonly initialRecipeId: string | null;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly onRunDestination: (destination: StudioHelpRecipeDestination) => void;
}

function RecipeCard({
  recipe,
  emphasized,
  onRunDestination,
}: {
  readonly recipe: StudioHelpRecipe;
  readonly emphasized: boolean;
  readonly onRunDestination: (destination: StudioHelpRecipeDestination) => void;
}) {
  return (
    <article className={`rounded-2xl border bg-card p-5 transition ${emphasized ? "border-accent/55 ring-1 ring-accent/20" : "border-line"}`}>
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-raised text-fg-2">
          <Wrench className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-fg">{recipe.title}</h3>
          <p className="mt-1 text-xs leading-5 text-fg-2">{recipe.summary}</p>
        </div>
      </div>
      <ol className="mt-4 space-y-3 border-t border-line pt-4">
        {recipe.checks.map((check, index) => (
          <li key={check.title} className="grid grid-cols-[1.5rem_1fr] gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-lg bg-accent/10 text-[11px] font-bold text-accent">{index + 1}</span>
            <div>
              <p className="text-xs font-semibold text-fg">{check.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-fg-2">{check.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onRunDestination(recipe.primaryAction)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {recipe.primaryAction.label}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
        {recipe.secondaryAction ? (
          <button
            type="button"
            onClick={() => onRunDestination(recipe.secondaryAction!)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 text-xs font-semibold text-fg hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {recipe.secondaryAction.label}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function TroubleshootingPanel({
  initialRecipeId,
  query,
  onQueryChange,
  onRunDestination,
}: TroubleshootingPanelProps) {
  const recipes = useMemo(() => filterStudioHelpRecipes(query), [query]);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-6 sm:px-8 sm:py-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Troubleshooting</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-fg">증상부터 찾는 문제 해결</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-2">
          기능 이름을 몰라도 괜찮습니다. 보이는 증상을 검색한 뒤 위에서 아래 순서로 확인하면 원인을 빠르게 좁힐 수 있습니다.
        </p>
      </header>

      <label className="mt-6 block">
        <span className="sr-only">문제 해결 검색</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-2" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            type="search"
            placeholder="예: 선이 안 보여요, 채우기가 새요, 저장 복구"
            className="h-11 w-full rounded-xl border border-line bg-canvas pl-10 pr-4 text-sm text-fg outline-none placeholder:text-fg-2 focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </span>
      </label>

      <div className="mt-3 flex items-center justify-between text-xs text-fg-2">
        <span>{recipes.length}개의 해결 경로</span>
        {query ? (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            검색 초기화
          </button>
        ) : null}
      </div>

      {recipes.length > 0 ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              emphasized={recipe.id === initialRecipeId}
              onRunDestination={onRunDestination}
            />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-raised/30 p-8 text-center">
          <Search className="mx-auto size-8 text-fg-2" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-fg">{frozenStatus5Text("studio.frozenStatus5.contextHelp.noRecipes", "일치하는 해결 레시피가 없습니다")}</p>
          <p className="mt-1 text-xs leading-5 text-fg-2">더 짧은 증상으로 검색하거나 F1 기능·설정 검색을 사용하세요.</p>
        </div>
      )}
    </div>
  );
}

export function StudioContextHelpDialog({
  open,
  toolCommandId,
  onClose,
  onOpenSection,
}: StudioContextHelpDialogProps) {
  const [view, setView] = useState<StudioContextHelpView>(() => (toolCommandId ? "tool" : "home"));
  const [recipeQuery, setRecipeQuery] = useState("");
  const [initialRecipeId, setInitialRecipeId] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousRootOverflow = documentElement.style.overflow;
    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";

    const overlay = overlayRef.current;
    const siblings = Array.from(body.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element !== overlay,
    );
    const previousSiblingState = siblings.map((element) => ({
      element,
      inert: element.hasAttribute("inert"),
      ariaHidden: element.getAttribute("aria-hidden"),
    }));

    siblings.forEach((element) => {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousRootOverflow;
      previousSiblingState.forEach(({ element, inert, ariaHidden }) => {
        if (!inert) element.removeAttribute("inert");
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  const openCommandSearch = () => {
    onClose();
    requestStudioCommandSearch();
  };

  const openManual = () => {
    window.open("/studio/manual", "_blank", "noopener,noreferrer");
  };

  const openRecipe = (recipeId: string) => {
    const recipe = getStudioHelpRecipe(recipeId);
    setInitialRecipeId(recipeId);
    setRecipeQuery(recipe?.title ?? "");
    setView("troubleshooting");
  };

  const runDestination = (destination: StudioHelpRecipeDestination) => {
    if (destination.type === "view") {
      setView(destination.view);
      return;
    }
    if (destination.type === "section") {
      onOpenSection(destination.section);
      return;
    }
    if (destination.type === "command-search") {
      openCommandSearch();
      return;
    }
    openManual();
  };

  const internalNav = [
    { id: "home" as const, label: "도움말 홈", icon: <Home className="size-4" aria-hidden="true" /> },
    { id: "tool" as const, label: "현재 도구", icon: <BookOpen className="size-4" aria-hidden="true" /> },
    { id: "troubleshooting" as const, label: "문제 해결", icon: <Wrench className="size-4" aria-hidden="true" /> },
  ];
  const sectionNav = [
    { id: "terminology" as const, label: "용어 사전", icon: <BookOpen className="size-4" aria-hidden="true" /> },
    { id: "diagnostics" as const, label: "시스템 진단", icon: <Stethoscope className="size-4" aria-hidden="true" /> },
    { id: "recovery" as const, label: "작업 복구", icon: <LifeBuoy className="size-4" aria-hidden="true" /> },
    { id: "license" as const, label: "라이선스", icon: <Scale className="size-4" aria-hidden="true" /> },
    { id: "bug-report" as const, label: "버그 보고", icon: <Bug className="size-4" aria-hidden="true" /> },
  ];

  const title = view === "home" ? "도움말 홈" : view === "tool" ? "현재 도구 도움말" : "문제 해결";

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-context-help-title"
        tabIndex={-1}
        className="flex h-[min(900px,94vh)] w-[min(1180px,96vw)] min-w-0 flex-col overflow-hidden rounded-3xl border border-line bg-canvas shadow-2xl outline-none"
      >
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-4 sm:px-5">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <HelpCircle className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-2">ToonStudio Help</p>
            <h1 id="studio-context-help-title" className="truncate text-sm font-bold text-fg">{title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={openCommandSearch}
              className="hidden h-9 items-center gap-2 rounded-lg border border-line bg-raised/50 px-3 text-xs font-semibold text-fg transition hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:inline-flex"
            >
              <Search className="size-3.5" aria-hidden="true" />
              기능 찾기
              <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[10px] text-fg-2">F1</kbd>
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="도움말 닫기"
              className="inline-flex size-9 items-center justify-center rounded-lg text-fg-2 transition hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-raised/20 p-3 md:flex" aria-label="도움말 탐색">
            <nav className="space-y-1">
              {internalNav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  aria-current={view === item.id ? "page" : undefined}
                  className={`flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${view === item.id ? "bg-accent/12 text-accent" : "text-fg-2 hover:bg-raised hover:text-fg"}`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="my-3 border-t border-line" />
            <nav className="space-y-1" aria-label="지원 도구">
              {sectionNav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenSection(item.id)}
                  className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-fg-2 transition hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {item.icon}
                  {item.label}
                  <ChevronRight className="ml-auto size-3.5" aria-hidden="true" />
                </button>
              ))}
            </nav>
            <button
              type="button"
              onClick={openManual}
              className="mt-auto flex items-center gap-2 rounded-xl border border-line bg-canvas p-3 text-left text-xs font-semibold text-fg transition hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ExternalLink className="size-4 text-fg-2" aria-hidden="true" />
              사용자 설명서
            </button>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-line bg-canvas/95 p-2 backdrop-blur md:hidden" aria-label="도움말 탐색">
              {internalNav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  aria-current={view === item.id ? "page" : undefined}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${view === item.id ? "bg-accent/12 text-accent" : "text-fg-2 hover:bg-raised"}`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>

            {view === "home" ? (
              <HomePanel
                toolCommandId={toolCommandId}
                onViewChange={setView}
                onOpenSection={onOpenSection}
                onOpenCommandSearch={openCommandSearch}
                onOpenManual={openManual}
                onOpenRecipe={openRecipe}
              />
            ) : view === "tool" ? (
              <ToolPanel
                toolCommandId={toolCommandId}
                onOpenRecipe={openRecipe}
                onOpenCommandSearch={openCommandSearch}
                onOpenDiagnostics={() => onOpenSection("diagnostics")}
              />
            ) : (
              <TroubleshootingPanel
                initialRecipeId={initialRecipeId}
                query={recipeQuery}
                onQueryChange={(nextQuery) => {
                  setRecipeQuery(nextQuery);
                  if (!nextQuery) setInitialRecipeId(null);
                }}
                onRunDestination={runDestination}
              />
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

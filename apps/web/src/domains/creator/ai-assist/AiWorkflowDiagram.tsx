import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { useScrollReveal } from "./ai-motion";

/**
 * AI 채색 3단계 도식 — 텍스트가 아니라 다이어그램으로 설명.
 * 스크롤 시 순차 등장 + 연결선 흐름 애니메이션.
 */
export function AiWorkflowDiagram() {
  const t = useBilingual("ai-assist");
  const { ref, visible } = useScrollReveal<HTMLDivElement>();

  const steps = [
    {
      icon: (
        <svg viewBox="0 0 48 48" width={36} height={36} className="ai-flow__icon h-9 w-9 shrink-0" aria-hidden="true">
          <rect x="8" y="8" width="32" height="32" rx="8" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="5 4" />
          <circle cx="24" cy="24" r="7" fill="currentColor" className="ai-flow__pulse" />
        </svg>
      ),
      title: t("탭으로 힌트 배치", "Tap to drop hints"),
      desc: t("색을 골라 영역을 톡톡", "Pick a color, tap an area"),
    },
    {
      icon: (
        <svg viewBox="0 0 48 48" width={36} height={36} className="ai-flow__icon h-9 w-9 shrink-0" aria-hidden="true">
          <path d="M24 6 L28 20 L42 24 L28 28 L24 42 L20 28 L6 24 L20 20 Z" fill="currentColor" className="ai-flow__sparkle" />
        </svg>
      ),
      title: t("AI가 채색", "AI colors it"),
      desc: t("경계·음영·광원 자동 계산", "Boundaries, shade & light"),
    },
    {
      icon: (
        <svg viewBox="0 0 48 48" width={36} height={36} className="ai-flow__icon h-9 w-9 shrink-0" aria-hidden="true">
          <rect x="6" y="10" width="36" height="28" rx="6" fill="none" stroke="currentColor" strokeWidth="3" />
          <line x1="24" y1="10" x2="24" y2="38" stroke="currentColor" strokeWidth="3" />
          <circle cx="24" cy="24" r="5" fill="currentColor" />
        </svg>
      ),
      title: t("비교하고 다듬기", "Compare & tweak"),
      desc: t("Before/After 슬라이더로 확인", "Before/After slider"),
    },
  ];

  return (
    <div
      ref={ref}
      className={`ai-flow grid grid-cols-1 gap-4 rounded-2xl border border-line bg-panel p-4 [word-break:keep-all] sm:grid-cols-3 sm:gap-6 sm:p-5${visible ? " is-visible" : ""}`}
      role="list"
      aria-label={t("AI 채색 동작 방식", "How AI coloring works")}
    >
      {steps.map((step, i) => (
        <div
          key={step.title}
          className={`ai-flow__step relative flex h-full flex-col items-center rounded-2xl border border-line bg-card px-4 py-5 text-center transition-[opacity,transform] duration-300 motion-reduce:transition-none motion-reduce:transform-none ${visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
          role="listitem"
          style={{ transitionDelay: `${i * 140}ms` }}
        >
          <div
            className="ai-flow__badge mb-2.5 inline-flex size-7 items-center justify-center rounded-full border border-accent/40 bg-accent-soft font-display text-xs font-bold tabular-nums text-accent"
            aria-hidden="true"
          >
            {i + 1}
          </div>
          <div className="ai-flow__iconwrap mb-3 flex size-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-raised text-accent">
            {step.icon}
          </div>
          <div className="ai-flow__title text-sm font-bold text-fg">{step.title}</div>
          <div className="ai-flow__desc mt-1 text-xs leading-5 text-fg-2">{step.desc}</div>
          {i < steps.length - 1 && (
            <svg
              viewBox="0 0 40 24"
              width={28}
              height={18}
              className="ai-flow__connector pointer-events-none mt-3 h-[18px] w-7 shrink-0 rotate-90 text-fg-3 sm:absolute sm:top-1/2 sm:-right-5 sm:z-10 sm:mt-0 sm:-translate-y-1/2 sm:rotate-0"
              aria-hidden="true"
            >
              <path
                d="M4 12 H32 M28 6 L36 12 L28 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ai-flow__dash"
              />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

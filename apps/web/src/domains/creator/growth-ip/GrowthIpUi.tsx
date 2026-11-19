// 작가 성장·IP 작업대의 화면 조각 — 섹션 머리글, 입력 라벨, 정책 배지, 섹션별 안내.
import { CheckCircle2, Info, Lock, type LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";

import { bi } from "./growth-ip-shared";

import { cn } from "@/shared/lib/utils";

export function GrowthSection({
  id,
  icon: Icon,
  eyebrow,
  title,
  description,
  notice,
  children,
}: {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  /** 이 섹션에서 방금 한 일의 결과 — 누른 버튼 가까이에 보여 준다. */
  notice?: string | null;
  children: ReactNode;
}) {
  const headingId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={headingId} className="mt-6 scroll-mt-28 break-keep [overflow-wrap:break-word]">
      <header className="mb-4 flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Icon size={19} strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">{eyebrow}</p>
          <h2 id={headingId} className="mt-1 text-xl font-semibold leading-[1.25] tracking-[-0.02em] text-fg sm:text-2xl">
            {title}
          </h2>
          <p className="mt-1.5 max-w-4xl text-pretty text-sm leading-[1.65] tracking-[-0.01em] text-fg-2">
            {description}
          </p>
        </div>
      </header>
      {/* 알림 영역은 늘 두고 내용만 바꾼다 — 나중에 끼워 넣은 live region은 화면낭독기가 놓치기 쉽다. */}
      <div
        role="status"
        className={
          notice
            ? "mb-3 flex items-start gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm leading-[1.6] text-fg"
            : "sr-only"
        }
      >
        {notice ? <Info size={16} strokeWidth={1.5} aria-hidden className="mt-1 shrink-0 text-accent" /> : null}
        {notice ?? ""}
      </div>
      {children}
    </section>
  );
}

type FieldChildren = ReactNode | ((describedBy: string | undefined) => ReactNode);

/**
 * 보이는 라벨 + 입력. 자리표시자만으로 입력 목적을 알리던 칸에 항상 이름을 붙인다.
 * 도움말(hint)은 라벨 밖에 두어 입력 이름이 길어지지 않게 하고, 함수 children이면 aria-describedby로 연결한다.
 */
export function GrowthField({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: FieldChildren;
}) {
  const hintId = useId();
  const describedBy = hint ? hintId : undefined;
  return (
    <div className={className}>
      <label className="block text-xs font-semibold leading-[1.4] text-fg-2">
        {label}
        {typeof children === "function" ? children(describedBy) : children}
      </label>
      {hint ? <p id={hintId} className="mt-1 text-xs leading-[1.55] text-fg-2">{hint}</p> : null}
    </div>
  );
}

/** 허용·제한을 색·아이콘·글자로 함께 보여 준다. */
export function PolicyBadge({ allowed }: { allowed: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold text-fg",
        allowed ? "bg-good/15 text-good" : "bg-bad/10 text-bad",
      )}
    >
      {allowed ? <CheckCircle2 size={12} strokeWidth={1.5} aria-hidden /> : <Lock size={12} strokeWidth={1.5} aria-hidden />}
      {allowed ? bi("허용", "Allowed") : bi("제한", "Restricted")}
    </span>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-panel/60 px-4 py-6 text-center text-sm leading-[1.6] text-fg-2">
      {children}
    </p>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={cn(
        "rounded-md px-2 py-0.5 text-xs font-medium",
        tone === "accent" ? "bg-accent-soft text-accent" : "bg-raised text-fg-2",
      )}
    >
      {children}
    </span>
  );
}

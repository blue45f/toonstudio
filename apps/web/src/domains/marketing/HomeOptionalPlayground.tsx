import { Suspense, useEffect, useRef, useState } from "react";
import { ChevronDown, Paintbrush } from "lucide-react";

import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";

import "./home-optional-playground.css";

const LazyHomeFlagshipInteractiveShowcase = lazyRetry(
  () => import("./flagship-showcase/HomeFlagshipInteractiveShowcase").then((module) => ({
    default: module.HomeFlagshipInteractiveShowcase,
  })),
  "HomeFlagshipInteractiveShowcase",
);

/** 체험을 고른 뒤에만 캔버스와 기능 안내를 불러오며 닫으면 실행도 멈춘다. */
export function HomeOptionalPlayground() {
  const bi = useBilingualLocalizer("domains.marketing.HomeOptionalPlayground");
  const [open, setOpen] = useState(false);
  const hostRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
      if (!(event.target instanceof Element) || !hostRef.current?.contains(event.target)) return;
      event.preventDefault();
      setOpen(false);
      hostRef.current.querySelector("summary")?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <details
      ref={hostRef}
      className="home-playground"
      open={open}
      onToggle={(event) => {
        if (event.target === event.currentTarget) setOpen(event.currentTarget.open);
      }}
    >
      <summary>
        <Paintbrush size={22} aria-hidden="true" />
        <span>
          <strong>{bi("그리기 체험", "Try the drawing tools")}</strong>
          <small>{bi("브러시와 색을 가볍게 써 보세요", "Play with brushes and color")}</small>
        </span>
        <ChevronDown size={20} aria-hidden="true" />
      </summary>
      {open && (
        <Suspense fallback={(
          <div className="home-playground-loading" role="status">
            {bi("그리기 도구를 준비하고 있어요…", "Getting the drawing tools ready…")}
          </div>
        )}>
          <LazyHomeFlagshipInteractiveShowcase />
        </Suspense>
      )}
    </details>
  );
}

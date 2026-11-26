import { Suspense } from "react";
import { Link, useLocation } from "react-router-dom";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { UnifiedAiSettings } from "@/shared/ai/UnifiedAiSettings";
import { AssistConnectionCard } from "@/shared/ai/assist/AssistConnectionCard";
import { LoadingState } from "@/shared/components/LoadingState";
import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import "./ai-settings-page.css";

export function AiSettingsPage() {
  const t = useBilingual("AiSettingsPage");
  useDocumentTitle(t("AI 설정 · ToonStudio", "AI settings · ToonStudio"));
  const location = useLocation();
  const source = new URLSearchParams(location.search).get("source");
  const backHref = source === "inference"
    ? "/studio/ai-runtime"
    : source === "studio"
      ? "/studio"
      : "/settings";
  const backLabel = source === "inference"
    ? t("AI 런타임", "AI runtime")
    : source === "studio"
      ? "ToonStudio"
      : t("설정", "Settings");

  return (
    <Container size="wide" className="ai-settings-page py-2 sm:py-3">
      <div
        data-own-control-size=""
        className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line pb-2.5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={backHref}
            className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-2 text-sm font-semibold text-accent transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            ← {backLabel}
          </Link>
          <h1 className="text-lg font-bold tracking-tight text-fg sm:text-xl [word-break:keep-all]">
            {t("AI 설정", "AI settings")}
          </h1>
        </div>
        <p className="hidden text-xs leading-relaxed text-fg-2 sm:block [word-break:keep-all]">
          {t(
            "자동 무료 AI와 내 API 키, 기능별 사용 순서를 한곳에서 연결하고 관리해요.",
            "Connect and manage automatic free AI, your API keys, and per-feature usage order in one place.",
          )}
        </p>
      </div>
      <Suspense
        fallback={
          <LoadingState
            variant="cards"
            cardCount={6}
            label={t("AI 설정을 불러오는 중", "Loading AI settings")}
          />
        }
      >
        <UnifiedAiSettings />
        <AssistConnectionCard />
      </Suspense>
    </Container>
  );
}

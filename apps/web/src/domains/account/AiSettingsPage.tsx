import { Sparkles } from "lucide-react";
import { Suspense, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { UnifiedAiSettings } from "@/shared/ai/UnifiedAiSettings";
import { AssistConnectionCard } from "@/shared/ai/assist/AssistConnectionCard";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { LoadingState } from "@/shared/components/LoadingState";
import { SectionArt } from "@/shared/components/section-art";
import { Container } from "@/shared/components/section";
import { SiteArtSurfaceSpotlight } from "@/shared/components/site-experience/SiteArtSurfaceSpotlight";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type ByokRoutingPolicy =
  | "byok-12key-auto-rotate"
  | "free-first-managed-fallback"
  | "comfy-invoke-local-bridge"
  | "c2pa-zero-retention-guard";

type ByokProbeMode = "realtime-verify" | "429-auto-failover" | "budget-cap-shield";

export function AiSettingsPage() {
  const t = useBilingual("AiSettingsPage");
  const [routingPolicy, setRoutingPolicy] = useState<ByokRoutingPolicy>("byok-12key-auto-rotate");
  const [probeMode, setProbeMode] = useState<ByokProbeMode>("realtime-verify");
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
    <Container size="wide" className="py-8 sm:py-12">
      <div data-own-control-size="">
        <Link
          to={backHref}
          className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-2 text-sm font-bold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← {backLabel}
        </Link>
        <SitePageHeader
          className="mb-7 mt-3"
          icon={Sparkles}
          eyebrow="AI CONNECTION CENTER"
          title={t("AI 설정", "AI settings")}
          description={t("자동 무료 AI, 내 API 키와 기능별 사용 순서를 한곳에서 관리해요. 처음에는 키 하나만 연결하면 되고, 세부 모델과 API 경로는 고급 설정에서만 보여요.", "Manage the automatic free AI, your API keys, and per-feature usage order in one place. Start by connecting a single key; detailed models and API paths stay inside advanced settings.")}
          aside={
            <SectionArt
              image="studio-lobby"
              className="aspect-[16/10] w-full rounded-2xl border border-line object-cover"
            />
          }
          asideClassName="hidden lg:block"
        />
        <SiteArtSurfaceSpotlight cardId="nb-manage-vault" defaultLensId="curation" compact className="mb-6" />
        <section
          data-own-control-size=""
          data-testid="ai-settings-rea-byok-failover-bar"
          aria-label={t(
            "REA BYOK 다중 키 자동 순환 및 로컬·클라우드 페일오버 시뮬레이터",
            "REA BYOK Multi-Key Auto-Rotation & Local-Cloud Failover Simulator",
          )}
          className="mb-6 rounded-2xl border border-line bg-panel p-4 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label={t("라우팅 정책 선택", "Routing Policy Selection")}
            >
              <span className="font-extrabold text-accent">
                {t("라우팅 정책:", "Routing Policy:")}
              </span>
              {([
                {
                  id: "byok-12key-auto-rotate",
                  ko: "BYOK 12종 키 자동 순환",
                  en: "BYOK 12-Provider Key Auto-Rotate",
                },
                {
                  id: "free-first-managed-fallback",
                  ko: "무료 AI 우선 · 매니지드 폴백",
                  en: "Free-First & Managed Fallback",
                },
                {
                  id: "comfy-invoke-local-bridge",
                  ko: "ComfyUI·InvokeAI 로컬 브리지",
                  en: "ComfyUI & InvokeAI Local Bridge",
                },
                {
                  id: "c2pa-zero-retention-guard",
                  ko: "C2PA 서명 · 무보관(Zero-Retention) 보호",
                  en: "C2PA Provenance & Zero-Retention Guard",
                },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`ai-settings-rea-policy-${item.id}`}
                  aria-pressed={routingPolicy === item.id}
                  onClick={() => setRoutingPolicy(item.id)}
                  className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    routingPolicy === item.id
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg-2 hover:border-accent/50"
                  }`}
                >
                  {t(item.ko, item.en)}
                </button>
              ))}
            </div>
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label={t("페일오버 프로브 모드", "Failover Probe Mode")}
            >
              <span className="font-extrabold text-accent">
                {t("프로브 모드:", "Probe Mode:")}
              </span>
              {([
                { id: "realtime-verify", ko: "실시간 연결 검증", en: "Realtime Connection Verify" },
                { id: "429-auto-failover", ko: "429 한도 초과 무중단 우회", en: "429 Rate-Limit Auto-Failover" },
                { id: "budget-cap-shield", ko: "일일 예산 상한 가드", en: "Daily Budget Cap Shield" },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`ai-settings-rea-probe-${item.id}`}
                  aria-pressed={probeMode === item.id}
                  onClick={() => setProbeMode(item.id)}
                  className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    probeMode === item.id
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg-2 hover:border-accent/50"
                  }`}
                >
                  {t(item.ko, item.en)}
                </button>
              ))}
            </div>
          </div>
          <p data-testid="ai-settings-rea-byok-status" className="mt-2 text-[11px] text-fg-2">
            {t(
              `[BYOK 라우터 상태] 정책: ${routingPolicy} · 프로브: ${probeMode} · Cursor, Raycast, TypingMind, Zed, ComfyUI 아키텍처 기준 다중 키 페일오버 활성`,
              `[BYOK Router Status] Policy: ${routingPolicy} · Probe: ${probeMode} · Multi-key failover active with Cursor, Raycast, TypingMind, Zed, ComfyUI architecture standard`,
            )}
          </p>
        </section>
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

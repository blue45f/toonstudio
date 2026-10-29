/**
 * 스튜디오 AI 어시스트 허브의 "AI 보조" 구역 — 지금 쓰는 경로와 보조 기능 카드를 한 곳에서 보여 준다.
 *
 * 키가 없어도 기능 카드를 바로 연다: 등록한 키가 없으면 ToonStudio AI(서버가 운영 고성능 모델 → 무료 모델 순으로
 * 처리, 사용자 비용 없음)로 실행하고, 내 키를 등록하면 그 키로 실행한다. 내 키 경로에서만 이번 세션 비용·예산을 보여 준다.
 * 카드 모양과 어휘는 같은 허브의 "제작 흐름으로 시작"(StudioAiProductionLaunchpad)과 맞춘다.
 */
import "@/shared/ai/assist/ai-assist-i18n";

import { ChevronRight, Sparkles } from "lucide-react";
import { useId } from "react";

import { assistModelInfo } from "@/shared/ai/assist/assist-models";
import { AssistBudgetMeter } from "@/shared/ai/assist/AssistBudgetMeter";
import { useAssistRoute } from "@/shared/ai/assist/use-assist-route";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../../studio-panel-ui";

import { openAiAssistFeature } from "./ai-assist-dialog-store";
import { AI_ASSIST_FEATURES } from "./ai-assist-features";

export interface AiAssistHubSectionProps {
  /** AI 설정 화면으로 간다(허브의 "AI 어시스트 설정"과 같은 동작). */
  readonly onOpenSettings: () => void;
  readonly onPreloadSettings?: () => void;
}

export function AiAssistHubSection({ onOpenSettings, onPreloadSettings }: AiAssistHubSectionProps) {
  const t = useT();
  const rawId = useId().replace(/:/gu, "");
  const route = useAssistRoute();
  const managed = route.managed === true;
  const modelLabel = assistModelInfo(route.model)?.label ?? route.model;

  return (
    <section
      aria-labelledby={`${rawId}-title`}
      data-ai-assist-hub-section={managed ? "managed" : "connected"}
      className="shrink-0 rounded-xl border border-line bg-panel/45 p-2.5"
    >
      <div className="mb-2 flex items-start gap-2 px-1">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden>
          <Sparkles size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={`${rawId}-title`} className="text-[0.68rem] font-black text-fg">{t("aiAssist.hub.sectionTitle")}</h3>
          <p className="mt-0.5 text-[0.59rem] leading-relaxed text-fg-3">{t("aiAssist.hub.sectionSubtitle")}</p>
        </div>
        <span
          className={cn(
            "max-w-[9rem] shrink-0 truncate rounded-full border px-2 py-0.5 text-[0.56rem] font-bold",
            "border-good/35 bg-good/10 text-good",
          )}
        >
          {managed ? t("aiAssist.hub.managedReady") : t("aiAssist.hub.connected", { model: modelLabel })}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {AI_ASSIST_FEATURES.map(({ id, Icon, titleKey, descriptionKey, requirementKey, workflowBadgeKo }) => (
          <button
            key={id}
            type="button"
            data-ai-assist={id}
            onClick={() => openAiAssistFeature(id)}
            aria-haspopup="dialog"
            className={cn(
              "group flex min-h-[5.25rem] min-w-0 items-start gap-2.5 rounded-xl border border-line bg-card/80 p-2.5 text-left hover:border-line-strong hover:bg-raised",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
              STUDIO_TOUCH_TARGET,
            )}
          >
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-raised text-accent" aria-hidden>
              <Icon size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-xs font-black leading-snug text-fg">{t(titleKey)}</strong>
              <span className="mt-0.5 block text-[0.62rem] leading-relaxed text-fg-3">{t(descriptionKey)}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-1">
                <span className="inline-flex rounded-full border border-line px-1.5 py-px text-[0.58rem] font-semibold text-fg-2">{t(requirementKey)}</span>
                {workflowBadgeKo ? (
                  <span
                    data-claude-workflow-badge={id}
                    className="inline-flex rounded-full border border-accent/30 bg-accent/10 px-1.5 py-px text-[0.56rem] font-semibold text-accent"
                  >
                    {workflowBadgeKo}
                  </span>
                ) : null}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-2 space-y-1.5 px-1">
        {managed ? (
          <p className="text-[0.62rem] leading-relaxed text-fg-3" data-claude-managed-note="true">{t("aiAssist.hub.managedNote")}</p>
        ) : (
          <AssistBudgetMeter />
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          onMouseEnter={onPreloadSettings}
          onFocus={onPreloadSettings}
          className={cn("inline-flex min-h-11 items-center gap-1 text-[0.65rem] font-bold text-accent", STUDIO_FOCUS_RING)}
        >
          {t("aiAssist.hub.settingsLink")}
          <ChevronRight size={12} aria-hidden />
        </button>
      </div>
    </section>
  );
}

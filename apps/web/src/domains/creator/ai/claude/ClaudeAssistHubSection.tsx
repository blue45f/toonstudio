/**
 * 스튜디오 AI 어시스트 허브의 "Claude 보조" 구역 — 연결 상태와 보조 기능 카드, 이번 세션 사용량·예산을 한 곳에서 보여 준다.
 *
 * 연결이 없으면 기능을 숨기지 않고 연결 안내를 보여 준다(AI를 찾아 들어온 사용자가 가장 먼저 닿는 곳이라서다).
 * 카드 모양과 어휘는 같은 허브의 "제작 흐름으로 시작"(StudioAiProductionLaunchpad)과 맞춘다.
 */
import "@/shared/ai/claude/claude-assist-i18n";

import { ChevronRight, Sparkles } from "lucide-react";
import { useId } from "react";

import { claudeModelInfo } from "@/shared/ai/claude/claude-models";
import { ClaudeBudgetMeter } from "@/shared/ai/claude/ClaudeBudgetMeter";
import { useClaudeRoute } from "@/shared/ai/claude/use-claude-route";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../../studio-panel-ui";

import { openClaudeAssistFeature } from "./claude-assist-dialog-store";
import { CLAUDE_ASSIST_FEATURES } from "./claude-assist-features";

export interface ClaudeAssistHubSectionProps {
  /** AI 설정 화면으로 간다(허브의 "AI 어시스트 설정"과 같은 동작). */
  readonly onOpenSettings: () => void;
  readonly onPreloadSettings?: () => void;
}

export function ClaudeAssistHubSection({ onOpenSettings, onPreloadSettings }: ClaudeAssistHubSectionProps) {
  const t = useT();
  const rawId = useId().replace(/:/gu, "");
  const route = useClaudeRoute();
  const modelLabel = route ? claudeModelInfo(route.model)?.label ?? route.model : "";

  return (
    <section
      aria-labelledby={`${rawId}-title`}
      data-claude-assist-hub-section={route ? "connected" : "connect"}
      className="shrink-0 rounded-xl border border-line bg-panel/45 p-2.5"
    >
      <div className="mb-2 flex items-start gap-2 px-1">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden>
          <Sparkles size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={`${rawId}-title`} className="text-[0.68rem] font-black text-fg">{t("claudeAssist.hub.sectionTitle")}</h3>
          <p className="mt-0.5 text-[0.59rem] leading-relaxed text-fg-3">{t("claudeAssist.hub.sectionSubtitle")}</p>
        </div>
        <span
          className={cn(
            "max-w-[9rem] shrink-0 truncate rounded-full border px-2 py-0.5 text-[0.56rem] font-bold",
            route ? "border-good/35 bg-good/10 text-good" : "border-line bg-card text-fg-3",
          )}
        >
          {route ? t("claudeAssist.hub.connected", { model: modelLabel }) : t("claudeAssist.hub.notConnected")}
        </span>
      </div>

      {route ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {CLAUDE_ASSIST_FEATURES.map(({ id, Icon, titleKey, descriptionKey, requirementKey }) => (
              <button
                key={id}
                type="button"
                data-claude-assist={id}
                onClick={() => openClaudeAssistFeature(id)}
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
                  <span className="mt-1.5 inline-flex rounded-full border border-line px-1.5 py-px text-[0.58rem] font-semibold text-fg-2">{t(requirementKey)}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 space-y-1.5 px-1">
            <ClaudeBudgetMeter />
            <button
              type="button"
              onClick={onOpenSettings}
              onMouseEnter={onPreloadSettings}
              onFocus={onPreloadSettings}
              className={cn("inline-flex min-h-11 items-center gap-1 text-[0.65rem] font-bold text-accent", STUDIO_FOCUS_RING)}
            >
              {t("claudeAssist.hub.settingsLink")}
              <ChevronRight size={12} aria-hidden />
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-2 px-1">
          <p className="text-[0.65rem] leading-relaxed text-fg-2">{t("claudeAssist.hub.connectPrompt")}</p>
          <button
            type="button"
            onClick={onOpenSettings}
            onMouseEnter={onPreloadSettings}
            onFocus={onPreloadSettings}
            className={cn(
              "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs font-bold text-fg hover:bg-accent-soft/80",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            {t("claudeAssist.common.openSettings")}
            <ChevronRight size={14} className="text-accent" aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}

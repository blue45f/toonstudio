import { ArrowRight, Check, Layers } from "lucide-react";
import { useMemo, useState } from "react";

import Link from "@/shared/navigation/router-link";

import {
  BYOT_TOOLS,
  CREATOR_ROLE_PRESETS,
  recommendByotStack,
  TIMEMACHINE_STAGES,
  type BilingualText,
  type ByotToolId,
  type CreatorRoleId,
} from "./flagship-showcase-data";

function pick(value: BilingualText, lang: "ko" | "en"): string {
  return lang === "en" ? value.en : value.ko;
}

/**
 * ④ 직군별 1-클릭 워크스페이스 런처 + 7단계 제작 타임머신 + BYOT 1분 조합 진단 위젯.
 */
export function FlagshipWorkflowLauncherPanel({ lang }: { readonly lang: "ko" | "en" }) {
  const [activeRole, setActiveRole] = useState<CreatorRoleId>("solo-author");
  const [activeStageStep, setActiveStageStep] = useState(1);
  const [selectedByot, setSelectedByot] = useState<readonly ByotToolId[]>(["csp", "slack"]);

  const activeRoleSpec = useMemo(
    () => CREATOR_ROLE_PRESETS.find((item) => item.id === activeRole) ?? CREATOR_ROLE_PRESETS[0],
    [activeRole],
  );
  const activeStageSpec = useMemo(
    () => TIMEMACHINE_STAGES.find((item) => item.step === activeStageStep) ?? TIMEMACHINE_STAGES[0],
    [activeStageStep],
  );
  const byotRecommendation = useMemo(() => recommendByotStack(selectedByot), [selectedByot]);

  const toggleByotTool = (toolId: ByotToolId) => {
    setSelectedByot((prev) =>
      prev.includes(toolId) ? prev.filter((item) => item !== toolId) : [...prev, toolId],
    );
  };

  return (
    <article className="fsh-block" aria-labelledby="fsh-workflow-title">
      <div className="fsh-block-head">
        <div className="fsh-block-title">
          <h3 id="fsh-workflow-title">
            {lang === "en"
              ? "Role Workspace Launcher · 7-Stage Time Machine · 1-Min BYOT Matcher"
              : "직군별 워크스페이스 · 7단계 제작 타임머신 · BYOT 1분 조합 진단"}
          </h3>
          <p>
            {lang === "en"
              ? "Pick your role, scrub all 7 production stages, and match your current tools."
              : "내 역할에 맞는 작업대 4종, 7단계 제작 공정, 현재 사용 중인 외부 툴 연결 조합을 바로 맞춥니다."}
          </p>
        </div>
      </div>

      <div className="fsh-trio-grid">
        {/* 직군별 1-클릭 워크스페이스 런처 */}
        <div className="fsh-role-panel" data-testid="flagship-role-launcher">
          <div
            className="fsh-pill-group"
            role="group"
            aria-label={lang === "en" ? "Select creator role preset" : "직군별 워크스페이스 선택"}
          >
            {CREATOR_ROLE_PRESETS.map((role) => (
              <button
                key={role.id}
                type="button"
                data-testid={`flagship-role-${role.id}`}
                className="fsh-pill"
                aria-pressed={activeRole === role.id}
                onClick={() => setActiveRole(role.id)}
              >
                {pick(role.title, lang)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-sm text-fg-2">{pick(activeRoleSpec.summary, lang)}</p>
            <Link
              href={activeRoleSpec.primaryHref}
              className="fsh-btn fsh-btn--primary"
              data-testid="flagship-role-primary-cta"
            >
              <span>{pick(activeRoleSpec.primaryCta, lang)}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <ul className="fsh-role-features">
            {activeRoleSpec.features.map((feat) => (
              <li key={`${activeRoleSpec.id}-${feat.label.en}`}>
                <Link href={feat.href} className="fsh-role-feature-link">
                  <span>
                    <strong>{pick(feat.label, lang)}</strong>
                    <small>{pick(feat.detail, lang)}</small>
                  </span>
                  <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-accent" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="fsh-split-two">
          {/* 7단계 제작 타임머신 */}
          <div className="fsh-subcard" data-testid="flagship-timemachine">
            <div className="flex items-center justify-between gap-2">
              <strong className="flex items-center gap-1.5 text-sm text-fg">
                <Layers size={15} aria-hidden="true" className="text-accent" />
                {lang === "en" ? "7-Stage Production Time Machine" : "7단계 웹툰 제작 타임머신"}
              </strong>
              <span className="text-xs font-bold text-accent fsh-tabular" data-testid="flagship-stage-indicator">
                {activeStageSpec.code} / 07
              </span>
            </div>
            <div
              className="fsh-stage-steps"
              role="group"
              aria-label={lang === "en" ? "7 production stages" : "7단계 제작 공정 선택"}
            >
              {TIMEMACHINE_STAGES.map((stage) => (
                <button
                  key={stage.step}
                  type="button"
                  data-testid={`flagship-stage-${stage.step}`}
                  className="fsh-stage-btn"
                  aria-pressed={activeStageStep === stage.step}
                  onClick={() => setActiveStageStep(stage.step)}
                >
                  <span className="fsh-tabular">{stage.code}</span>
                  <span>{pick(stage.title, lang)}</span>
                </button>
              ))}
            </div>
            <input
              type="range"
              min={1}
              max={7}
              step={1}
              value={activeStageStep}
              data-testid="flagship-timemachine-scrubber"
              className="fsh-range"
              aria-label={lang === "en" ? "Scrub 7 webtoon production stages" : "7단계 웹툰 제작 타임머신 스크러버"}
              onChange={(event) => setActiveStageStep(Number(event.target.value))}
            />
            <div className="fsh-stage-detail" data-testid="flagship-stage-detail">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>
                  {activeStageSpec.code}. {pick(activeStageSpec.title, lang)}
                </strong>
                <span className="text-xs font-semibold text-accent">{pick(activeStageSpec.engine, lang)}</span>
              </div>
              <p className="m-0 text-xs leading-5 text-fg-2">{pick(activeStageSpec.summary, lang)}</p>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-xs text-fg-3">
                  {lang === "en" ? "Output: " : "단계 산출물: "}
                  <strong className="text-fg">{pick(activeStageSpec.outputArtifact, lang)}</strong>
                </span>
                <Link href={activeStageSpec.href} className="fsh-engine-link">
                  <span>{lang === "en" ? "Open stage tool" : "이 단계 바로 열기"}</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>

          {/* BYOT 1분 조합 진단 위젯 */}
          <div className="fsh-subcard" data-testid="flagship-byot-matcher">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm text-fg">
                {lang === "en" ? "1-Minute BYOT Hybrid Stack Matcher" : "BYOT 1분 조합 진단 · 현재 쓰는 툴 체크"}
              </strong>
              <span className="text-xs font-bold text-fg-3 fsh-tabular" data-testid="flagship-byot-count">
                {lang === "en" ? `${selectedByot.length} selected` : `${selectedByot.length}개 선택`}
              </span>
            </div>
            <div
              className="fsh-byot-grid"
              role="group"
              aria-label={lang === "en" ? "Select current external tools" : "현재 사용 중인 외부 툴 선택"}
            >
              {BYOT_TOOLS.map((tool) => {
                const checked = selectedByot.includes(tool.id);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    data-testid={`flagship-byot-${tool.id}`}
                    className="fsh-byot-tool"
                    aria-pressed={checked}
                    onClick={() => toggleByotTool(tool.id)}
                  >
                    <span className="inline-flex size-4 shrink-0 items-center justify-center rounded border border-line-strong">
                      {checked ? <Check size={12} strokeWidth={2.4} aria-hidden="true" /> : null}
                    </span>
                    <span className="truncate">{tool.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="fsh-byot-result" data-testid="flagship-byot-recommendation">
              <strong>{pick(byotRecommendation.headline, lang)}</strong>
              <p className="m-0 text-xs leading-5 text-fg-2">{pick(byotRecommendation.summary, lang)}</p>
              <ul className="fsh-byot-list">
                {byotRecommendation.bridges.map((bridge) => (
                  <li key={bridge.en}>{pick(bridge, lang)}</li>
                ))}
              </ul>
              <div>
                <Link href={byotRecommendation.ctaHref} className="fsh-btn fsh-btn--primary">
                  <span>{pick(byotRecommendation.ctaLabel, lang)}</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

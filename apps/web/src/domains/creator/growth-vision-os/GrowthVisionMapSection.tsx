import { ArrowRight, Compass, Layers } from "lucide-react";

import {
  TOONSTUDIO_VISION_PILLARS,
  VISION_PROFICIENCY_FILTERS,
  VISION_ROLE_FILTERS,
  type GrowthWorkbenchTabId,
  type VisionEcosystemResolution,
  type VisionProficiencyId,
  type VisionRoleId,
} from "./toonstudio-vision-ecosystem-map";

export interface GrowthVisionMapSectionProps {
  readonly resolution: VisionEcosystemResolution;
  readonly onSelectRole: (roleId: VisionRoleId) => void;
  readonly onSelectProficiency: (proficiencyId: VisionProficiencyId) => void;
  readonly onJumpTarget: (target: {
    readonly label: string;
    readonly routePath: string;
    readonly growthTabId?: GrowthWorkbenchTabId;
  }) => void;
}

/**
 * 상단: 3초 이해 ToonStudio OS 비주얼 비전 지도.
 * 6대 창작 기둥(OKLCH 6색 스펙트럼) + 7대 직군 필터 + 4대 숙련도 필터 + 1클릭 워크벤치 점프.
 */
export function GrowthVisionMapSection({
  resolution,
  onSelectRole,
  onSelectProficiency,
  onJumpTarget,
}: GrowthVisionMapSectionProps) {
  return (
    <section aria-labelledby="gvos-vision-map-heading" className="flex flex-col gap-4">
      <header className="gvos-hero">
        <div className="min-w-0">
          <span className="gvos-kicker gvos-num">
            <Compass className="size-4 shrink-0" aria-hidden="true" />
            TOONSTUDIO OS · {TOONSTUDIO_VISION_PILLARS.length}대 창작 기둥 · 3초 이해 비주얼 비전 지도
          </span>
          <h2 id="gvos-vision-map-heading" className="gvos-title">
            초보 3분 시작부터 프로 작화·AI 자동화·해외 IP 판권까지 한눈에
          </h2>
          <p className="gvos-subtitle" data-testid="gvos-3sec-headline">
            {resolution.headline3Sec}
          </p>
        </div>
        <button
          type="button"
          className="gvos-primary-jump"
          data-testid="gvos-primary-jump-btn"
          onClick={() =>
            onJumpTarget({
              label: resolution.primaryJump.label,
              routePath: resolution.primaryJump.routePath,
              growthTabId: resolution.primaryJump.growthTabId,
            })
          }
        >
          <span>{resolution.primaryJump.label}</span>
          <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
        </button>
      </header>

      <div className="gvos-filter-box">
        <div className="gvos-filter-row">
          <span className="gvos-filter-label">직군별 1클릭 필터 (7대 직군)</span>
          <div className="gvos-chip-group" role="group" aria-label="직군 필터">
            {VISION_ROLE_FILTERS.map((role) => (
              <button
                key={role.id}
                type="button"
                className="gvos-chip"
                data-testid={`gvos-role-${role.id}`}
                aria-pressed={resolution.roleId === role.id}
                onClick={() => onSelectRole(role.id)}
              >
                <span>{role.label}</span>
                <span className="gvos-chip-tag">{role.shortTag}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="gvos-filter-row">
          <span className="gvos-filter-label">숙련도·목표별 필터 (초보 / 프로 / 스튜디오 PD / 해외 바이어)</span>
          <div className="gvos-chip-group" role="group" aria-label="숙련도 필터">
            {VISION_PROFICIENCY_FILTERS.map((prof) => (
              <button
                key={prof.id}
                type="button"
                className="gvos-chip"
                data-testid={`gvos-prof-${prof.id}`}
                aria-pressed={resolution.proficiencyId === prof.id}
                onClick={() => onSelectProficiency(prof.id)}
              >
                <span>{prof.label}</span>
                <span className="gvos-chip-tag">{prof.badge}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="gvos-pillar-grid" data-testid="gvos-pillar-grid">
        {resolution.pillars.map((pillar) => (
          <article
            key={pillar.id}
            className={`gvos-pillar-card ${pillar.spectrumClass}`}
            data-testid={`gvos-pillar-${pillar.id}`}
            data-highlighted={pillar.highlighted ? "true" : "false"}
          >
            <div className="gvos-pillar-head">
              <div className="flex items-start gap-2.5">
                <span className="gvos-pillar-num gvos-num">{pillar.orderLabel}</span>
                <h3 className="gvos-pillar-title">{pillar.title}</h3>
              </div>
              <span className="gvos-status-pill gvos-num" data-tone={pillar.highlighted ? "good" : undefined}>
                <Layers className="size-3.5" aria-hidden="true" />
                {pillar.matchedFeatureCount}/{pillar.resolvedFeatures.length}
              </span>
            </div>

            <p className="gvos-pillar-tagline">{pillar.threeSecondTagline}</p>

            <ul className="gvos-feature-list">
              {pillar.resolvedFeatures.map((feature) => (
                <li key={feature.id}>
                  <button
                    type="button"
                    className="gvos-feature-btn"
                    data-testid={`gvos-jump-${feature.id}`}
                    data-matched={feature.matched ? "true" : "false"}
                    onClick={() =>
                      onJumpTarget({
                        label: feature.title,
                        routePath: feature.routePath,
                        growthTabId: feature.growthTabId,
                      })
                    }
                  >
                    <span className="gvos-feature-name">
                      <span>{feature.title}</span>
                      <span className="gvos-jump-badge">
                        {feature.growthTabId ? "워크벤치 실행 →" : "경로 열기 →"}
                      </span>
                    </span>
                    <span className="gvos-feature-desc">{feature.oneLineValue}</span>
                  </button>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

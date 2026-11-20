import { Eye, EyeOff, RotateCcw } from "lucide-react";

import { StudioThreeDToggleControl } from "../StudioThreeDToggle";

import {
  BG3D_CUTAWAY_CONTROLLABLE_ROLES,
  BG3D_CUTAWAY_ROLE_LABELS_KO,
  type Bg3dCutawayWallRole,
  type Bg3dWallCutawayConfig,
  type Bg3dWallCutawayEvaluation,
} from "./studio-bg3d-wall-cutaway-runtime";

import { cn } from "@/shared/lib/utils";

export interface StudioBg3dWallCutawayToggleProps {
  readonly config: Bg3dWallCutawayConfig;
  readonly evaluation?: Bg3dWallCutawayEvaluation | null;
  readonly availableRoles?: readonly Bg3dCutawayWallRole[];
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onChange: (next: Bg3dWallCutawayConfig) => void;
  readonly onResetOverrides?: () => void;
}

function toggleRoleInList(
  list: readonly Bg3dCutawayWallRole[] | undefined,
  role: Bg3dCutawayWallRole,
  present: boolean,
): readonly Bg3dCutawayWallRole[] {
  const set = new Set<Bg3dCutawayWallRole>(list ?? []);
  if (present) {
    set.add(role);
  } else {
    set.delete(role);
  }
  return BG3D_CUTAWAY_CONTROLLABLE_ROLES.filter((candidate) => set.has(candidate));
}

/**
 * BG3D 실시간 앞벽·천장 자동 투명화(Shadow-Preserving Wall Cutaway) 토글 컨트롤.
 * 외부 태양 채광 그림자 유지 스위치와 벽별 수동 표시/숨김 칩을 하나의 차분한 카드 안에 묶는다.
 */
export function StudioBg3dWallCutawayToggle({
  config,
  evaluation = null,
  availableRoles = BG3D_CUTAWAY_CONTROLLABLE_ROLES,
  disabled = false,
  className,
  onChange,
  onResetOverrides,
}: StudioBg3dWallCutawayToggleProps) {
  const hiddenSet = new Set<Bg3dCutawayWallRole>(evaluation?.hiddenWalls ?? []);
  const lockedVisibleSet = new Set<Bg3dCutawayWallRole>(config.lockedVisibleWalls ?? []);
  const forcedHiddenSet = new Set<Bg3dCutawayWallRole>(config.forcedHiddenWalls ?? []);
  const hasManualOverride = lockedVisibleSet.size > 0 || forcedHiddenSet.size > 0;

  const handleToggleWall = (role: Bg3dCutawayWallRole) => {
    const currentlyHidden = hiddenSet.has(role);
    if (currentlyHidden) {
      onChange({
        ...config,
        forcedHiddenWalls: toggleRoleInList(config.forcedHiddenWalls, role, false),
        lockedVisibleWalls: toggleRoleInList(config.lockedVisibleWalls, role, true),
      });
    } else {
      onChange({
        ...config,
        lockedVisibleWalls: toggleRoleInList(config.lockedVisibleWalls, role, false),
        forcedHiddenWalls: toggleRoleInList(config.forcedHiddenWalls, role, true),
      });
    }
  };

  const handleReset = () => {
    if (onResetOverrides) {
      onResetOverrides();
      return;
    }
    onChange({
      ...config,
      lockedVisibleWalls: [],
      forcedHiddenWalls: [],
    });
  };

  const roles = availableRoles.filter((role) => role !== "floor");
  const statusText = evaluation?.summaryKo ?? (
    config.enabled
      ? "카메라 방향 앞벽 자동 숨김 준비"
      : "모든 벽·천장 고정 표시"
  );

  return (
    <section
      aria-label="카메라 앞벽 자동 투명화"
      data-testid="studio-bg3d-wall-cutaway-toggle"
      className={cn(
        "rounded-lg border border-line bg-card p-3 text-fg",
        className,
      )}
    >
      <StudioThreeDToggleControl
        checked={config.enabled}
        disabled={disabled}
        label="카메라 앞벽 자동 투명화"
        description="시야를 가리는 앞벽과 천장만 자동으로 숨깁니다."
        labelClassName="text-xs font-semibold text-fg"
        descriptionClassName="text-[0.6875rem] leading-relaxed text-fg-3"
        onChange={(enabled) => onChange({ ...config, enabled })}
      />

      {config.enabled ? (
        <div className="mt-1 border-t border-line/70 pt-1">
          <StudioThreeDToggleControl
            checked={config.preserveExteriorShadows}
            disabled={disabled}
            label="외부 채광 그림자 유지"
            description="숨긴 벽과 창틀의 태양 그림자는 바닥에 그대로 남깁니다."
            labelClassName="text-xs font-medium text-fg-2"
            descriptionClassName="text-[0.6875rem] leading-relaxed text-fg-3"
            onChange={(preserveExteriorShadows) =>
              onChange({ ...config, preserveExteriorShadows })}
          />
          <StudioThreeDToggleControl
            checked={config.autoHideCeiling}
            disabled={disabled}
            label="부감 시점 천장 숨김"
            description="위에서 내려다볼 때 천장과 조명을 함께 감춥니다."
            labelClassName="text-xs font-medium text-fg-2"
            descriptionClassName="text-[0.6875rem] leading-relaxed text-fg-3"
            onChange={(autoHideCeiling) => onChange({ ...config, autoHideCeiling })}
          />
        </div>
      ) : null}

      {roles.length > 0 ? (
        <div className="mt-2 border-t border-line/70 pt-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[0.6875rem] font-semibold text-fg-2">벽면별 표시 제어</span>
            {hasManualOverride ? (
              <button
                type="button"
                disabled={disabled}
                onClick={handleReset}
                className="inline-flex min-h-7 items-center gap-1 rounded-md border border-line bg-raised px-2 text-[0.6875rem] font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
              >
                <RotateCcw className="size-3" aria-hidden="true" />
                자동으로 복원
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="벽면 표시 상태">
            {roles.map((role) => {
              const isHidden = hiddenSet.has(role);
              const label = BG3D_CUTAWAY_ROLE_LABELS_KO[role];
              return (
                <button
                  key={role}
                  type="button"
                  disabled={disabled}
                  aria-pressed={isHidden}
                  aria-label={`${label} ${isHidden ? "숨김 중, 눌러서 표시" : "표시 중, 눌러서 숨김"}`}
                  onClick={() => handleToggleWall(role)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
                    isHidden
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-line bg-raised text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  {isHidden
                    ? <EyeOff className="size-3.5 shrink-0" aria-hidden="true" />
                    : <Eye className="size-3.5 shrink-0" aria-hidden="true" />}
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <p
        role="status"
        aria-live="polite"
        className="mt-2.5 rounded-md border border-line/70 bg-raised px-2.5 py-1.5 text-[0.6875rem] text-fg-2"
      >
        {statusText}
      </p>
    </section>
  );
}

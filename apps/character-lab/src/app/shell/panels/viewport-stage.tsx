import { PART_ROLE_LABELS_KO } from "../../../contracts";
import { describeEngineStatus } from "../engine-status-text";

import { ViewportBackdropLayers, ViewportOnboardingCard } from "./viewport-backdrop-overlay";
import { DUO_SHOT_DISTANCES, SHAPER_DUO_PARTNER_PROFILES, ViewportDuoShotOverlay, computeWebtoonDuoEyeContact, resolveSubjectHeightMetrics } from "./viewport-duo-shot-guide";
import { ViewportHud } from "./viewport-hud";
import { ViewportMangaFxOverlay } from "./viewport-manga-fx-overlay";

import type { DuoShotState } from "./viewport-duo-shot-guide";
import type { ViewportMangaFxState } from "./viewport-manga-fx-overlay";
import type { CharacterRecipe, EngineStatus, HudSample } from "../../../contracts";
import type { ComponentProps, ReactNode, Ref } from "react";

interface ViewportStageProps {
  readonly containerRef: Ref<HTMLDivElement>;
  readonly canvas: { readonly generation: number; readonly register: Ref<HTMLCanvasElement>; readonly keyShortcuts: string };
  readonly backdrop: ComponentProps<typeof ViewportBackdropLayers>;
  readonly duoShot: ComponentProps<typeof ViewportDuoShotOverlay>;
  readonly mangaFx: ViewportMangaFxState;
  readonly engineStatus: EngineStatus;
  readonly engineReady: boolean;
  readonly onSelectBackend: ComponentProps<typeof ViewportOnboardingCard>["onSelectBackend"];
  readonly drawing: {
    readonly enabled: boolean;
    readonly toolMode: string;
    readonly paintSymmetry: boolean;
    readonly activePart: keyof typeof PART_ROLE_LABELS_KO;
    readonly activeSublayer: number;
    readonly brushRadius: number;
  };
  readonly notice: string | null;
  readonly noHandleReason: string | null;
  readonly hud: HudSample | null;
  readonly children: ReactNode;
}

/** 투샷의 표시 수치를 계산하며 포즈 명령 적용은 부모가 유지한다. */
export function resolveViewportDuoShot(recipe: Pick<CharacterRecipe, "source" | "body">, duoShot: DuoShotState) {
  const subjectHeight = resolveSubjectHeightMetrics(recipe.source, recipe.body);
  const duoPartner = SHAPER_DUO_PARTNER_PROFILES.find((item) => item.id === duoShot.partnerId) ?? SHAPER_DUO_PARTNER_PROFILES[0]!;
  const duoEyeContact = computeWebtoonDuoEyeContact({
    subjectHeightCm: subjectHeight.heightCm,
    subjectEyeHeightCm: subjectHeight.eyeHeightCm,
    partnerHeightCm: duoPartner.heightCm,
    partnerEyeHeightCm: duoPartner.eyeHeightCm,
    distanceMeters: DUO_SHOT_DISTANCES[duoShot.distanceKey].meters,
    side: duoShot.side,
  });
  return { subjectHeight, duoPartner, duoEyeContact };
}

/** 캔버스·배경·상태 표시를 조합하며 상호작용 handler와 ref는 부모가 유지한다. */
export function ViewportStage({ containerRef, canvas, backdrop, duoShot, mangaFx, engineStatus, engineReady, onSelectBackend, drawing, notice, noHandleReason, hud, children }: ViewportStageProps) {
  const engineText = describeEngineStatus(engineStatus);

  return (
    <div ref={containerRef} className="cl-viewport-stage" style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
      <ViewportBackdropLayers {...backdrop} />
      <canvas key={canvas.generation} ref={canvas.register} className="cl-viewport-canvas" aria-label="캐릭터 뷰포트" aria-keyshortcuts={canvas.keyShortcuts} tabIndex={0} style={{ position: "relative", zIndex: 1 }} />
      <ViewportDuoShotOverlay {...duoShot} />
      <ViewportMangaFxOverlay mangaFx={mangaFx} />

      {engineStatus.phase === "idle" ? <ViewportOnboardingCard onSelectBackend={onSelectBackend} /> : null}
      {engineStatus.phase !== "ready" ? (
        <p className="cl-viewport-status" role="status" data-tone={engineText.tone} style={{ position: "absolute", left: 12, right: 12, bottom: 12, margin: 0 }}>{engineText.text}</p>
      ) : null}

      {children}

      {engineReady && drawing.enabled ? (
        <p className="cl-viewport-hint" style={{ position: "absolute", top: 44, left: 8, margin: 0 }}>
          드로잉 모드({drawing.toolMode === "eraser" ? "지우개" : "브러시"}{drawing.paintSymmetry ? " · 대칭 ON" : ""}) · 레이어 {PART_ROLE_LABELS_KO[drawing.activePart]}(L{drawing.activeSublayer}) · 브러시 {drawing.brushRadius}px — 카메라 조작은 꺼져 있습니다(드로잉을 끄면 회전·확대).
        </p>
      ) : null}

      {notice || noHandleReason ? (
        <p className="cl-viewport-notice" role="status" style={{ position: "absolute", left: 8, right: 8, bottom: engineReady ? 8 : 56, margin: 0 }}>
          {notice ?? noHandleReason}
        </p>
      ) : null}

      <ViewportHud hud={hud} />
    </div>
  );
}

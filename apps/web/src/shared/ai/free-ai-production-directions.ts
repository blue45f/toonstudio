import type { OpenAiAssistStructuredResult } from "@toonstudio/contracts/studio-openai-assist-result";

export function summarizeFreeAiProductionDirections(
  result: OpenAiAssistStructuredResult,
): { headlineKo: string; bulletsKo: string[] } | undefined {
  switch (result.mode) {
    case "bg3d-camera-blocking": {
      const { sceneSummary, camera, lighting, propsToPlace, blockingNotes } = result.data;
      return {
        headlineKo: sceneSummary,
        bulletsKo: [
          `카메라 · ${camera.angleLabel} · 렌즈 ${camera.lensMm}mm · 시야각 ${camera.fovDeg}° · 롤 ${camera.rollDeg}°`,
          `카메라 위치 [${camera.position.join(", ")}] → 주시점 [${camera.target.join(", ")}]`,
          `조명 · ${lighting.timeOfDay} · 주광 ${lighting.keyLightColor} · 환경광 비율 ${lighting.ambientRatio}`,
          `림 라이트 · ${lighting.rimLightNote}`,
          ...propsToPlace.map((prop) => `배치 소품 · ${prop}`),
          ...blockingNotes.map((note) => `블로킹 · ${note}`),
        ],
      };
    }
    case "sfx-onomatopoeia-lab": {
      const { sceneEnergy, suggestions } = result.data;
      return {
        headlineKo: sceneEnergy,
        bulletsKo: suggestions.map(({ ko, ja, en, intent, typographyTip, placementHint }) =>
          `${ko} · JA: ${ja} · EN: ${en} — ${intent} · 식자: ${typographyTip} · 위치: ${placementHint}`),
      };
    }
    case "photoshop-fx-recipe": {
      const { lookNameKo, summary, layerStyles, cameraRaw, nonDestructiveTip } = result.data;
      return {
        headlineKo: lookNameKo,
        bulletsKo: [
          summary,
          ...layerStyles.map(({ effect, blendMode, opacityPct, paramsSummary }) =>
            `${effect} · 혼합 모드 ${blendMode} · 불투명도 ${opacityPct}% — ${paramsSummary}`),
          `Camera Raw · 노출 ${cameraRaw.exposure} EV · 대비 ${cameraRaw.contrast} · 명료도 ${cameraRaw.clarity}`,
          `Camera Raw · 안개 현상 제거 ${cameraRaw.dehaze} · 색온도 이동 ${cameraRaw.temperatureShift} · 그레인 ${cameraRaw.grainPct}%`,
          `비파괴 편집 · ${nonDestructiveTip}`,
        ],
      };
    }
    case "thumbnail-hook-optimizer": {
      const { hookDiagnosis, titleVariants, thumbnailSpec } = result.data;
      return {
        headlineKo: hookDiagnosis,
        bulletsKo: [
          ...titleVariants.map(({ variantLabel, title, subCopy, hookReason }) =>
            `[${variantLabel}] ${title} · 보조 문구: ${subCopy} · 선정 근거: ${hookReason}`),
          `초점 대상 · ${thumbnailSpec.focalSubject}`,
          `명암 대비 · ${thumbnailSpec.contrastNote}`,
          `이미지 위 문구 · 최대 ${thumbnailSpec.textOverlayMaxChars}자`,
          `크롭 안전 영역 · ${thumbnailSpec.cropSafetyTip}`,
        ],
      };
    }
    case "mcp-workflow-macro": {
      const { macroTitle, summary, zeroCostSafe, steps } = result.data;
      const orderedSteps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
      return {
        headlineKo: macroTitle,
        bulletsKo: [
          ...(orderedSteps.length ? [] : ["자동 단계 없음 · 수동 확인 대기"]),
          summary,
          `응답에 표시된 무과금 여부 · ${zeroCostSafe ? "예" : "아니요"}`,
          ...orderedSteps.map(({ stepOrder, toolName, reasonKo, argumentsJson }) =>
            `${stepOrder}. ${toolName} — ${reasonKo}\n인자: ${argumentsJson}`),
        ],
      };
    }
    default:
      return undefined;
  }
}

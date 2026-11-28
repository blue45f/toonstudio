import { describe, expect, it } from "vitest";

import { summarizeFreeAiProductionDirections } from "./free-ai-production-directions";

describe("무료 작업대의 제작 지시", () => {
  it("3D 카메라·조명 수치와 모든 소품·블로킹 메모를 차례로 보존한다", () => {
    const propsToPlace = ["배수구", "우산", "표지판", "벤치", "시간표"];
    const blockingNotes = ["사선으로 진입", "문 앞에 멈춤", "뒤돌아봄", "오른발 전진", "고개를 듦"];
    const result = summarizeFreeAiProductionDirections({
      mode: "bg3d-camera-blocking", data: {
        sceneSummary: "새벽 역사의 문이 열린다.",
        camera: { lensMm: 35, fovDeg: 46.5, angleLabel: "로우 앵글", position: [-2, 0, 1.75], target: [0, 1, -4], rollDeg: -4 },
        lighting: { timeOfDay: "새벽", keyLightColor: "#fa3", rimLightNote: "모자 끝을 분리한다.", ambientRatio: 0.075 },
        propsToPlace, blockingNotes,
      },
    });
    expect(result?.headlineKo).toBe("새벽 역사의 문이 열린다.");
    expect(result?.bulletsKo).toEqual([
      expect.stringMatching(/로우 앵글.*35mm.*46\.5°.*-4°/u),
      expect.stringContaining("[-2, 0, 1.75] → 주시점 [0, 1, -4]"),
      expect.stringMatching(/새벽.*#fa3.*0\.075/u),
      expect.stringContaining("모자 끝을 분리한다."),
      ...propsToPlace.map((prop) => expect.stringContaining(prop)),
      ...blockingNotes.map((note) => expect.stringContaining(note)),
    ]);
  });

  it("효과음마다 한·일·영 표기, 의도, 식자, 위치를 연결한다", () => {
    const suggestions = Array.from({ length: 6 }, (_, i) => ({
      ko: `탕${i}`, ja: `ドン${i}`, en: `BANG${i}`,
      intent: `울림${i}`, typographyTip: `굵기${i}`, placementHint: `위치${i}`,
    }));
    const result = summarizeFreeAiProductionDirections({
      mode: "sfx-onomatopoeia-lab", data: { sceneEnergy: "문이 닫힌다.", suggestions },
    });
    expect(result?.headlineKo).toBe("문이 닫힌다.");
    expect(result?.bulletsKo).toHaveLength(suggestions.length);
    suggestions.forEach((entry, index) => {
      for (const value of Object.values(entry)) expect(result?.bulletsKo[index]).toContain(value);
    });
  });

  it("레이어 적용 순서와 불투명도 0%, Camera Raw의 여섯 조정값을 보존한다", () => {
    const layerStyles = Array.from({ length: 5 }, (_, i) => ({
      effect: `광택${i}`, blendMode: `혼합${i}`, opacityPct: i * 10, paramsSummary: `반경 ${i}px`,
    }));
    const result = summarizeFreeAiProductionDirections({
      mode: "photoshop-fx-recipe", data: {
        lookNameKo: "비 오는 새벽", summary: "표면 반사를 강조한다.", layerStyles,
        cameraRaw: { exposure: -0.25, contrast: 31, clarity: -16, dehaze: 0, temperatureShift: -24, grainPct: 7 },
        nonDestructiveTip: "스마트 오브젝트에 적용한다.",
      },
    });
    expect(result?.headlineKo).toBe("비 오는 새벽");
    expect(result?.bulletsKo).toEqual([
      "표면 반사를 강조한다.",
      ...layerStyles.map(({ effect, blendMode, opacityPct, paramsSummary }) =>
        expect.stringMatching(new RegExp(`${effect}.*${blendMode}.*${opacityPct}%.*${paramsSummary}`, "u"))),
      expect.stringMatching(/노출 -0\.25 EV.*대비 31.*명료도 -16/u),
      expect.stringMatching(/안개 현상 제거 0.*색온도 이동 -24.*그레인 7%/u),
      expect.stringContaining("스마트 오브젝트에 적용한다."),
    ]);
  });

  it("썸네일 제목 후보 전체에 근거를 묶고 이미지 내 문구 금지와 크롭 조건을 남긴다", () => {
    const titleVariants = Array.from({ length: 6 }, (_, i) => ({
      variantLabel: `질문형${i}`, title: `누가 문을 열었나${i}`, subCopy: `단서${i}`, hookReason: `근거${i}`,
    }));
    const result = summarizeFreeAiProductionDirections({
      mode: "thumbnail-hook-optimizer", data: {
        hookDiagnosis: "시선이 아래로 흐른다.", titleVariants,
        thumbnailSpec: { focalSubject: "문틈의 손", contrastNote: "문틀을 어둡게", textOverlayMaxChars: 0, cropSafetyTip: "손끝은 중앙 60%에" },
      },
    });
    expect(result?.headlineKo).toBe("시선이 아래로 흐른다.");
    titleVariants.forEach((entry, index) => {
      for (const value of Object.values(entry)) expect(result?.bulletsKo[index]).toContain(value);
    });
    expect(result?.bulletsKo.slice(titleVariants.length)).toEqual([
      expect.stringContaining("문틈의 손"), expect.stringContaining("문틀을 어둡게"),
      expect.stringContaining("최대 0자"), expect.stringContaining("손끝은 중앙 60%에"),
    ]);
  });

  it("명시된 매크로 순서로 전체 단계의 근거와 원본 JSON을 표시하며 응답을 변경하지 않는다", () => {
    const steps = [5, 3, 2, 1, 4].map((stepOrder) => ({
      stepOrder, toolName: `studio.tool${stepOrder}`, reasonKo: `단계 근거 ${stepOrder}`,
      argumentsJson: `{ "단계": ${stepOrder}, "메모": "원본 띄어쓰기" }`,
    }));
    const result = summarizeFreeAiProductionDirections({
      mode: "mcp-workflow-macro", data: { macroTitle: "제작 순서", summary: "진행 전 원고를 확인한다.", zeroCostSafe: false, steps },
    });
    expect(result?.headlineKo).toBe("제작 순서");
    expect(result?.bulletsKo.slice(0, 2)).toEqual(["진행 전 원고를 확인한다.", expect.stringContaining("아니요")]);
    expect(result?.bulletsKo.slice(2)).toHaveLength(steps.length);
    for (const step of steps) {
      const line = result?.bulletsKo[step.stepOrder + 1];
      expect(line).toContain(`${step.stepOrder}. ${step.toolName}`);
      expect(line).toContain(step.reasonKo);
      expect(line).toContain(step.argumentsJson);
    }
    expect(steps.map((step) => step.stepOrder)).toEqual([5, 3, 2, 1, 4]);
  });

  it("다른 모드는 기존 결과 출력기로 넘긴다", () => {
    expect(summarizeFreeAiProductionDirections({
      mode: "idea-remix", data: { summary: "제목", angles: [] },
    })).toBeUndefined();
  });
});

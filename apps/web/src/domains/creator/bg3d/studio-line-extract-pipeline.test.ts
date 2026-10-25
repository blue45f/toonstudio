import { describe, expect, it } from "vitest";

import {
  resolveStudioLineExtractJob,
  studioLineExtractJobToBg3dLineSettings,
  studioLineExtractJobToLtVectorOptions,
} from "./studio-line-extract-pipeline";

describe("studio-line-extract-pipeline", () => {
  it("bg3d LT 기본값은 하이브리드·깊이 필요·내부선 억제 활성이다", () => {
    const job = resolveStudioLineExtractJob({ source: "bg3d-lt" });
    expect(job).not.toBeNull();
    expect(job?.algorithm).toBe("hybrid");
    expect(job?.engine).toBe("bg3d-lt");
    expect(job?.depthNeeded).toBe(true);
    expect(job?.interiorSuppression.active).toBe(true);
    expect(job?.interiorSuppression.strength).toBe(0.6);
    expect(job?.hiddenLineRemoval).toBe(true);
  });

  it("씬 3D는 bg3d와 같은 판정을 공유하되 가려진 선 제거 기본값이 다르다", () => {
    const job = resolveStudioLineExtractJob({ source: "scene-3d" });
    expect(job?.engine).toBe("scene-3d-line-art");
    expect(job?.depthNeeded).toBe(true);
    expect(job?.hiddenLineRemoval).toBe(false);
  });

  it("채색 사진은 ONNX만 허용하고 깊이를 요구하지 않는다", () => {
    const job = resolveStudioLineExtractJob({ source: "colorize-photo" });
    expect(job?.algorithm).toBe("onnx");
    expect(job?.engine).toBe("onnx-line");
    expect(job?.depthNeeded).toBe(false);
    expect(job?.interiorSuppression.active).toBe(false);
  });

  it("출처에서 쓸 수 없는 알고리즘과 알 수 없는 출처는 fail-closed로 null이다", () => {
    expect(resolveStudioLineExtractJob({ source: "colorize-photo", algorithm: "sobel" })).toBeNull();
    expect(resolveStudioLineExtractJob({ source: "bg3d-lt", algorithm: "onnx" })).toBeNull();
    expect(resolveStudioLineExtractJob({ source: "unknown" })).toBeNull();
    expect(resolveStudioLineExtractJob({})).toBeNull();
  });

  it("범위 밖 수치는 클램프되고 깊이 판정은 선 출력 규칙과 일치한다", () => {
    const job = resolveStudioLineExtractJob({
      source: "bg3d-lt",
      widthPx: 99,
      strength: -1,
      depthEnabled: false,
      interiorSuppressionEnabled: false,
    });
    expect(job?.widthPx).toBe(8);
    expect(job?.strength).toBe(0);
    // 깊이·내부선 억제가 모두 꺼지면 깊이 캡처도 필요 없다.
    expect(job?.depthNeeded).toBe(false);
  });

  it("bg3d 선 설정 매핑은 문서 기존값과 합칠 수 있는 부분 형태다", () => {
    const job = resolveStudioLineExtractJob({ source: "bg3d-lt", widthPx: 3 });
    expect(job).not.toBeNull();
    if (!job) return;
    const settings = studioLineExtractJobToBg3dLineSettings(job);
    expect(settings.enabled).toBe(true);
    expect(settings.widthPx).toBe(3);
    expect(settings.depthEnabled).toBe(true);
    expect(settings.interiorSuppressionEnabled).toBe(true);
    expect("layerType" in settings).toBe(false);
    expect("color" in settings).toBe(false);
  });

  it("채색 벡터 옵션은 굵기를 유지하고 스무딩이 클수록 단순화 허용 오차가 작아진다", () => {
    const plain = resolveStudioLineExtractJob({ source: "bg3d-lt", smoothing: 0 });
    const smooth = resolveStudioLineExtractJob({ source: "bg3d-lt", smoothing: 1 });
    expect(plain).not.toBeNull();
    expect(smooth).not.toBeNull();
    if (!plain || !smooth) return;
    expect(studioLineExtractJobToLtVectorOptions(plain).strokeWidth).toBe(2);
    expect(studioLineExtractJobToLtVectorOptions(plain).simplifyTolerance).toBe(0.75);
    expect(studioLineExtractJobToLtVectorOptions(smooth).simplifyTolerance).toBe(0);
  });
});

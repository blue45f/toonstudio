import { describe, expect, it } from "vitest";

import {
  ENGINEERING_LIBRARY_LICENSES,
  ENGINEERING_MODEL_ASSET_LICENSES,
} from "./engineering-license-inventory";

describe("라이브러리 라이선스 현황 데이터", () => {
  it("과거 스냅샷에서 외부 Mixbox와 wasm-vips를 제외한 115개를 표면별로 담는다", () => {
    expect(ENGINEERING_LIBRARY_LICENSES).toHaveLength(115);
    const bySurface = new Map<string, number>();
    for (const library of ENGINEERING_LIBRARY_LICENSES) {
      bySurface.set(library.surface, (bySurface.get(library.surface) ?? 0) + 1);
    }
    expect(bySurface.get("web")).toBe(83);
    expect(bySurface.get("api")).toBe(22);
    expect(bySurface.get("mobile")).toBe(8);
    expect(bySurface.get("labs")).toBe(2);
  });

  it("이름은 유일하고 버전·라이선스·역할이 비어 있지 않다", () => {
    const names = ENGINEERING_LIBRARY_LICENSES.map((library) => library.name);
    expect(new Set(names).size).toBe(names.length);
    for (const library of ENGINEERING_LIBRARY_LICENSES) {
      expect(library.version.length, library.name).toBeGreaterThan(0);
      expect(library.license.length, library.name).toBeGreaterThan(0);
      expect(library.role.ko.length, library.name).toBeGreaterThan(0);
      expect(library.role.en.length, library.name).toBeGreaterThan(0);
    }
  });

  it("강한 카피레프트(GPL·AGPL) 직접 의존성은 없다", () => {
    for (const library of ENGINEERING_LIBRARY_LICENSES) {
      expect(library.license, library.name).not.toMatch(/^(A?GPL|AGPL)/u);
      expect(library.license, library.name).not.toContain("AGPL");
    }
  });

  it("별도 확인이 필요한 잔존 항목은 플래그와 함께 정확히 여섯 개다", () => {
    const flagged = ENGINEERING_LIBRARY_LICENSES.filter((library) => library.flag);
    expect(flagged.map((library) => [library.name, library.license, library.flag])).toEqual(
      expect.arrayContaining([
        ["opencascade.js", "LGPL-2.1-only", "weak-copyleft"],
        ["@resvg/resvg-wasm", "MPL-2.0", "weak-copyleft"],
        ["web-ifc", "MPL-2.0", "weak-copyleft"],
        ["web-push", "MPL-2.0", "weak-copyleft"],
        ["remotion", "Remotion License", "custom-license"],
        ["@remotion/player", "Remotion License", "custom-license"],
      ]),
    );
    expect(flagged).toHaveLength(6);
    expect(ENGINEERING_LIBRARY_LICENSES.some((library) => library.name === "mixbox")).toBe(false);
    expect(ENGINEERING_LIBRARY_LICENSES.some((library) => library.name === "wasm-vips")).toBe(false);
  });
});

describe("AI 모델 자산 라이선스 데이터", () => {
  it("고지가 있는 모델 여섯 개의 크기·역할과 권리 상태를 담는다", () => {
    expect(ENGINEERING_MODEL_ASSET_LICENSES).toHaveLength(6);
    const expectedLicenses = new Map([
      ["u2netp.onnx", "Apache-2.0"],
      ["tag2pix.onnx", "Non-commercial; redistribution restricted"],
      ["teed.onnx", "MIT"],
      ["realesrgan-anime-6b.onnx", "BSD-3-Clause"],
      ["animegan2-paprika.onnx", "Unresolved upstream terms"],
      ["animegan2-face-paint-512-v2.onnx", "MIT (repository checkpoint)"],
    ]);
    for (const model of ENGINEERING_MODEL_ASSET_LICENSES) {
      expect(model.license, model.file).toBe(expectedLicenses.get(model.file));
      expect(model.license.length, model.file).toBeGreaterThan(0);
      expect(model.bytes, model.file).toBeGreaterThan(0);
      expect(model.role.ko.length, model.file).toBeGreaterThan(0);
      expect(["declared-permissive", "restricted", "unverified"], model.file).toContain(model.rightsStatus);
    }
  });

  it("배포 차단 두 모델과 MIT 체크포인트의 출처 검토 한 모델을 구별한다", () => {
    const blocked = ENGINEERING_MODEL_ASSET_LICENSES.filter((model) => model.rightsStatus !== "declared-permissive");
    expect(blocked.map((model) => model.file)).toEqual(["tag2pix.onnx", "animegan2-paprika.onnx"]);
    const checkpointReview = ENGINEERING_MODEL_ASSET_LICENSES.filter((model) => model.license === "MIT (repository checkpoint)");
    expect(checkpointReview.map((model) => model.file)).toEqual(["animegan2-face-paint-512-v2.onnx"]);
    expect(checkpointReview[0]?.note?.ko).toContain("추가 검토");
  });

  it("코드 MIT와 별개인 Tag2Pix 가중치의 비상업·재배포 제한을 드러낸다", () => {
    const tag2pix = ENGINEERING_MODEL_ASSET_LICENSES.find((model) => model.file === "tag2pix.onnx");
    expect(tag2pix?.rightsStatus).toBe("restricted");
    expect(tag2pix?.license).toContain("Non-commercial");
    expect(tag2pix?.license).toContain("redistribution restricted");
    expect(tag2pix?.note?.ko).toContain("ONNX 변환은 이 제한을 해소하지 않는다");
  });

  it("Paprika 원본 조건 충돌과 Face Paint의 MIT 체크포인트·학습 출처 검토를 구별한다", () => {
    expect(ENGINEERING_MODEL_ASSET_LICENSES.filter((model) => model.file.startsWith("animegan2-"))).toHaveLength(2);
    const paprika = ENGINEERING_MODEL_ASSET_LICENSES.find((model) => model.file === "animegan2-paprika.onnx");
    const face = ENGINEERING_MODEL_ASSET_LICENSES.find((model) => model.file === "animegan2-face-paint-512-v2.onnx");
    expect(paprika?.rightsStatus).toBe("unverified");
    expect(paprika?.note?.ko).toContain("비상업 조건");
    expect(paprika?.note?.ko).toContain("충돌");
    expect(face?.rightsStatus).toBe("declared-permissive");
    expect(face?.license).toBe("MIT (repository checkpoint)");
    expect(face?.note?.ko).toContain("별도 학습 모델");
    expect(face?.note?.ko).toContain("단정하지 않는다");
    expect(face?.note?.ko).toContain("root MIT와 함께 배포");
    expect(face?.note?.ko).toContain("학습 출처는 일부만 공개");
    expect(paprika?.license).not.toBe("MIT");
  });
});

import { expect, it } from "vitest";
import { studioBg3dSixPassCopyUnavailableReason } from "./studio-bg3d-six-pass-copy-guard";
import type { El } from "../../../studio-element-model";

it("marker가 지워진 새 URI도 직접 clip 붙여넣기로 우회하지 못하고 기존 일반 이미지는 허용한다", () => {
  const image: El = { id: "image-one", type: "image", src: `bg3d-lt-artifact://sha256/${"a".repeat(64)}`, x: 0, y: 0, width: 1, height: 1, rotation: 0 };
  expect(studioBg3dSixPassCopyUnavailableReason([image])).toContain("아직 지원하지 않습니다");
  expect(studioBg3dSixPassCopyUnavailableReason([{ ...image, src: "data:image/png;base64,AA==" }])).toBeNull();
});

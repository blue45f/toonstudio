// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createStudioScene3dDocument } from "./studio-scene3d-document";
import { createStudioScene3dVersionedCut } from "./studio-scene3d-shot-versions";
import { StudioScene3dShotList } from "./StudioScene3dShotList";

afterEach(cleanup);
it("선택 컷과 전체 촬영표에 각각 저장한 카메라를 쓰고 같은 텍스트를 내보낸다", () => {
  const scene = createStudioScene3dDocument("test-shot-list", "2026-11-19T00:00:00.000Z");
  const first = createStudioScene3dVersionedCut({ scene, characters: {}, id: "studio-1", name: "골목 전경" });
  const second = createStudioScene3dVersionedCut({ scene, characters: {}, id: "studio-2", name: "인물 눈높이" });
  const selected = { ...second, camera: { ...second.camera, projection: "orthographic" as const, orthoScale: 3.75 } };
  const onDownload = vi.fn();
  const { container } = render(<StudioScene3dShotList cuts={[first, selected]} selected={selected} onDownload={onDownload} />);
  const details = container.querySelector("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  const output = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "촬영표 내용" });
  expect(output.value).toContain("인물 눈높이");
  expect(output.value).toContain("직교 범위 3.75 m");
  expect(output.value).not.toContain("골목 전경");
  fireEvent.change(screen.getByRole("combobox", { name: "포함할 컷" }), { target: { value: "all" } });
  expect(output.value.indexOf("골목 전경")).toBe(0);
  expect(output.value).toContain("초점 거리");
  expect(output.value).toContain("직교 범위 3.75 m");
  fireEvent.click(screen.getByRole("button", { name: "촬영표 TXT 다운로드" }));
  expect(onDownload).toHaveBeenCalledExactlyOnceWith(output.value);
});

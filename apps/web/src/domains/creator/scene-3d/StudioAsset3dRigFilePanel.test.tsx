// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StudioAsset3dRigFilePanel } from "./StudioAsset3dRigFilePanel";
import { readStudioRigWeightRegion, studioRigWeightRegions } from "./studio-asset3d-rig-weights";
import { readStudioRigFile, studioRigJoints } from "./studio-asset3d-rig-file";

const state = vi.hoisted(() => ({
  undo: null as Uint8Array | null,
  saved: null as null | { saved: { hash: string; name: string; weightUndo?: string }; bytes: Uint8Array },
}));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ ready: true, data: null }),
}));
vi.mock("./studio-asset3d-rig-storage", () => ({
  loadStudioRigWork: vi.fn(async () => state.saved),
  loadStudioRigWeightUndo: vi.fn(async () => state.undo),
  saveStudioRigWork: vi.fn(async (_scope, _before, name, bytes: Uint8Array, undo?: Uint8Array) => {
    state.undo = undo ?? null;
    const saved = {
      hash: "sha256:" + "a".repeat(64),
      name,
      ...(undo ? { weightUndo: "sha256:" + "b".repeat(64) } : {}),
    };
    state.saved = { saved, bytes };
    return saved;
  }),
}));
afterEach(() => {
  cleanup();
  state.saved = null;
  state.undo = null;
  vi.unstubAllGlobals();
});
it("실제 골격 선택·이름 변경·자식 추가와 작업대 재진입이 같은 작업 파일을 사용한다", async () => {
  const bytes = readFileSync("apps/web/public/models/mannequin/toonstudio_ecorche_mannequin_v3.glb");
  vi.stubGlobal("fetch", async () => new Response(bytes));
  const first = render(<StudioAsset3dRigFilePanel />);
  const list = await screen.findByRole("combobox", { name: "리깅 본 목록" });
  const hand = studioRigJoints(readStudioRigFile(new Uint8Array(bytes)), 0).find((j) => j.name === "leftHand")!;
  fireEvent.change(list, { target: { value: String(hand.id) } });
  fireEvent.change(screen.getByRole("textbox", { name: "선택된 본 이름 변경" }), {
    target: { value: "펜 쥔 손" },
  });
  fireEvent.click(screen.getByRole("button", { name: "이름 변경" }));
  await screen.findByText("기기에 작업 파일을 저장했어요.");
  fireEvent.click(screen.getByRole("button", { name: "자식 관절 추가" }));
  await waitFor(() =>
    expect((screen.getByRole("textbox", { name: "선택된 본 이름 변경" }) as HTMLInputElement).value).toBe(
      "CustomBone_52",
    ),
  );
  expect(studioRigJoints(readStudioRigFile(state.saved!.bytes), 0).at(-1)?.parent).toBe("펜 쥔 손");
  first.unmount();
  render(<StudioAsset3dRigFilePanel />);
  await screen.findByText("기기에 저장한 작업 파일을 열었어요.");
  expect(screen.getByRole("option", { name: /CustomBone_52 · 부모 펜 쥔 손/ })).toBeTruthy();
});

it("메시와 줄 관절을 골라 적용·재열기·되돌리기한 실제 GLB에서 새 관절의 웨이트가 변한다", async () => {
  const bytes = readFileSync("apps/web/public/models/mannequin/toonstudio_ecorche_mannequin_v3.glb");
  vi.stubGlobal("fetch", async () => new Response(bytes));
  const first = render(<StudioAsset3dRigFilePanel />);
  const bones = await screen.findByRole("combobox", { name: "리깅 본 목록" });
  const original = readStudioRigFile(new Uint8Array(bytes)),
    hand = studioRigJoints(original, 0).find((j) => j.name === "leftHand")!;
  fireEvent.change(bones, { target: { value: String(hand.id) } });
  fireEvent.click(screen.getByRole("button", { name: "자식 관절 추가" }));
  await screen.findByText("기기에 작업 파일을 저장했어요.");
  const previous = state.saved!.bytes.slice();
  const region = studioRigWeightRegions(original, 0).find((r) => r.name.includes("Hand_Palm_L"))!;
  fireEvent.click(screen.getByText("스킨 웨이트 옮기기"));
  fireEvent.change(screen.getByRole("combobox", { name: "메시 영역" }), { target: { value: region.key } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "옮길 비율 (%)" }), { target: { value: "0" } });
  expect((screen.getByRole("button", { name: "웨이트 적용" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain("1~100");
  fireEvent.change(screen.getByRole("spinbutton", { name: "옮길 비율 (%)" }), { target: { value: "40" } });
  fireEvent.change(screen.getByRole("combobox", { name: "웨이트를 줄 관절" }), {
    target: { value: String(hand.id) },
  });
  fireEvent.click(screen.getByRole("button", { name: "웨이트 적용" }));
  await screen.findByRole("button", { name: "마지막 웨이트 되돌리기" });
  const s = readStudioRigWeightRegion(readStudioRigFile(state.saved!.bytes), 0, region);
  expect(s.influenced.at(-1)).toBeGreaterThan(0);
  first.unmount();
  render(<StudioAsset3dRigFilePanel />);
  await screen.findByText("기기에 저장한 작업 파일을 열었어요.");
  fireEvent.click(screen.getByText("스킨 웨이트 옮기기"));
  fireEvent.click(screen.getByRole("button", { name: "마지막 웨이트 되돌리기" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "마지막 웨이트 되돌리기" })).toBeNull());
  expect(Buffer.compare(previous, state.saved!.bytes)).toBe(0);
});

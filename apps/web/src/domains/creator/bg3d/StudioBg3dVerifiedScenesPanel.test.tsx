// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { StudioBg3dVerifiedScenesPanel } from "./StudioBg3dVerifiedScenesPanel";
import type { Bg3dTemplateLibraryEntry } from "./bg3d-template-library";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { STUDIO_BG3D_VERIFIED_LOCAL_SCENES } from "./studio-bg3d-verified-local-scenes";
import { linkStudioBg3dVerifiedScene } from "./studio-bg3d-verified-scene-link";

vi.mock("./studio-bg3d-verified-scene-link", () => ({ linkStudioBg3dVerifiedScene: vi.fn() }));

const entry: Bg3dTemplateLibraryEntry = {
  id: "local-test", name: "검증 장면", createdAt: 1_000, commercialUse: false,
  document: createDefaultStudioBg3dSceneDocument(),
};

beforeEach(() => {
  useI18n.getState().setLang("ko");
  vi.mocked(linkStudioBg3dVerifiedScene).mockReset();
});
afterEach(cleanup);

describe("검증 장면을 기기 라이브러리에서 적용", () => {
  it("새 원고의 선택기에서 여섯 장면을 찾을 수 있고, 권리 확인 전에는 적용하지 않는다", () => {
    const onApply = vi.fn().mockResolvedValue(true);
    render(<StudioBg3dVerifiedScenesPanel disabled={false} onApply={onApply} />);
    const select = screen.getByRole("combobox", { name: "검증 장면" });
    for (const scene of STUDIO_BG3D_VERIFIED_LOCAL_SCENES) {
      expect(within(select).getByRole("option", { name: scene.name })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "기기 라이브러리에서 적용" }));
    expect(linkStudioBg3dVerifiedScene).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("장면을 바꾸면 사용권을 다시 확인하고, 파일 확인 중 편집기를 닫으면 배치를 취소한다", async () => {
    const bench = STUDIO_BG3D_VERIFIED_LOCAL_SCENES.find(scene => scene.id === "park-bench");
    if (!bench) throw new Error("벤치 장면이 필요합니다.");
    let finish!: (entry: Bg3dTemplateLibraryEntry) => void;
    const pending = new Promise<Bg3dTemplateLibraryEntry>(resolve => { finish = resolve; });
    vi.mocked(linkStudioBg3dVerifiedScene).mockReturnValue(pending);
    const onApply = vi.fn().mockResolvedValue(true);
    const onLinked = vi.fn();
    const { unmount } = render(<StudioBg3dVerifiedScenesPanel disabled={false} onApply={onApply} onLinked={onLinked} />);
    const consent = screen.getByRole("checkbox");
    fireEvent.click(consent);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: bench.id } });
    expect(consent.matches(":checked")).toBe(false);
    const input = screen.getByLabelText("검증 장면의 GLB 파일");
    expect(input.matches(":disabled")).toBe(true);
    fireEvent.click(consent);
    const file = new File(["local"], bench.fileName);
    fireEvent.change(input, { target: { files: [file] } });
    expect(linkStudioBg3dVerifiedScene).toHaveBeenCalledWith(bench, file, expect.any(AbortSignal));
    const signal = vi.mocked(linkStudioBg3dVerifiedScene).mock.calls[0]?.[2];
    unmount();
    expect(signal?.aborted).toBe(true);
    finish(entry);
    await pending;
    expect(onApply).not.toHaveBeenCalled();
    expect(onLinked).not.toHaveBeenCalled();
  });

  it("누락된 파일과 적용 실패 뒤에도 같은 선택으로 다시 시도할 수 있다", async () => {
    const [preset] = STUDIO_BG3D_VERIFIED_LOCAL_SCENES;
    if (!preset) throw new Error("선택할 장면이 필요합니다.");
    const onApply = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    vi.mocked(linkStudioBg3dVerifiedScene)
      .mockRejectedValueOnce(new Error("등록한 원본 파일이 없습니다."))
      .mockResolvedValue(entry);
    render(<StudioBg3dVerifiedScenesPanel disabled={false} onApply={onApply} />);
    fireEvent.change(screen.getByRole("combobox", { name: "검증 장면" }), { target: { value: preset.id } });
    fireEvent.click(screen.getByRole("checkbox", { name: "이 모델을 사용할 권리를 확인했습니다" }));
    const apply = screen.getByRole("button", { name: "기기 라이브러리에서 적용" });

    fireEvent.click(apply);
    await waitFor(() => expect(linkStudioBg3dVerifiedScene).toHaveBeenCalledTimes(1));
    expect((await screen.findByRole("alert")).textContent).toContain("등록한 원본 파일이 없습니다.");
    expect(onApply).not.toHaveBeenCalled();
    await waitFor(() => expect(apply.matches(":disabled")).toBe(false));

    fireEvent.click(apply);
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect((await screen.findByRole("alert")).textContent).toContain("장면을 배치하지 못했습니다");
    await waitFor(() => expect(apply.matches(":disabled")).toBe(false));

    fireEvent.click(apply);
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("장면을 적용"));
    expect(onApply).toHaveBeenLastCalledWith(entry);
    expect(vi.mocked(linkStudioBg3dVerifiedScene).mock.calls.map(([scene, file]) => [scene.id, file]))
      .toEqual([[preset.id, null], [preset.id, null], [preset.id, null]]);
  });
});

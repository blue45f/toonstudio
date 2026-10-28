// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioHybridDccPanel } from "../StudioHybridDccPanel";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  type StudioHybridDccWorkspace,
} from "../studio-hybrid-dcc-workspace";

import { createStudioHybridDccDefaultToonMaterial } from "./studio-hybrid-dcc-toon-material";
import { workspaceSetStudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-workspace";

import type { StudioHybridDccBg3dHandoffPorts, StudioHybridDccBg3dHandoffResult, StudioHybridDccBg3dPersistedAttachment } from "../studio-hybrid-dcc-bg3d-handoff";

type Handoff = typeof import("../studio-hybrid-dcc-bg3d-handoff")["handoffStudioHybridDccWorkspaceToBg3d"];
const auth = vi.hoisted(() => ({ actor: "handoff-owner", revision: 0, listeners: new Set<() => void>() }));
const handoff = vi.hoisted(() => vi.fn<Handoff>());
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => auth.actor,
  getAuthSessionRevision: () => auth.revision,
  listeners: auth.listeners,
}));
vi.mock("../studio-hybrid-dcc-bg3d-handoff", () => ({ handoffStudioHybridDccWorkspaceToBg3d: handoff }));

/** 실제 Panel DOM과 정본 workspace를 쓰며 GPU 화면·영속 저장소를 검증하는 테스트는 아니다. */
const ports: StudioHybridDccBg3dHandoffPorts = {
  glbExportExecutionBackend: "direct",
  persistAttachments: async (requests) => requests.map((request): StudioHybridDccBg3dPersistedAttachment => ({
    assetId: request.assetId,
    attachment: {
      id: request.attachmentId, name: request.fileName, mime: "model/gltf-binary",
      byteSize: request.bytes.byteLength, hash: request.expectedSha256, rights: request.rights,
      source: "local-library",
      generic3dWorkflow: { version: 1, classification: "prop", sourceFormat: "glb" },
    },
  })),
};
let plain: StudioHybridDccWorkspace;
let toon: StudioHybridDccWorkspace;
let plainResult: StudioHybridDccBg3dHandoffResult;
let toonResult: StudioHybridDccBg3dHandoffResult;

beforeAll(async () => {
  plain = workspaceAddUnitCube(createStudioHybridDccWorkspace("panel-handoff-authority"), "cube");
  toon = workspaceSetStudioHybridDccToonMaterial(plain, "cube", [0], createStudioHybridDccDefaultToonMaterial());
  const actual = await vi.importActual<typeof import("../studio-hybrid-dcc-bg3d-handoff")>("../studio-hybrid-dcc-bg3d-handoff");
  // 유효한 장면·영수증은 실제 변환으로 만들고 Panel의 비동기 완료 시점만 아래에서 제어한다.
  plainResult = await actual.handoffStudioHybridDccWorkspaceToBg3d(plain, { ports });
  toonResult = await actual.handoffStudioHybridDccWorkspaceToBg3d(toon, { ports });
});
beforeEach(() => { auth.actor = "handoff-owner"; auth.revision = 0; handoff.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); expect(auth.listeners.size).toBe(0); });

function log() {
  const element = document.querySelector<HTMLElement>("[data-studio-hybrid-dcc-log]");
  if (!element) throw new Error("Panel 완료 안내가 없습니다.");
  return element;
}
function snapshot() {
  const element = document.querySelector<HTMLElement>("[data-studio-hybrid-dcc-stats]");
  if (!element) throw new Error("Panel 정본 상태가 없습니다.");
  return element.outerHTML;
}
function openButton() { return screen.getByRole("button", { name: /^3D 배경 편집기로 열기\s*검증된 GLB로/u }); }
function mount(workspace = toon) {
  const callback = vi.fn<(result: StudioHybridDccBg3dHandoffResult) => void>();
  const changed = vi.fn<(next: StudioHybridDccWorkspace) => void>();
  const element = (project = "project-a", enabled = true) => <StudioHybridDccPanel
    initialWorkspace={workspace} workspaceDocumentId={project} workbenchMode="shot"
    onOpenInBackground3D={enabled ? callback : undefined} onWorkspaceChange={changed}
  />;
  const view = render(element());
  return { view, callback, changed, element };
}
async function begin() {
  const pending = Promise.withResolvers<StudioHybridDccBg3dHandoffResult>();
  handoff.mockReturnValue(pending.promise);
  fireEvent.click(openButton());
  await waitFor(() => expect(handoff).toHaveBeenCalledOnce());
  const options = handoff.mock.calls[0]?.[1];
  if (!options?.signal) throw new Error("실행 중 전달의 AbortSignal이 없습니다.");
  expect(options.signal.aborted).toBe(false);
  expect(openButton().hasAttribute("disabled")).toBe(true);
  return { ...pending, signal: options.signal };
}
async function complete(pending: Awaited<ReturnType<typeof begin>>, result = toonResult) {
  await act(async () => { pending.resolve(result); await pending.promise; });
}

describe("실제 Panel의 툰 재질 전달 안내와 비동기 lease", () => {
  it("전달 전의 고정 안내와 실제 결과의 보존 경고를 표시하고 정상 callback을 한 번 실행한다", async () => {
    const host = mount(); const before = snapshot();
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("툰 명암·외곽선은 반영하지 않습니다");
    expect(note.textContent).toContain("정밀 작업대와 GLB에 보존됩니다");
    expect(handoff).not.toHaveBeenCalled();
    const pending = await begin();
    expect(handoff.mock.calls[0]?.[0]).toBe(toon);
    expect(host.callback).not.toHaveBeenCalled();
    // busy 중 중복 클릭으로 두 번째 전달을 만들지 않는다.
    fireEvent.click(openButton()); expect(handoff).toHaveBeenCalledOnce();
    await complete(pending);
    expect(host.callback).toHaveBeenCalledExactlyOnceWith(toonResult);
    expect(log().textContent).toContain("3D 장면을 열었습니다 · 메시 1개");
    expect(log().textContent).toContain(`보존 안내 ${toonResult.losses.length}건`);
    expect(log().textContent).toContain("툰 명암·외곽선은 반영하지 않습니다");
    expect(screen.getByRole("note")).toBe(note);
    expect(snapshot()).toBe(before); expect(host.changed).not.toHaveBeenCalled();
    expect(openButton().hasAttribute("disabled")).toBe(false);
  });

  it("툰 설정이 없는 실제 문서에는 툰 경고를 추가하지 않고 일반 전달 결과를 연다", async () => {
    const host = mount(plain); expect(screen.queryByRole("note")).toBeNull();
    const pending = await begin(); await complete(pending, plainResult);
    expect(host.callback).toHaveBeenCalledExactlyOnceWith(plainResult);
    expect(log().textContent).toContain("3D 장면을 열었습니다");
    expect(log().textContent).not.toContain("툰 명암");
  });

  it.each(["actor", "revision", "project", "permission", "unmount"] as const)("%s 전환은 진행 중 전달을 abort하고 늦게 성공해도 callback·완료 안내·정본을 바꾸지 않는다", async (kind) => {
    const host = mount(); const before = snapshot(); const initialLog = log().textContent;
    const pending = await begin();
    if (kind === "actor" || kind === "revision") {
      act(() => {
        if (kind === "actor") auth.actor = "other-owner";
        auth.revision += 1; auth.listeners.forEach((notify) => notify());
      });
    } else if (kind === "project") host.view.rerender(host.element("project-b"));
    else if (kind === "permission") {
      host.view.rerender(host.element("project-a", false));
      expect(screen.queryByRole("note")).toBeNull();
      // 권한이 다시 생겨도 이전 요청을 되살리지 않는다.
      host.view.rerender(host.element());
    } else host.view.unmount();
    expect(pending.signal.aborted).toBe(true);
    await complete(pending);
    expect(host.callback).not.toHaveBeenCalled(); expect(host.changed).not.toHaveBeenCalled();
    if (kind !== "unmount") { expect(log().textContent).toBe(initialLog); expect(snapshot()).toBe(before); }
    else expect(screen.queryByRole("region", { name: "정밀 3D 모델링 작업 공간" })).toBeNull();
  });

  it("지연 모듈을 기다리는 사이 프로젝트가 바뀌면 변환 자체를 시작하지 않는다", async () => {
    const host = mount(); fireEvent.click(openButton());
    host.view.rerender(host.element("project-b"));
    await act(async () => { await vi.dynamicImportSettled(); });
    expect(handoff).not.toHaveBeenCalled(); expect(host.callback).not.toHaveBeenCalled();
    expect(log().textContent).not.toContain("3D 장면을 열었습니다");
  });

  it("현재 요청의 오류는 실패 안내로 표시하고 callback과 정본을 보존한다", async () => {
    const host = mount(); const before = snapshot(); const pending = await begin();
    await act(async () => { pending.reject(new Error("저장 영수증을 확인하지 못했습니다.")); await pending.promise.catch(() => undefined); });
    expect(log().textContent).toContain("3D 배경 편집기 전달 실패");
    expect(log().textContent).toContain("저장 영수증을 확인하지 못했습니다.");
    expect(host.callback).not.toHaveBeenCalled(); expect(host.changed).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before); expect(openButton().hasAttribute("disabled")).toBe(false);
  });
});

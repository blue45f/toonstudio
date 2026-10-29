// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { parseSkp } from "openskp";
import { Group } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dSkpSourceInfoPanel } from "./StudioBg3dSkpSourceInfoPanel";
import { studioBg3dModelCacheKey, studioBg3dModelRuntimeVariant } from "./studio-bg3d-model-material-variant";
import { extractStudioBg3dSkpSceneManifest } from "./studio-bg3d-skp-scene-manifest";
import { studioBg3dSkpGeometryTransform, unavailableStudioBg3dSkpSceneSource } from "./studio-bg3d-skp-scene-source";
import { createStudioBg3dSkpSceneSourceVffBytes } from "./studio-bg3d-skp-scene-source.test-fixture";
import { createStudioBg3dSkpSourceReaderFromHost, inspectStudioBg3dSkpSourceSelection } from "./studio-bg3d-skp-source-read-command";

import type { StudioBg3dSkpSceneSource, StudioBg3dSkpSceneSourceReason } from "./studio-bg3d-skp-scene-source";
import type { StudioBg3dReadSkpSceneSource, StudioBg3dSkpSourceReadResult } from "./studio-bg3d-skp-source-read-command";

const downloads = vi.hoisted(() => ({ download: vi.fn<(blob: Blob, filename: string) => void>() }));
vi.mock("../export/studio-export", () => ({ downloadBlob: downloads.download }));

function actualSource(large = false): StudioBg3dSkpSceneSource {
  const bytes = new Uint8Array(createStudioBg3dSkpSceneSourceVffBytes());
  const raw = parseSkp(bytes.buffer);
  const page = raw.pages[0], tag = raw.layers[0];
  if (!page || !tag) throw new Error("실제 파서의 카메라·태그 픽스처가 없습니다.");
  const extracted = extractStudioBg3dSkpSceneManifest(large ? { ...raw,
    pages: Array.from({ length: 256 }, (_, index) => ({ ...page, name: `카메라 ${index + 1}` })),
    layers: Array.from({ length: 512 }, (_, index) => ({ ...tag, name: `태그 ${index + 1}`, hidden: index % 2 === 0 })),
  } : raw);
  if (!extracted.ok) throw new Error(`${extracted.code}: ${extracted.detail}`);
  return { version: 1, status: "available", manifest: extracted.value, reason: null, geometryTransform: studioBg3dSkpGeometryTransform() };
}

function host(source?: StudioBg3dSkpSceneSource, suffix = "A") {
  const root = new Group();
  if (source) root.userData.toonstudioSkpSceneSource = source;
  const value = {
    open: true, selectedIds: new Set([`instance-${suffix}`]),
    physicsRuntimeSourceRef: { current: { customModels: [{ id: `instance-${suffix}`, modelId: `storage-${suffix}`, name: `선택 모델 ${suffix}` }], primitives: [] } },
    modelRootCacheRef: { current: new Map([[studioBg3dModelCacheKey(`storage-${suffix}`, "webgl"), { root, runtimeVariant: studioBg3dModelRuntimeVariant("webgl"), record: { id: `storage-${suffix}` } }]]) },
  };
  const read = vi.fn(createStudioBg3dSkpSourceReaderFromHost(value));
  return { root, read, context: value, selection: inspectStudioBg3dSkpSourceSelection(value) };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("지연 결과가 준비되지 않았습니다."); };
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("JSON을 읽지 못했습니다."));
    reader.onerror = () => reject(new Error("JSON을 읽지 못했습니다."));
    reader.readAsText(blob);
  });
}

beforeEach(() => { downloads.download.mockReset(); });
afterEach(cleanup);

describe("선택 모델의 실제 SKP 원본 정보 조회", () => {
  it("사용자 클릭 뒤 실제 reader 결과의 카메라·태그·정의·배치와 지원 한계를 표시한다", async () => {
    const value = host(actualSource());
    render(<StudioBg3dSkpSourceInfoPanel selection={value.selection} onReadSource={value.read} />);
    expect(value.read).not.toHaveBeenCalled();
    expect(screen.queryByText("원근 컷")).toBeNull();
    expect(screen.getByText("선택 모델: 선택 모델 A")).toBeTruthy();
    expect(screen.getByText(/평행 카메라를 적용할 수 있으며 다른 Page 상태/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "SKP 원본 정보 읽기" }));
    await screen.findByTestId("bg3d-skp-source-available");
    expect(value.read).toHaveBeenCalledTimes(1);
    expect(screen.getByText("원근 컷")).toBeTruthy();
    expect(screen.getByText("평행 컷")).toBeTruthy();
    expect(screen.getByText("원근 투영")).toBeTruthy();
    expect(screen.getByText("평행 투영")).toBeTruthy();
    expect(screen.getAllByText("원본 FOV 47.5° · 기준 미확인")).toHaveLength(2);
    expect(screen.getByText("원본 평행 높이 144 in")).toBeTruthy();
    expect(screen.getByText("카메라").nextElementSibling?.textContent).toBe("2");
    expect(screen.getByText("정의 (루트 포함)").nextElementSibling?.textContent).toBe("2");
    expect(screen.getByText("배치 기록 (정의별)").nextElementSibling?.textContent).toBe("1");
    expect(screen.getByLabelText("파서가 읽은 기록 수").textContent).toContain("정의 (루트 포함)");
    fireEvent.click(screen.getByRole("button", { name: "태그 목록 · 2개" }));
    expect(screen.getByText("지붕")).toBeTruthy();
    expect(screen.getByText("파서 상태: 숨김")).toBeTruthy();
  });

  it("준비되지 않은 선택·연결·비활성 상태는 이유를 표시하고 reader를 실행하지 않는다", () => {
    const value = host(actualSource());
    const view = render(<StudioBg3dSkpSourceInfoPanel onReadSource={value.read} />);
    expect(screen.getByTestId("bg3d-skp-source-read")).toHaveProperty("disabled", true);
    expect(screen.getByText("원본 정보를 확인할 3D 모델 하나를 선택하세요.")).toBeTruthy();
    view.rerender(<StudioBg3dSkpSourceInfoPanel selection={value.selection} />);
    expect(screen.getByText("원본 정보 조회가 연결된 3D 배경 편집기를 열어 주세요.")).toBeTruthy();
    view.rerender(<StudioBg3dSkpSourceInfoPanel selection={{ ...value.selection, blockedReason: "모델을 불러오는 중입니다." }} onReadSource={value.read} />);
    expect(screen.getByText("모델을 불러오는 중입니다.")).toBeTruthy();
    view.rerender(<StudioBg3dSkpSourceInfoPanel selection={value.selection} onReadSource={value.read} disabled />);
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    expect(value.read).not.toHaveBeenCalled();
  });

  it("실제 reader의 legacy 응답을 원본 정보 확보로 표시하지 않는다", async () => {
    const value = host();
    render(<StudioBg3dSkpSourceInfoPanel selection={value.selection} onReadSource={value.read} />);
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    expect((await screen.findByTestId("bg3d-skp-source-legacy")).textContent).toContain("원본 장면 정보가 기록되어 있지 않습니다");
    expect(screen.queryByTestId("bg3d-skp-source-available")).toBeNull();
  });

  it("캐시 로딩 안내가 있어도 조회를 허용하고 같은 selection props에서 캐시 준비 후 재시도한다", async () => {
    const value = host(actualSource());
    value.context.modelRootCacheRef.current.clear();
    const selection = inspectStudioBg3dSkpSourceSelection(value.context);
    render(<StudioBg3dSkpSourceInfoPanel selection={selection} onReadSource={value.read} />);
    expect(screen.getByTestId("bg3d-skp-source-read")).toHaveProperty("disabled", false);
    expect(screen.getByText("모델을 불러오는 중입니다. 준비된 뒤 다시 확인하세요.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    expect((await screen.findByRole("alert")).textContent).toContain("모델을 불러오는 중");
    value.context.modelRootCacheRef.current.set(studioBg3dModelCacheKey("storage-A", "webgl"), { root: value.root, runtimeVariant: studioBg3dModelRuntimeVariant("webgl"), record: { id: "storage-A" } });
    fireEvent.click(screen.getByRole("button", { name: "원본 정보 다시 읽기" }));
    await screen.findByText("원근 컷");
    expect(value.read).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("모델을 불러오는 중입니다. 준비된 뒤 다시 확인하세요.")).toBeNull();
  });

  const reasons: readonly StudioBg3dSkpSceneSourceReason[] = ["metadata-pass-size-limit", "parser-unavailable", "metadata-parse-failed", "manifest-invalid-source", "manifest-budget-exceeded"];
  it.each(reasons)("실제 reader의 unavailable %s 원인을 빈 목록이나 성공 확보로 바꾸지 않는다", async (reason) => {
    const value = host(unavailableStudioBg3dSkpSceneSource(reason));
    render(<StudioBg3dSkpSourceInfoPanel selection={value.selection} onReadSource={value.read} />);
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    const result = await screen.findByTestId("bg3d-skp-source-unavailable");
    expect(result.textContent).toContain("원본 장면 정보를 보관하지 못한 자산");
    expect(result.textContent?.length).toBeGreaterThan(40);
    expect(screen.queryByTestId("bg3d-skp-source-available")).toBeNull();
  });

  it("실제 검증 실패를 안내하고 캐시를 고친 뒤 같은 reader로 다시 조회할 수 있다", async () => {
    const value = host();
    value.root.userData.toonstudioSkpSceneSource = { version: 2, status: "available" };
    render(<StudioBg3dSkpSourceInfoPanel selection={value.selection} onReadSource={value.read} />);
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    expect((await screen.findByRole("alert")).textContent).toContain("원본 장면 정보가 올바르지 않습니다");
    expect(screen.queryByTestId("bg3d-skp-source-available")).toBeNull();
    value.root.userData.toonstudioSkpSceneSource = actualSource();
    fireEvent.click(screen.getByRole("button", { name: "원본 정보 다시 읽기" }));
    await screen.findByText("원근 컷");
    expect(value.read).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("promise가 실제 완료될 때까지 loading으로 표시하고 중복 조회를 막는다", async () => {
    const value = host(actualSource());
    const result = deferred<StudioBg3dSkpSourceReadResult>();
    const read = vi.fn<StudioBg3dReadSkpSceneSource>(() => result.promise);
    render(<StudioBg3dSkpSourceInfoPanel selection={value.selection} onReadSource={read} />);
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    expect(screen.getByRole("button", { name: "원본 정보 읽는 중" })).toHaveProperty("disabled", true);
    expect(screen.queryByText("원근 컷")).toBeNull();
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => { result.resolve(await value.read()); });
    expect(screen.getByText("원근 컷")).toBeTruthy();
  });

  it("선택 변경 즉시 이전 결과를 숨기며 더 늦게 도착한 이전 선택 응답도 노출하지 않는다", async () => {
    const first = host(actualSource(), "A"), second = host(undefined, "B");
    const late = deferred<StudioBg3dSkpSourceReadResult>();
    const read = vi.fn<StudioBg3dReadSkpSceneSource>().mockImplementationOnce(first.read).mockImplementationOnce(() => late.promise);
    const view = render(<StudioBg3dSkpSourceInfoPanel selection={first.selection} onReadSource={read} />);
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    await screen.findByText("원근 컷");
    fireEvent.click(screen.getByRole("button", { name: "원본 정보 새로 읽기" }));
    view.rerender(<StudioBg3dSkpSourceInfoPanel selection={second.selection} onReadSource={second.read} />);
    expect(screen.queryByText("원근 컷")).toBeNull();
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    await screen.findByTestId("bg3d-skp-source-legacy");
    await act(async () => { late.resolve(await first.read()); });
    expect(screen.getByTestId("bg3d-skp-source-legacy")).toBeTruthy();
    expect(screen.queryByText("원근 컷")).toBeNull();
    expect(screen.getByText("선택 모델: 선택 모델 B")).toBeTruthy();
  });

  it("unmount 뒤 끝나는 조회는 새 패널에 결과를 남기지 않는다", async () => {
    const value = host(actualSource());
    const late = deferred<StudioBg3dSkpSourceReadResult>();
    const view = render(<StudioBg3dSkpSourceInfoPanel selection={value.selection} onReadSource={() => late.promise} />);
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    view.unmount();
    render(<StudioBg3dSkpSourceInfoPanel selection={value.selection} onReadSource={value.read} />);
    await act(async () => { late.resolve(await value.read()); });
    expect(screen.queryByTestId("bg3d-skp-source-available")).toBeNull();
    expect(screen.getByRole("button", { name: "SKP 원본 정보 읽기" })).toBeTruthy();
  });

  it("예외를 성공으로 바꾸지 않으며 이후 조회를 다시 실행한다", async () => {
    const value = host(actualSource());
    const read = vi.fn<StudioBg3dReadSkpSceneSource>().mockRejectedValueOnce(new Error("private internal failure")).mockImplementation(value.read);
    render(<StudioBg3dSkpSourceInfoPanel selection={value.selection} onReadSource={read} />);
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    expect((await screen.findByRole("alert")).textContent).toContain("원본 정보를 읽지 못했습니다");
    expect(screen.queryByText("private internal failure")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "원본 정보 다시 읽기" }));
    await screen.findByText("원근 컷");
  });

  it("256개 카메라·512개 태그를 제한된 DOM에 표시하면서 검색과 페이지 이동으로 접근한다", async () => {
    const value = host(actualSource(true));
    render(<StudioBg3dSkpSourceInfoPanel selection={value.selection} onReadSource={value.read} />);
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    await screen.findByText("카메라 1");
    expect(screen.queryByText("카메라 21")).toBeNull();
    expect(screen.queryByText("카메라 256")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "카메라 다음 페이지" }));
    expect(screen.getByText("카메라 21")).toBeTruthy();
    expect(screen.queryByText("카메라 1")).toBeNull();
    fireEvent.change(screen.getByLabelText("카메라 이름 검색"), { target: { value: "카메라 256" } });
    expect(screen.getByText("카메라 256")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "태그 목록 · 512개" }));
    expect(screen.queryByText("태그 512")).toBeNull();
    fireEvent.change(screen.getByLabelText("태그 이름 검색"), { target: { value: "태그 512" } });
    expect(screen.getByText("태그 512")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("태그 이름 검색"), { target: { value: "존재하지 않는 태그" } });
    expect(screen.getByText("검색한 이름과 일치하는 기록이 없습니다.")).toBeTruthy();
  });

  it("검증된 SceneSource만 기존 helper로 내려받고 실패하면 같은 데이터로 재시도한다", async () => {
    const source = actualSource();
    const value = host(source);
    downloads.download.mockImplementationOnce(() => { throw new Error("download failure"); });
    render(<StudioBg3dSkpSourceInfoPanel selection={value.selection} onReadSource={value.read} />);
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    await screen.findByText("원근 컷");
    const button = screen.getByRole("button", { name: "검증된 원본 정보 JSON 내려받기" });
    fireEvent.click(button);
    expect((await screen.findByRole("alert")).textContent).toContain("JSON 다운로드를 시작하지 못했습니다");
    fireEvent.click(button);
    await screen.findByText("원본 정보 JSON 다운로드를 요청했습니다.");
    expect(downloads.download).toHaveBeenCalledTimes(2);
    const call = downloads.download.mock.calls[1];
    if (!call) throw new Error("다운로드 요청이 없습니다.");
    expect(call[1]).toBe("skp-source-information.json");
    const json = await blobText(call[0]);
    expect(JSON.parse(json)).toEqual(source);
    expect(json).not.toContain(value.selection.scopeKey);
    expect(json).not.toContain("선택 모델 A");
    expect(value.read).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
  });
});


describe("원본 정보의 평행 카메라 적용 UI", () => {
  it("동시에 시작한 JSON 다운로드를 카메라 적용이 무효화하거나 loading 상태에 남기지 않는다", async () => {
    const value = host(actualSource());
    const pending = deferred<import("./studio-bg3d-skp-camera-restore-types").StudioBg3dSkpCameraResult>();
    render(<StudioBg3dSkpSourceInfoPanel selection={value.selection} onReadSource={value.read} onApplyCamera={() => pending.promise} />);
    fireEvent.click(screen.getByRole("button", { name: "SKP 원본 정보 읽기" }));
    const camera = await screen.findByRole("button", { name: "이 평행 카메라 적용" });
    const download = screen.getByRole("button", { name: "검증된 원본 정보 JSON 내려받기" });
    fireEvent.click(download);
    fireEvent.click(camera);
    await waitFor(() => expect(downloads.download).toHaveBeenCalledTimes(1));
    expect(download).toHaveProperty("disabled", false);
    await act(async () => { pending.resolve({ ok: false, code: "commit-rejected", messageKo: "다시 적용하세요." }); });
    expect(screen.getByText("원본 정보 JSON 다운로드를 요청했습니다.")).toBeTruthy();
  });

  it("평행 Page에만 현재 선택 scope의 적용 명령을 보내고 실패를 재시도한다", async () => {
    const value = host(actualSource());
    const apply = vi.fn<import("./studio-bg3d-skp-camera-restore-types").StudioBg3dApplySkpSourceCamera>();
    apply.mockResolvedValueOnce({ ok: false, code: "commit-rejected", messageKo: "카메라 명령이 거부됐습니다." });
    apply.mockResolvedValueOnce({ ok: true, pageName: "평행 컷", camera: { position: [0, 12.7, 0], target: [0, 0, 0], fovDegrees: 50, projection: "orthographic", orthographicHeight: 3.6576 } });
    render(<StudioBg3dSkpSourceInfoPanel selection={value.selection} onReadSource={value.read} onApplyCamera={apply} />);
    fireEvent.click(screen.getByRole("button", { name: "SKP 원본 정보 읽기" }));
    const button = await screen.findByRole("button", { name: "이 평행 카메라 적용" });
    expect(screen.getAllByRole("button", { name: "이 평행 카메라 적용" })).toHaveLength(1);
    fireEvent.click(button);
    expect((await screen.findByRole("alert")).textContent).toContain("명령이 거부");
    const source = actualSource();
    const page = source.status === "available" ? source.manifest.pages.items.find((item) => item.parallel) : undefined;
    expect(apply).toHaveBeenLastCalledWith({ scopeKey: value.selection.scopeKey, pageKey: page?.key });
    fireEvent.click(button);
    await screen.findByText(/파서가 읽은 평행 카메라 ‘평행 컷’를 적용했습니다/);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(value.read).toHaveBeenCalledTimes(1);
  });

  it("편집 잠금 중에도 원본 조회는 허용하고 카메라 변경은 막는다", async () => {
    const value = host(actualSource());
    const apply = vi.fn<import("./studio-bg3d-skp-camera-restore-types").StudioBg3dApplySkpSourceCamera>();
    render(<StudioBg3dSkpSourceInfoPanel selection={value.selection} onReadSource={value.read} onApplyCamera={apply} cameraDisabled />);
    fireEvent.click(screen.getByRole("button", { name: "SKP 원본 정보 읽기" }));
    const button = await screen.findByRole("button", { name: "이 평행 카메라 적용" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(apply).not.toHaveBeenCalled();
    expect(value.read).toHaveBeenCalledTimes(1);
  });

  it("적용 중 중복 요청을 막고 선택이 바뀌면 이전 응답을 숨긴다", async () => {
    const a = host(actualSource(), "A"), b = host(actualSource(), "B");
    const pending = deferred<import("./studio-bg3d-skp-camera-restore-types").StudioBg3dSkpCameraResult>();
    const apply = vi.fn(() => pending.promise);
    const view = render(<StudioBg3dSkpSourceInfoPanel selection={a.selection} onReadSource={a.read} onApplyCamera={apply} />);
    fireEvent.click(screen.getByRole("button", { name: "SKP 원본 정보 읽기" }));
    fireEvent.click(await screen.findByRole("button", { name: "이 평행 카메라 적용" }));
    expect(screen.getByRole("button", { name: "평행 카메라 적용 중" })).toHaveProperty("disabled", true);
    expect(screen.getByTestId("bg3d-skp-source-read")).toHaveProperty("disabled", true);
    view.rerender(<StudioBg3dSkpSourceInfoPanel selection={b.selection} onReadSource={b.read} onApplyCamera={apply} />);
    await act(async () => { pending.resolve({ ok: false, code: "selection-changed", messageKo: "이전 적용 응답" }); });
    expect(screen.queryByText("이전 적용 응답")).toBeNull();
    expect(screen.queryByRole("button", { name: "이 평행 카메라 적용" })).toBeNull();
    expect(apply).toHaveBeenCalledTimes(1);
  });
});

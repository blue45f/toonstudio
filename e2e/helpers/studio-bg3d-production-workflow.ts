import { readFile } from "node:fs/promises";

import { expect, type Page, type TestInfo } from "@playwright/test";
import { unzipSync } from "fflate";

/** 현재 제품의 구도·컷·출력 경로를 기존 시각 검증의 동일 픽셀 판정으로 확인한다. */
export async function verifyStudioBg3dProductionWorkflow<Frame>(
  page: Page,
  testInfo: TestInfo,
  pixels: {
    readonly capture: () => Promise<Frame>;
    readonly changed: (before: Frame, label: string) => Promise<Frame>;
    readonly decode: (png: Uint8Array) => Promise<{
      readonly width: number;
      readonly height: number;
      readonly distinctColors: number;
    }>;
  },
): Promise<void> {
  const dialog = page.getByTestId("studio-bg3d-dialog");
  const empty = await pixels.capture();
  await dialog.getByRole("button", { name: "상자 추가", exact: true }).click();
  await pixels.changed(empty, "제작용 상자 추가");
  await dialog.getByTestId("bg3d-prosuite-quick-open").click();
  await expect(dialog.locator("#bg3d-view-tab-prosuite")).toHaveAttribute("aria-selected", "true");

  // 제거된 계산기 버튼 대신 같은 장면의 실제 바닥 충돌·자세 적용 경로를 검증한다.
  await dialog.getByRole("tab", { name: "물리 배치", exact: true }).click();
  const physics = dialog.getByTestId("bg3d-physics-panel");
  await physics.getByRole("button", { name: "2초", exact: true }).click();
  await physics.getByRole("checkbox", { name: /바닥 충돌/ }).check();
  await expect(physics.getByTestId("bg3d-physics-start")).toBeEnabled();
  await physics.getByTestId("bg3d-physics-start").click();
  await expect(dialog.getByRole("progressbar", { name: "물리 미리보기 진행률", exact: true }))
    .toHaveAttribute("aria-valuenow", "100", { timeout: 90_000 });
  await dialog.getByRole("button", { name: "현재 물리 자세를 장면에 적용", exact: true }).click();
  await expect(dialog.getByTestId("bg3d-physics-transport")).toBeHidden();
  await dialog.getByRole("tab", { name: "웹툰 프로 툴", exact: true }).click();

  const workbench = dialog.locator('[data-bg3d-production-workbench="true"]');
  const stages = workbench.getByRole("tablist", { name: "웹툰 컷 제작 단계", exact: true });
  await expect(stages.getByRole("tab")).toHaveText(["구도", "컷 디렉터", "원고 출력"]);
  const beforeLens = await pixels.capture();
  await workbench.getByRole("checkbox", { name: "피사체 크기를 유지하며 거리 조절", exact: true }).uncheck();
  const wideLens = workbench.getByRole("button", { name: /^넓은 공간 90°/ });
  await wideLens.click();
  await expect(wideLens).toHaveAttribute("aria-pressed", "true");
  await expect(workbench.getByLabel("현재 화각", { exact: true })).toHaveText("90.0°");
  const composed = await pixels.changed(beforeLens, "제작 구도 화각 적용");
  const lineArt = workbench.getByRole("button", { name: "선화 확인", exact: true });
  await lineArt.click();
  await expect(lineArt).toHaveAttribute("aria-pressed", "true");
  await pixels.changed(composed, "제작 선화 적용");

  await workbench.getByRole("button", { name: "이 구도를 컷으로 저장", exact: true }).click();
  await stages.getByRole("tab", { name: "컷 디렉터", exact: true }).click();
  const deck = workbench.getByRole("region", { name: "저장된 웹툰 컷 덱", exact: true });
  await expect(deck.getByRole("button", { name: / 삭제$/ })).toHaveCount(1);
  await deck.getByRole("button", { name: "이동", exact: true }).click();
  await stages.getByRole("tab", { name: "구도", exact: true }).click();
  await expect(workbench.getByLabel("현재 화각", { exact: true })).toHaveText("90.0°");
  await expect(lineArt).toHaveAttribute("aria-pressed", "true");

  await stages.getByRole("tab", { name: "원고 출력", exact: true }).click();
  const shots = workbench.getByRole("region", { name: "배치 출력 컷 선택", exact: true });
  await shots.getByRole("button", { name: "전체", exact: true }).click();
  await expect(shots.getByRole("checkbox")).toHaveCount(1);
  await expect(shots.getByRole("checkbox")).toBeChecked();
  const passes = workbench.getByRole("region", { name: "프로덕션 PNG 패스", exact: true });
  await expect(passes.getByRole("checkbox", { name: "원본 렌더", exact: true })).toBeAttached();
  for (const label of await passes.locator("label").all()) {
    const checkbox = label.getByRole("checkbox");
    const selected = (await label.innerText()).trim() === "원본 렌더";
    if (await checkbox.isChecked() !== selected) await label.click();
    await expect(checkbox).toBeChecked({ checked: selected });
  }
  await workbench.getByRole("combobox", { name: "최대 출력 높이", exact: true }).selectOption("640");
  await workbench.getByRole("checkbox", { name: /^컷별 레이어 PSD/ }).uncheck();
  await workbench.getByRole("checkbox", { name: /^컷 검수 콘택트 시트/ }).uncheck();
  const exportButton = workbench.getByRole("button", { name: "선택 1컷 · 1패스 ZIP", exact: true });
  await expect(exportButton).toBeEnabled();
  const controller = new AbortController();
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000, signal: controller.signal }),
      exportButton.click(),
    ]);
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toMatch(/\.zip$/u);
    const path = testInfo.outputPath("production-shot.zip");
    await download.saveAs(path);
    const entries = unzipSync(await readFile(path));
    const manifestBytes = entries["manifest.json"];
    expect(manifestBytes).toBeDefined();
    if (!manifestBytes) throw new Error("출력 ZIP에 manifest.json이 없습니다.");
    const manifest: unknown = JSON.parse(new TextDecoder().decode(manifestBytes));
    const pngPaths = Object.keys(entries).filter((name) => name.endsWith(".png"));
    expect(pngPaths).toEqual(["shots/001/beauty.png"]);
    const png = entries[pngPaths[0]];
    if (!png) throw new Error("출력 ZIP에 실제 렌더 PNG가 없습니다.");
    expect(Buffer.from(png.subarray(0, 8)).toString("hex")).toBe("89504e470d0a1a0a");
    const image = await pixels.decode(png);
    expect(image.width).toBeGreaterThan(200);
    expect(image.height).toBeGreaterThan(200);
    expect(image.height).toBeLessThanOrEqual(640);
    expect(image.distinctColors).toBeGreaterThan(1);
    expect(manifest).toMatchObject({
      kind: "toonstudio-bg3d-shot-batch",
      version: 3,
      producedPasses: ["beauty"],
      publicRenderPlan: {
        sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
        renderDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
        implementation: { graphicsApi: "webgl2" },
        passes: ["beauty"],
        artifactRequests: { layeredPsd: false, contactSheet: false },
      },
      artifacts: [expect.objectContaining({
        path: pngPaths[0], pass: "beauty", status: "completed", width: image.width, height: image.height,
      })],
    });
  } finally {
    controller.abort();
  }
}

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { STUDIO_CANVAS_WIDTH } from "../canvas/studio-canvas-constants";
import { parseStudioProjectFile } from "../studio-project-file";
import { readStudioZipArchive } from "../studio-zip-reader";

import { FixtureImage, WHITE } from "./panel-detect-fixtures";
import { fakeCanvasWorld, fixtureDrawable, noYield } from "./panel-detect-test-doubles";
import { createPanelImportRights } from "./panel-import-rights";
import { PanelRenderError } from "./panel-render-core";
import { buildReflowPngBundle, buildStudioDocumentFromReflow, reflowPageFileName, reflowReceiptFileText } from "./panel-reflow-output";
import { planPanelReflow } from "./panel-reflow-plan";

const RIGHTS = createPanelImportRights({
  confirmed: true,
  attestedAt: "2026-10-15T03:00:00.000Z",
  note: "작가 본인 원고",
  source: { fileName: "원고 12화.png", mimeType: "image/png", sizeBytes: 4096, width: 720, height: 600, sha256: "d".repeat(64) },
});

const PANELS = [
  { id: "a", x: 10, y: 10, width: 360, height: 200 },
  { id: "b", x: 10, y: 240, width: 360, height: 300 },
  { id: "c", x: 400, y: 10, width: 300, height: 400 },
] as const;

function setup(pageHeight = 8_000) {
  return {
    drawable: fixtureDrawable(new FixtureImage(720, 600, WHITE)),
    world: fakeCanvasWorld(),
    plan: planPanelReflow(PANELS, { targetWidth: 720, gap: 80, scaleMode: "fit-width", pageHeight }),
  };
}

describe("권리 확인 기록 파일", () => {
  it("동의 문구·원본·전체 SHA-256·메모와 한계 안내, 외부 전송 없음 문구를 담는다", () => {
    const text = reflowReceiptFileText(RIGHTS);
    expect(text).toContain('사용자가 "내가 권리를 가진 원고이거나 이용 허락을 받은 원고입니다"에 동의했어요 (2026-10-15).');
    expect(text).toContain("원본: 원고 12화.png (720×600px)");
    expect(text).toContain(`SHA-256: ${"d".repeat(64)}`);
    expect(text).toContain("메모: 작가 본인 원고");
    expect(text).toContain("법률 자문, 권리 인증, 제3자의 권리 보유 보증이 아니에요");
    expect(text).toContain("서버로 보내지 않았어요");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("메모가 없으면 메모 줄을 만들지 않는다", () => {
    const rights = createPanelImportRights({ confirmed: true, attestedAt: "2026-10-15T03:00:00.000Z", source: RIGHTS.source });
    expect(reflowReceiptFileText(rights)).not.toContain("메모:");
  });
});

describe("페이지 파일 이름", () => {
  it("순서가 곧 정렬 순서가 되도록 쪽수 자릿수(최소 2)에 맞춰 0 을 채운다", () => {
    expect(reflowPageFileName(0, 1)).toBe("strip-01.png");
    expect(reflowPageFileName(8, 12)).toBe("strip-09.png");
    expect(reflowPageFileName(9, 120)).toBe("strip-010.png");
    expect(reflowPageFileName(119, 120)).toBe("strip-120.png");
  });
});

describe("Studio 문서 만들기", () => {
  it("컷 이미지를 굽고 편집기가 읽는 프로젝트 파일을 돌려준다(진행률은 컷마다 한 번)", async () => {
    const { drawable, world, plan } = setup();
    const progress: number[] = [];
    let counter = 0;
    const output = await buildStudioDocumentFromReflow({
      plan,
      source: drawable,
      deps: world.deps,
      rights: RIGHTS,
      title: "12화 컷",
      background: "#ffffff",
      onProgress: (done) => progress.push(done),
      yieldNow: noYield,
      makeId: () => `id-${(counter += 1)}`,
      now: () => new Date("2026-10-15T04:00:00.000Z"),
    });
    expect(progress).toEqual([1, 2, 3]);
    expect(output.file.name).toBe("12화 컷-panels.json");
    expect(output.file.type).toBe("application/json");
    const parsed = parseStudioProjectFile(JSON.parse(await output.file.text()));
    expect(parsed.title).toBe("12화 컷");
    expect(parsed.pagesList.flatMap((page) => page.elements)).toHaveLength(6);
    expect(world.surfaces).toHaveLength(3);
    expect(world.surfaces.every((surface) => surface.disposed && surface.fills[0] === "#ffffff")).toBe(true);
    // 원본은 읽기만 하고 닫지 않는다(해제는 호출자의 일).
    expect(drawable.closed).toBe(false);
    for (const page of output.project.pagesList) {
      for (const element of page.elements) expect(element.x + element.width).toBeLessThanOrEqual(STUDIO_CANVAS_WIDTH);
    }
  });

  it("취소 신호가 켜지면 문서를 만들지 않고 그림면을 모두 정리한다", async () => {
    const { drawable, world, plan } = setup();
    const controller = new AbortController();
    const pending = buildStudioDocumentFromReflow({
      plan,
      source: drawable,
      deps: world.deps,
      rights: RIGHTS,
      title: "취소",
      background: "#ffffff",
      signal: controller.signal,
      yieldNow: noYield,
      makeId: () => "x",
      now: () => new Date("2026-10-15T04:00:00.000Z"),
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    expect(world.surfaces.every((surface) => surface.disposed)).toBe(true);
  });

  it("그림면을 만들 수 없으면 몇 번째인지 담은 오류로 끝난다", async () => {
    const { drawable, plan } = setup();
    const world = fakeCanvasWorld({ refuse: () => true });
    await expect(buildStudioDocumentFromReflow({
      plan,
      source: drawable,
      deps: world.deps,
      rights: RIGHTS,
      title: "큰 이미지",
      background: "#ffffff",
      yieldNow: noYield,
      makeId: () => "x",
      now: () => new Date("2026-10-15T04:00:00.000Z"),
    })).rejects.toBeInstanceOf(PanelRenderError);
  });
});

describe("PNG 묶음 만들기", () => {
  it("페이지마다 PNG 와 권리 확인 기록을 담은 ZIP 을 만들고 다시 읽어도 같다", async () => {
    const { drawable, world, plan } = setup(500);
    expect(plan.pages.length).toBeGreaterThan(1);
    const result = await buildReflowPngBundle({
      plan,
      source: drawable,
      deps: world.deps,
      rights: RIGHTS,
      title: "12화",
      background: "#ffffff",
      yieldNow: noYield,
      now: () => new Date("2026-10-15T04:00:00.000Z"),
      crc32ExecutionMode: "direct-bounded",
    });
    expect(result.fileName).toBe("12화-strip-bundle.zip");
    const archive = await readStudioZipArchive(result.blob);
    expect(archive.entries.map((entry) => entry.path)).toEqual([
      "manifest.json",
      ...plan.pages.map((page) => `files/${reflowPageFileName(page.index, plan.pages.length)}`),
      "files/rights-receipt.txt",
    ]);
    const receipt = new TextDecoder().decode(await archive.readEntry("files/rights-receipt.txt"));
    expect(receipt).toBe(reflowReceiptFileText(RIGHTS));
    expect(result.manifest.fileCount).toBe(plan.pages.length + 1);
    expect(world.surfaces).toHaveLength(plan.pages.length);
  });
});

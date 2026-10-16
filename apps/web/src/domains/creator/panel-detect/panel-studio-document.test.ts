import { afterEach, describe, expect, it } from "vitest";

import { STUDIO_CANVAS_WIDTH } from "../canvas/studio-canvas-constants";
import { projectStudioAssetRightsUsages } from "../studio-asset-rights-projection";
import {
  STUDIO_IMPORT_HANDOFF_QUERY_KEY,
  clearStudioImportHandoffsForTests,
  consumeStudioImportHandoff,
} from "../studio-import-handoff";
import { hasStudioLinked3dPassProjectArchiveReferences } from "../studio-linked-3d-pass-project-archive";
import { parseStudioProjectDocument } from "../studio-project-document";
import { parseStudioProjectFile } from "../studio-project-file";
import { auditStudioVrmTexturePaintJsonImport } from "../vrm/studio-vrm-texture-paint-project-library";

import { createPanelImportRights } from "./panel-import-rights";
import { planPanelReflow } from "./panel-reflow-plan";
import {
  PanelStudioDocumentError,
  buildPanelStudioProject,
  panelStudioBackground,
  panelStudioFitsCanvas,
  panelStudioTitleFromFileName,
} from "./panel-studio-document";
import {
  PanelStudioHandoffError,
  createPanelStudioProjectFile,
  registerPanelStudioHandoff,
} from "./panel-studio-handoff";

const RIGHTS = createPanelImportRights({
  confirmed: true,
  attestedAt: "2026-10-15T03:00:00.000Z",
  note: "작가 본인 원고",
  source: { fileName: "원고 12화.png", mimeType: "image/png", sizeBytes: 4096, width: 800, height: 1200, sha256: "a".repeat(64) },
});

const PANELS = [
  { id: "p1", x: 0, y: 0, width: 400, height: 300 },
  { id: "p2", x: 400, y: 0, width: 400, height: 500 },
  { id: "p3", x: 0, y: 520, width: 800, height: 600 },
] as const;

let counter = 0;
const makeId = (): string => `id-${(counter += 1)}`;

function build(width: 690 | 720 = 720, pageHeight = 8_000) {
  counter = 0;
  const plan = planPanelReflow(PANELS, { targetWidth: width, gap: 80, scaleMode: "fit-width", pageHeight });
  const sources = new Map(PANELS.map((panel) => [panel.id, `data:image/png;base64,${panel.id}`] as const));
  return {
    plan,
    project: buildPanelStudioProject({
      plan,
      sources,
      rights: RIGHTS,
      title: "12화 컷 배열",
      background: "#ffffff",
      savedAt: "2026-10-15T04:00:00.000Z",
      makeId,
    }),
  };
}

afterEach(() => {
  clearStudioImportHandoffsForTests();
});

describe("Studio 문서 만들기", () => {
  it("계획의 페이지마다 컷 프레임(아래)과 컷 이미지(위)를 같은 위치에 둔다", () => {
    const { plan, project } = build(690, 900);
    expect(project.pagesList).toHaveLength(plan.pages.length);
    expect(plan.pages.length).toBeGreaterThan(1);
    expect(project.currentPageId).toBe(project.pagesList[0].id);
    project.pagesList.forEach((page, pageIndex) => {
      const planned = plan.pages[pageIndex];
      expect(page.canvasH).toBe(planned.height);
      expect(page.bg).toBe("#ffffff");
      expect(page.elements.map((element) => element.type)).toEqual(planned.placements.flatMap(() => ["frame", "image"]));
      planned.placements.forEach((placement, index) => {
        const [frame, image] = page.elements.slice(index * 2, index * 2 + 2);
        const x = plan.documentOffsetX + placement.dest.x;
        for (const element of [frame, image]) {
          expect({ x: element.x, y: element.y, width: element.width, height: element.height })
            .toEqual({ x, y: placement.dest.y, width: placement.dest.width, height: placement.dest.height });
        }
        expect(image.type === "image" ? image.src : "").toBe(`data:image/png;base64,${placement.panelId}`);
        expect(image.name).toBe(`컷 ${placement.order}`);
        expect(frame.name).toBe(`컷 ${placement.order} 프레임`);
      });
    });
    expect(plan.documentOffsetX).toBe(15);
    expect(panelStudioFitsCanvas(project)).toBe(true);
  });

  it("모든 요소와 페이지 id 는 호출자가 준 생성기로 만든 서로 다른 값이다", () => {
    const { project } = build();
    const ids = project.pagesList.flatMap((page) => [page.id, ...page.elements.map((element) => element.id)]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^id-\d+$/u.test(id))).toBe(true);
  });

  it("제목·설명(원본 영수증)·간격을 문서에 남기고, 모든 컷 이미지에 같은 권리 기록을 붙인다", () => {
    const { project } = build();
    expect(project.title).toBe("12화 컷 배열");
    expect(project.panelGutter).toBe(80);
    expect(project.description).toContain("원고 12화.png");
    expect(project.description).toContain("사용자 권리 확인 2026-10-15");
    expect(project.description).toContain("작가 본인 원고");
    const images = project.pagesList.flatMap((page) => page.elements).filter((element) => element.type === "image");
    expect(images).toHaveLength(3);
    for (const image of images) expect(image.type === "image" ? image.sourceRights : null).toBe(RIGHTS);
  });

  it("편집기가 읽는 프로젝트 파일 형식(parseStudioProjectFile)을 그대로 통과하고 권리 기록이 보존된다", () => {
    const { project } = build();
    const parsed = parseStudioProjectFile(JSON.parse(JSON.stringify(project)));
    expect(parsed.pagesList).toHaveLength(project.pagesList.length);
    expect(parsed.title).toBe("12화 컷 배열");
    const elements = parsed.pagesList.flatMap((page) => page.elements);
    const preserved = elements.filter((element): element is { type: "image"; sourceRights: unknown } => (
      typeof element === "object" && element !== null && "type" in element && element.type === "image" && "sourceRights" in element
    ));
    expect(preserved).toHaveLength(3);
  });

  it("기존 권리 명세 투영이 컷 이미지를 '사용자 확인' 사용권의 한 자산으로 묶는다", () => {
    const { project } = build();
    const usages = projectStudioAssetRightsUsages(project.pagesList.map((page) => ({ id: page.id, elements: page.elements })));
    expect(usages).toHaveLength(3);
    expect(new Set(usages.map((usage) => usage.assetId)).size).toBe(1);
    expect(usages.every((usage) => usage.licenseId === "custom" && usage.assetId === `panel-import:${"a".repeat(24)}`)).toBe(true);
  });

  it("컷 이미지가 빠졌거나 제목·바탕색이 잘못되면 만들지 않는다", () => {
    const plan = planPanelReflow(PANELS, { targetWidth: 720, gap: 80, scaleMode: "fit-width" });
    const base = { plan, rights: RIGHTS, title: "제목", background: "#ffffff", savedAt: "2026-10-15T04:00:00.000Z", makeId };
    expect(() => buildPanelStudioProject({ ...base, sources: new Map([["p1", "data:image/png;base64,x"]]) })).toThrowError(
      expect.objectContaining({ code: "missing-cut-image" }),
    );
    const sources = new Map(PANELS.map((panel) => [panel.id, "data:image/png;base64,x"] as const));
    expect(() => buildPanelStudioProject({ ...base, sources, background: "white" })).toThrow(PanelStudioDocumentError);
    expect(() => buildPanelStudioProject({ ...base, sources, title: "   " })).toThrowError(expect.objectContaining({ code: "invalid-title" }));
  });

  it("파일 이름에서 제목을 만들고 여백색에서 바탕색을 만든다", () => {
    expect(panelStudioTitleFromFileName("원고 12화.final.png")).toBe("원고 12화.final");
    expect(panelStudioTitleFromFileName("a\u0007b.png")).toBe("a b");
    expect(panelStudioTitleFromFileName(".png")).toBe("가져온 원고");
    expect(panelStudioTitleFromFileName("", "대체")).toBe("대체");
    expect(panelStudioBackground({ r: 255, g: 0, b: 16 })).toBe("#ff0010");
    expect(panelStudioBackground({ r: 300, g: -4, b: 8.6 })).toBe("#ff0009");
    expect(panelStudioBackground(null)).toBe("#ffffff");
  });

  it("문서 폭을 벗어나는 요소는 감지한다", () => {
    const { project } = build();
    const widened = { ...project, pagesList: [{ ...project.pagesList[0], elements: [{ ...project.pagesList[0].elements[0], width: STUDIO_CANVAS_WIDTH + 1 }] }] };
    expect(panelStudioFitsCanvas(widened)).toBe(false);
  });
});

describe("편집기로 넘기기", () => {
  it("프로젝트 JSON 파일을 만들고 단일 사용 전달표에 등록해 가져오기 주소를 돌려준다", async () => {
    const { project } = build();
    const file = createPanelStudioProjectFile(project);
    expect(file.name).toBe("12화 컷 배열-panels.json");
    expect(file.type).toBe("application/json");
    expect(JSON.parse(await file.text())).toEqual(JSON.parse(JSON.stringify(project)));
    // 편집기의 프로젝트 JSON 가져오기가 실제로 호출하는 파서가 이 파일을 그대로 받아들인다.
    const loaded = await parseStudioProjectDocument(await file.text());
    expect(loaded.source).toBe("legacy-project");
    expect(loaded.project.pagesList).toHaveLength(project.pagesList.length);
    // 편집기가 문서를 받은 뒤에도 컷 이미지마다 권리 확인 기록이 남아 있어야 이후 저장·권리 명세에서 쓸 수 있다.
    const loadedRights = loaded.project.pagesList.flatMap((page) => page.elements).flatMap((element) => (
      typeof element === "object" && element !== null && "type" in element && element.type === "image" && "sourceRights" in element
        ? [element.sourceRights]
        : []
    ));
    expect(loadedRights).toHaveLength(3);
    for (const entry of loadedRights) expect(entry).toEqual(RIGHTS);

    // 편집기의 프로젝트 JSON 가져오기(handleImportProject)는 문서를 적용하기 전에 두 가지를 더 점검한다.
    // 이 문서는 연결형 3D pass 도 VRM 표면 페인팅 참조도 없으므로 둘 다 조용히 통과해야 한다.
    expect(hasStudioLinked3dPassProjectArchiveReferences(loaded.project)).toBe(false);
    expect((await auditStudioVrmTexturePaintJsonImport(loaded.project)).notice).toBeNull();

    const { handoff, href } = registerPanelStudioHandoff(file);
    expect(handoff.target).toBe("project-json");
    expect(href).toBe(`/studio/canvas?${STUDIO_IMPORT_HANDOFF_QUERY_KEY}=${handoff.token}`);
    expect(consumeStudioImportHandoff(handoff.token)?.file).toBe(file);
    expect(consumeStudioImportHandoff(handoff.token)).toBeNull();
  });

  it("너무 큰 문서와 등록 실패는 이유가 담긴 오류로 끝난다", () => {
    const { project } = build();
    expect(() => createPanelStudioProjectFile(project, 10)).toThrowError(expect.objectContaining({ code: "too-large" }));
    expect(() => registerPanelStudioHandoff(new File([], "empty.json"))).toThrow(PanelStudioHandoffError);
  });
});

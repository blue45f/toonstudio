// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { createStudioProjectWithInitialDocument } from "../studio-project-creation";
import { archiveStudioProjectDocument, createStudioProjectDocument } from "../studio-project-document-store";
import { archiveStudioProject } from "../studio-project-library-store";
import { createInitialStudioProjectPlanning, studioPlanningStorageKey, writeStudioProjectPlanning } from "./studio-planning-store";
import { readStudioEpisodeDocumentHandoff, readStudioEpisodeDocumentTargets, selectStudioEpisodeDocumentTarget, studioEpisodeDocumentHref, studioEpisodePlanHandoffBeats } from "./studio-episode-document-handoff";

beforeEach(() => localStorage.clear());

describe("기존 문서의 회차 이동 계약", () => {
  it("다른 프로젝트의 문서를 후보에 넣지 않고 복수 원고에는 명시 선택을 요구한다", () => {
    const first = createStudioProjectWithInitialDocument(localStorage, { title: "첫 작품", kind: "webtoon" });
    const other = createStudioProjectWithInitialDocument(localStorage, { title: "다른 작품", kind: "webtoon" });
    createStudioProjectDocument(localStorage, first.project.id, { title: "새 원고", kind: "webtoon" });
    const targets = readStudioEpisodeDocumentTargets(localStorage, first.project.id);
    expect(targets.documents).toHaveLength(2);
    expect(targets.documents.every((document) => document.projectId === first.project.id)).toBe(true);
    expect(targets.documents.some((document) => document.id === other.document.id)).toBe(false);
    expect(selectStudioEpisodeDocumentTarget(targets.documents)).toBeNull();
    expect(selectStudioEpisodeDocumentTarget(targets.documents, first.document.id)?.id).toBe(first.document.id);
  });

  it("명시 선택 문서가 보관되면 다른 원고로 바꾸지 않는다", () => {
    const first = createStudioProjectWithInitialDocument(localStorage, { title: "작품", kind: "webtoon" });
    const second = createStudioProjectDocument(localStorage, first.project.id, { title: "원고 2", kind: "webtoon" });
    archiveStudioProjectDocument(localStorage, first.project.id, second.id);
    const targets = readStudioEpisodeDocumentTargets(localStorage, first.project.id);
    expect(selectStudioEpisodeDocumentTarget(targets.documents, second.id)).toBeNull();
    expect(studioEpisodeDocumentHref({ ...second, status: "archived" }, "ep-1", "art")).toBeNull();
  });

  it("콘티→작화에서 같은 문서·회차와 협업/언어/포커스 쿼리를 유지한다", () => {
    const { project, document } = createStudioProjectWithInitialDocument(localStorage, { title: "작품", kind: "webtoon" });
    const storyboard = studioEpisodeDocumentHref(document, `${project.id}:episode-1`, "storyboard");
    if (!storyboard) throw new Error("원고 연결이 필요합니다.");
    const art = studioEpisodeDocumentHref(document, `${project.id}:episode-1`, "art", `${new URL(storyboard, "https://example.test").search}&room=team&language=ko&focus=canvas`);
    if (!art) throw new Error("작화 연결이 필요합니다.");
    const route = new URL(art, "https://example.test");
    expect(route.pathname).toBe(`/studio/p/${project.id}/d/${document.id}`);
    expect(Object.fromEntries(route.searchParams)).toMatchObject({ episode: `${project.id}:episode-1`, workspace: "draw", room: "team", language: "ko", focus: "canvas" });
  });

  it("콜론·한글 회차 ID에서 기존 시딩 계약으로 여섯 샷 초안을 만들고 기획은 바꾸지 않는다", () => {
    const plan = createInitialStudioProjectPlanning("한글-작품").plans[0];
    if (!plan) throw new Error("회차 기획이 필요합니다.");
    const source = { ...plan, turningPoints: ["발견", "이름", "추적", "대면", "수선", "귀가"] };
    const before = JSON.stringify(source);
    const beats = studioEpisodePlanHandoffBeats(source);
    expect(beats).toHaveLength(6);
    expect(beats.every((beat) => beat.episodeId === plan.episodeId)).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("보관된 프로젝트는 신규 회차 인계 후보에 넣지 않고 원고는 삭제하지 않는다", () => {
    const { project, document } = createStudioProjectWithInitialDocument(localStorage, { title: "작품", kind: "webtoon" });
    archiveStudioProject(localStorage, project.id);
    expect(readStudioEpisodeDocumentTargets(localStorage, project.id).documents).toEqual([]);
    expect(localStorage.getItem(`toonspectrum:studio-project-documents:v1:${encodeURIComponent(project.id)}`)).toContain(document.id);
  });

  it.each([
    { projectId: "다른-작품" }, { seasonId: "다른-시즌" }, { status: "archived" },
    { status: "superseded" }, { openingHook: null }, { turningPoints: [1] },
    { characterRefs: null }, { locationRefs: [42] },
  ])("소속·상태·시딩 필드가 잘못된 회차를 거절하고 원본을 바꾸지 않는다: %j", (patch) => {
    const { project, document } = createStudioProjectWithInitialDocument(localStorage, { title: "작품", kind: "webtoon" });
    const planning = createInitialStudioProjectPlanning(project.id);
    const plan = planning.plans[0];
    if (!plan) throw new Error("회차 기획이 필요합니다.");
    const raw = JSON.stringify({ ...planning, plans: [{ ...plan, ...patch }] });
    localStorage.setItem(studioPlanningStorageKey(project.id), raw);
    expect(readStudioEpisodeDocumentHandoff(localStorage, project.id, document.id, `?episode=${encodeURIComponent(plan.episodeId)}`)).toBeNull();
    expect(localStorage.getItem(studioPlanningStorageKey(project.id))).toBe(raw);
  });

  it("중복 회차 ID나 중복 episode 쿼리를 임의 첫 항목으로 해석하지 않는다", () => {
    const { project, document } = createStudioProjectWithInitialDocument(localStorage, { title: "작품", kind: "webtoon" });
    const planning = createInitialStudioProjectPlanning(project.id);
    const plan = planning.plans[0];
    if (!plan) throw new Error("회차 기획이 필요합니다.");
    writeStudioProjectPlanning(localStorage, { ...planning, plans: [plan, { ...plan, id: "다른-기획" }] });
    const search = `?episode=${encodeURIComponent(plan.episodeId)}`;
    expect(readStudioEpisodeDocumentHandoff(localStorage, project.id, document.id, search)).toBeNull();
    writeStudioProjectPlanning(localStorage, planning);
    expect(readStudioEpisodeDocumentHandoff(localStorage, project.id, document.id, `${search}&episode=${encodeURIComponent(plan.episodeId)}`)).toBeNull();
  });
});

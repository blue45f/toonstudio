// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadPromoDraft, savePromoDraft } from "./promo-draft";
import { emptyPromoProject, promoFrameCount } from "./promo-model";

import type { PromoPanel, PromoProject, PromoSeconds } from "./promo-model";

/*
 * 저장된 초안(IndexedDB) 역호환 — 10초가 추가되기 전에 저장된 15·30·60초 초안이 그대로 복원되고,
 * 새 10초 초안은 저장·복원되며, 알 수 없는 길이의 손상된 초안은 복원하지 않는다는 것을 실제 저장소 경로로 확인한다.
 * 저장소 이름과 구조(toonstudio-promo-drafts / drafts / current)는 promo-draft.ts가 정한 값이다.
 */
const image = "data:image/png;base64,aGVsbG8=";
const panel = (id: string, caption: string): PromoPanel => ({ id, src: image, description: "", caption, motion: "push-in", fit: "contain", weight: 1 });

/** 10초 지원 이전 버전이 저장하던 프로젝트 JSON(고정 예시). */
function legacyProject(seconds: 15 | 30 | 60): Record<string, unknown> {
  return {
    version: 1, title: "예전 저장본", synopsis: "", cta: "지금 첫 화를 만나보세요", ratio: "9:16", seconds, style: "cinematic",
    panels: [panel("legacy-1", "예전 자막")], audio: null,
  };
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
/** 저장소에 draft를 직접 써 넣는다 — 앱이 쓰던 모양 그대로(예전 버전이 만든 저장본을 흉내 낸다). */
async function seed(project: unknown, revision = 4): Promise<void> {
  const open = indexedDB.open("toonstudio-promo-drafts", 1);
  open.onupgradeneeded = () => { open.result.createObjectStore("drafts"); };
  const db = await request(open);
  try {
    const tx = db.transaction("drafts", "readwrite");
    await request(tx.objectStore("drafts").put({ project, revision, updatedAt: 1_700_000_000_000 }, "current"));
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); });
  } finally {
    db.close();
  }
}

function shortProject(count: number, seconds: PromoSeconds = 10): PromoProject {
  return { ...emptyPromoProject(), title: "쇼츠", seconds, panels: Array.from({ length: count }, (_, index) => panel(`cut-${index}`, `자막 ${index + 1}`)) };
}

beforeEach(() => {
  // 팩토리를 갈아끼우면 모듈이 새 팩토리로 다시 연다 — 테스트 간 격리.
  vi.stubGlobal("indexedDB", new IDBFactory());
});

describe("저장된 초안 역호환", () => {
  it("10초 지원 이전에 저장한 15·30·60초 초안은 값 변화 없이 그대로 복원된다", async () => {
    for (const seconds of [15, 30, 60] as const) {
      vi.stubGlobal("indexedDB", new IDBFactory());
      await seed(legacyProject(seconds), 7);
      const draft = await loadPromoDraft();
      expect(draft?.revision).toBe(7);
      expect(draft?.project.seconds).toBe(seconds);
      expect(draft?.project.panels.map((value) => value.caption)).toEqual(["예전 자막"]);
      expect(JSON.parse(JSON.stringify(draft?.project))).toEqual(legacyProject(seconds));
      expect(draft ? promoFrameCount(draft.project) : 0).toBe(seconds * 30);
    }
  });

  it("저장된 초안이 없으면 null이다", async () => {
    await expect(loadPromoDraft()).resolves.toBeNull();
  });

  it("10초 초안은 저장하고 다시 복원하면 같고, 저장 버전이 오른다", async () => {
    const project = shortProject(5);
    await expect(savePromoDraft(project, 0)).resolves.toBe(1);
    const draft = await loadPromoDraft();
    expect(draft?.revision).toBe(1);
    expect(draft?.project).toEqual(project);
    expect(draft?.project.seconds).toBe(10);
    await expect(savePromoDraft({ ...project, title: "고침" }, 1)).resolves.toBe(2);
    expect((await loadPromoDraft())?.project.title).toBe("고침");
  });

  it("다른 탭이 먼저 저장했다면 10초 초안도 덮어쓰지 않고 거절한다(기존 비교-교체 규칙)", async () => {
    await savePromoDraft(shortProject(2), 0);
    await expect(savePromoDraft(shortProject(3), 0)).rejects.toThrow("다른 탭");
    expect((await loadPromoDraft())?.project.panels).toHaveLength(2);
  });

  it("15초 초안을 10초로 바꿔 저장해도 컷 수가 6개 이하이면 복원된다", async () => {
    await seed(legacyProject(15), 2);
    const loaded = await loadPromoDraft();
    expect(loaded).not.toBeNull();
    if (!loaded) return;
    await savePromoDraft({ ...loaded.project, seconds: 10 }, loaded.revision);
    const next = await loadPromoDraft();
    expect(next?.project.seconds).toBe(10);
    expect(next?.revision).toBe(3);
  });

  it("알 수 없는 길이의 초안은 복원하지 않고 이유를 알린다", async () => {
    for (const seconds of [12, 20, 61, "10", null]) {
      vi.stubGlobal("indexedDB", new IDBFactory());
      await seed({ ...legacyProject(15), seconds });
      await expect(loadPromoDraft()).rejects.toThrow();
    }
  });

  it("10초 초안에 컷이 7개 이상 들어 있으면 복원하지 않는다", async () => {
    await seed(shortProject(7));
    await expect(loadPromoDraft()).rejects.toThrow("6개까지");
  });

  it("저장 단계에서도 같은 규칙으로 막아 저장소를 바꾸지 않는다", async () => {
    await expect(savePromoDraft(shortProject(7), 0)).rejects.toThrow();
    await expect(loadPromoDraft()).resolves.toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  EMPTY_STORYWORLD_UNIVERSE_REGISTRY as EMPTY,
  STORYWORLD_SHARED_ELEMENT_KINDS,
  addStoryworldSharedElement,
  buildStoryworldUniverseMatrix,
  buildStoryworldUniverseMatrixByKind,
  createStoryworldUniverse,
  currentWorkSharedStatus,
  deleteStoryworldUniverse,
  designateStoryworldLoreUsage,
  designateStoryworldSharedUsage,
  isStoryworldSharedElementKind,
  joinStoryworldUniverse,
  leaveStoryworldUniverse,
  parseStoryworldUniverseRegistry,
  removeStoryworldSharedElement,
  revokeStoryworldLoreUsage,
  revokeStoryworldSharedUsage,
  updateStoryworldSharedElement,
  updateStoryworldUniverse,
  type StoryworldUniverseRegistry,
} from "./studio-storyworld-universe";

const NOW = "2026-10-06T00:00:00.000Z";
const SCOPE_A = "toonspectrum:storyworld-lab:v1:work:work-a";
const SCOPE_B = "toonspectrum:storyworld-lab:v1:work:work-b";

function registryWithUniverse(): { registry: StoryworldUniverseRegistry; universeId: string } {
  const created = createStoryworldUniverse(EMPTY, "아르카나 유니버스", NOW);
  return { registry: created.registry, universeId: created.id };
}

function joined(registry: StoryworldUniverseRegistry, universeId: string): StoryworldUniverseRegistry {
  let next = joinStoryworldUniverse(registry, universeId, {
    scopeKey: SCOPE_A, projectId: "proj-a", title: "작품 A", joinedAtIso: NOW,
  }, NOW);
  next = joinStoryworldUniverse(next, universeId, {
    scopeKey: SCOPE_B, projectId: "proj-b", title: "작품 B", joinedAtIso: NOW,
  }, NOW);
  return next;
}

describe("storyworld universe — 멤버 관리", () => {
  it("유니버스를 만들고 작품을 멤버로 넣으면 제목 스냅샷이 남는다", () => {
    const { registry, universeId } = registryWithUniverse();
    const next = joined(registry, universeId);
    const universe = next.universes[0];
    expect(universe?.members.map((member) => member.scopeKey)).toEqual([SCOPE_A, SCOPE_B]);
    expect(universe?.members[0]?.title).toBe("작품 A");
    // 재가입은 중복 행이 아니라 스냅샷 갱신이다.
    const rejoined = joinStoryworldUniverse(next, universeId, {
      scopeKey: SCOPE_A, projectId: "proj-a", title: "작품 A 개정판", joinedAtIso: NOW,
    }, NOW);
    expect(rejoined.universes[0]?.members).toHaveLength(2);
    expect(rejoined.universes[0]?.members[0]?.title).toBe("작품 A 개정판");
  });

  it("멤버 제외는 그 작품의 사용 지정까지 함께 거둔다", () => {
    const { registry, universeId } = registryWithUniverse();
    let next = joined(registry, universeId);
    const added = addStoryworldSharedElement(next, universeId, "character", "공유 주인공", NOW);
    next = added.registry;
    next = designateStoryworldSharedUsage(next, universeId, added.id!, {
      scopeKey: SCOPE_A, elementId: "hero-a", elementLabel: "A의 주인공", designatedAtIso: NOW,
    }, NOW);
    next = leaveStoryworldUniverse(next, universeId, SCOPE_A, NOW);
    const universe = next.universes[0];
    expect(universe?.members.map((member) => member.scopeKey)).toEqual([SCOPE_B]);
    expect(universe?.sharedElements[0]?.usages).toEqual([]);
  });
});

describe("storyworld universe — 공유 요소와 명시 지정", () => {
  it("공유 요소를 정의하고 멤버 작품의 로컬 요소를 지정·해제한다", () => {
    const { registry, universeId } = registryWithUniverse();
    let next = joined(registry, universeId);
    const added = addStoryworldSharedElement(next, universeId, "location", "기억 시장", NOW);
    next = added.registry;
    next = designateStoryworldSharedUsage(next, universeId, added.id!, {
      scopeKey: SCOPE_A, elementId: "memory-market", elementLabel: "기억 시장", designatedAtIso: NOW,
    }, NOW);
    const element = next.universes[0]?.sharedElements[0];
    expect(element?.usages).toHaveLength(1);
    // 같은 작품·같은 로컬 요소 재지정은 교체다.
    next = designateStoryworldSharedUsage(next, universeId, added.id!, {
      scopeKey: SCOPE_A, elementId: "memory-market", elementLabel: "기억 시장(본점)", designatedAtIso: NOW,
    }, NOW);
    expect(next.universes[0]?.sharedElements[0]?.usages).toHaveLength(1);
    expect(next.universes[0]?.sharedElements[0]?.usages[0]?.elementLabel).toBe("기억 시장(본점)");
    next = revokeStoryworldSharedUsage(next, universeId, added.id!, SCOPE_A, "memory-market", NOW);
    expect(next.universes[0]?.sharedElements[0]?.usages).toEqual([]);
  });

  it("멤버가 아닌 작품의 지정은 거부한다 (자동·우회 연결 없음)", () => {
    const { registry, universeId } = registryWithUniverse();
    const added = addStoryworldSharedElement(registry, universeId, "fact", "공유 사실", NOW);
    const attempted = designateStoryworldSharedUsage(added.registry, universeId, added.id!, {
      scopeKey: "toonspectrum:storyworld-lab:v1:work:stranger", elementId: "x", elementLabel: "x", designatedAtIso: NOW,
    }, NOW);
    expect(attempted.universes[0]?.sharedElements[0]?.usages).toEqual([]);
  });

  it("사용 행렬은 멤버별로 사용/미사용을 보여 준다", () => {
    const { registry, universeId } = registryWithUniverse();
    let next = joined(registry, universeId);
    const added = addStoryworldSharedElement(next, universeId, "character", "공유 악역", NOW);
    next = added.registry;
    next = designateStoryworldSharedUsage(next, universeId, added.id!, {
      scopeKey: SCOPE_B, elementId: "villain-b", elementLabel: "B의 악역", designatedAtIso: NOW,
    }, NOW);
    const matrix = buildStoryworldUniverseMatrix(next.universes[0]!);
    expect(matrix[0]?.cells.map((cell) => cell.usage?.elementId ?? null)).toEqual([null, "villain-b"]);
  });

  it("현재 작품 상태는 지정한 로컬 요소의 실재 여부를 라이브로 판정한다", () => {
    const { registry, universeId } = registryWithUniverse();
    let next = joined(registry, universeId);
    const added = addStoryworldSharedElement(next, universeId, "character", "공유 주인공", NOW);
    next = added.registry;
    next = designateStoryworldSharedUsage(next, universeId, added.id!, {
      scopeKey: SCOPE_A, elementId: "hero-a", elementLabel: "A의 주인공", designatedAtIso: NOW,
    }, NOW);
    const alive = currentWorkSharedStatus(next.universes[0]!, SCOPE_A, new Set(["hero-a"]), "character");
    expect(alive[0]?.localElementAlive).toBe(true);
    const gone = currentWorkSharedStatus(next.universes[0]!, SCOPE_A, new Set<string>(), "character");
    expect(gone[0]?.localElementAlive).toBe(false);
  });

  it("공유 요소 설정 수정·삭제와 유니버스 정보 수정·삭제가 동작한다", () => {
    const { registry, universeId } = registryWithUniverse();
    const added = addStoryworldSharedElement(registry, universeId, "fact", "원초 설정", NOW);
    let next = updateStoryworldSharedElement(added.registry, universeId, added.id!, {
      name: "세계의 규칙", description: "모든 작품 공통", tags: ["규칙", " 규칙 "],
    }, NOW);
    expect(next.universes[0]?.sharedElements[0]).toMatchObject({
      name: "세계의 규칙", description: "모든 작품 공통", tags: ["규칙"],
    });
    next = updateStoryworldUniverse(next, universeId, { name: "아르카나 세계관", description: "공유 세계" }, NOW);
    expect(next.universes[0]?.name).toBe("아르카나 세계관");
    next = removeStoryworldSharedElement(next, universeId, added.id!, NOW);
    expect(next.universes[0]?.sharedElements).toEqual([]);
    next = deleteStoryworldUniverse(next, universeId);
    expect(next.universes).toEqual([]);
  });
});

describe("storyworld universe — 설정 항목(lore) 공유", () => {
  it("kind 목록에 lore가 있고 판별자가 기존 kind와 함께 동작한다", () => {
    expect(STORYWORLD_SHARED_ELEMENT_KINDS).toEqual(["character", "location", "fact", "lore"]);
    expect(isStoryworldSharedElementKind("lore")).toBe(true);
    expect(isStoryworldSharedElementKind("character")).toBe(true);
    expect(isStoryworldSharedElementKind("guild")).toBe(false);
    expect(isStoryworldSharedElementKind(undefined)).toBe(false);
  });

  it("설정 항목 공유 요소를 만들고 로어 id로 지정·교체·해제한다", () => {
    const { registry, universeId } = registryWithUniverse();
    let next = joined(registry, universeId);
    const added = addStoryworldSharedElement(next, universeId, "lore", "대침수 규칙", NOW);
    next = added.registry;
    expect(next.universes[0]?.sharedElements[0]?.kind).toBe("lore");
    // 로어 전용 지정: elementId는 세계관 설정 허브의 StudioLoreEntry.id 공간이다.
    next = designateStoryworldLoreUsage(next, universeId, added.id!, {
      scopeKey: SCOPE_A, elementId: "lore-rule-1", elementLabel: "대침수 규칙", designatedAtIso: NOW,
    }, NOW);
    expect(next.universes[0]?.sharedElements[0]?.usages).toHaveLength(1);
    // 같은 작품·같은 로어 항목 재지정은 일반 지정과 마찬가지로 교체다.
    next = designateStoryworldLoreUsage(next, universeId, added.id!, {
      scopeKey: SCOPE_A, elementId: "lore-rule-1", elementLabel: "대침수 규칙(개정)", designatedAtIso: NOW,
    }, NOW);
    expect(next.universes[0]?.sharedElements[0]?.usages).toHaveLength(1);
    expect(next.universes[0]?.sharedElements[0]?.usages[0]?.elementLabel).toBe("대침수 규칙(개정)");
    // 일반 지정 경로로도 lore 요소를 지정할 수 있다(기존 연산의 kind 중립성).
    next = designateStoryworldSharedUsage(next, universeId, added.id!, {
      scopeKey: SCOPE_B, elementId: "lore-rule-7", elementLabel: "침수 연표", designatedAtIso: NOW,
    }, NOW);
    expect(next.universes[0]?.sharedElements[0]?.usages).toHaveLength(2);
    next = revokeStoryworldLoreUsage(next, universeId, added.id!, SCOPE_A, "lore-rule-1", NOW);
    expect(next.universes[0]?.sharedElements[0]?.usages.map((usage) => usage.scopeKey)).toEqual([SCOPE_B]);
    next = revokeStoryworldSharedUsage(next, universeId, added.id!, SCOPE_B, "lore-rule-7", NOW);
    expect(next.universes[0]?.sharedElements[0]?.usages).toEqual([]);
  });

  it("로어 전용 연산은 lore가 아닌 공유 요소를 건드리지 않고, 멤버가 아닌 작품은 지정할 수 없다", () => {
    const { registry, universeId } = registryWithUniverse();
    let next = joined(registry, universeId);
    const character = addStoryworldSharedElement(next, universeId, "character", "공유 주인공", NOW);
    next = character.registry;
    const attempted = designateStoryworldLoreUsage(next, universeId, character.id!, {
      scopeKey: SCOPE_A, elementId: "lore-rule-1", elementLabel: "대침수 규칙", designatedAtIso: NOW,
    }, NOW);
    expect(attempted).toBe(next);
    expect(revokeStoryworldLoreUsage(next, universeId, character.id!, SCOPE_A, "hero-a", NOW)).toBe(next);
    const lore = addStoryworldSharedElement(next, universeId, "lore", "대침수 규칙", NOW);
    const stranger = designateStoryworldLoreUsage(lore.registry, universeId, lore.id!, {
      scopeKey: "toonspectrum:storyworld-lab:v1:work:stranger", elementId: "lore-rule-1", elementLabel: "x", designatedAtIso: NOW,
    }, NOW);
    expect(stranger.universes[0]?.sharedElements.find((element) => element.id === lore.id)?.usages).toEqual([]);
  });

  it("행렬은 설정 항목 행을 포함하고 종류 필터·현재 작품 실재 판정이 lore에서도 동작한다", () => {
    const { registry, universeId } = registryWithUniverse();
    let next = joined(registry, universeId);
    const lore = addStoryworldSharedElement(next, universeId, "lore", "대침수 규칙", NOW);
    next = lore.registry;
    const hero = addStoryworldSharedElement(next, universeId, "character", "공유 주인공", NOW);
    next = hero.registry;
    next = designateStoryworldLoreUsage(next, universeId, lore.id!, {
      scopeKey: SCOPE_B, elementId: "lore-rule-3", elementLabel: "대침수 규칙", designatedAtIso: NOW,
    }, NOW);
    const universe = next.universes[0]!;
    const all = buildStoryworldUniverseMatrix(universe);
    expect(all.map((row) => row.element.kind)).toEqual(["lore", "character"]);
    const loreRows = buildStoryworldUniverseMatrixByKind(universe, "lore");
    expect(loreRows).toHaveLength(1);
    expect(loreRows[0]?.cells.map((cell) => cell.usage?.elementId ?? null)).toEqual([null, "lore-rule-3"]);
    expect(buildStoryworldUniverseMatrixByKind(universe, "fact")).toEqual([]);
    const alive = currentWorkSharedStatus(universe, SCOPE_B, new Set(["lore-rule-3"]), "lore");
    expect(alive[0]?.localElementAlive).toBe(true);
    const gone = currentWorkSharedStatus(universe, SCOPE_B, new Set<string>(), "lore");
    expect(gone[0]?.localElementAlive).toBe(false);
    // 멤버 제외는 lore 사용 지정도 함께 거둔다.
    next = leaveStoryworldUniverse(next, universeId, SCOPE_B, NOW);
    expect(next.universes[0]?.sharedElements.find((element) => element.id === lore.id)?.usages).toEqual([]);
  });
});

describe("storyworld universe — 레지스트리 직렬화", () => {
  it("왕복 직렬화가 보존되고 깨진 형식은 던진다", () => {
    const { registry, universeId } = registryWithUniverse();
    const next = joined(registry, universeId);
    const restored = parseStoryworldUniverseRegistry(JSON.stringify(next));
    expect(restored.universes[0]?.members).toHaveLength(2);
    expect(() => parseStoryworldUniverseRegistry(JSON.stringify({ version: 2, universes: [] }))).toThrow();
    expect(() => parseStoryworldUniverseRegistry(JSON.stringify({
      version: 1,
      universes: [{ id: "u", name: "x", updatedAtIso: NOW, members: [], sharedElements: [{ id: "s", kind: "guild", name: "y", usages: [] }] }],
    }))).toThrow();
  });

  it("lore 도입 전에 저장된 레지스트리(구 kind만)는 그대로 읽힌다 (하위호환)", () => {
    // lore kind가 없던 시절의 저장본을 손으로 적은 고정 문자열 — 마이그레이션 없이 파싱돼야 한다.
    const legacy = JSON.stringify({
      version: 1,
      universes: [{
        id: "universe-1",
        name: "아르카나 유니버스",
        updatedAtIso: NOW,
        members: [{ scopeKey: SCOPE_A, projectId: "proj-a", title: "작품 A", joinedAtIso: NOW }],
        sharedElements: [
          { id: "shared-1", kind: "character", name: "공유 주인공", usages: [{ scopeKey: SCOPE_A, elementId: "hero-a", elementLabel: "A의 주인공", designatedAtIso: NOW }] },
          { id: "shared-2", kind: "location", name: "기억 시장", usages: [] },
          { id: "shared-3", kind: "fact", name: "세계의 규칙", usages: [] },
        ],
      }],
    });
    const restored = parseStoryworldUniverseRegistry(legacy);
    expect(restored.universes[0]?.sharedElements.map((element) => element.kind)).toEqual(["character", "location", "fact"]);
    expect(restored.universes[0]?.sharedElements[0]?.usages).toHaveLength(1);
    // 구 저장본에 lore 요소를 덧붙여 다시 저장·복원해도 왕복이 보존된다.
    const withLore = addStoryworldSharedElement(restored, "universe-1", "lore", "대침수 규칙", NOW);
    const roundTripped = parseStoryworldUniverseRegistry(JSON.stringify(withLore.registry));
    expect(roundTripped.universes[0]?.sharedElements.map((element) => element.kind)).toEqual(["character", "location", "fact", "lore"]);
  });

  it("lore kind 레지스트리는 왕복 직렬화가 보존된다", () => {
    const { registry, universeId } = registryWithUniverse();
    let next = joined(registry, universeId);
    const added = addStoryworldSharedElement(next, universeId, "lore", "대침수 규칙", NOW);
    next = added.registry;
    next = designateStoryworldLoreUsage(next, universeId, added.id!, {
      scopeKey: SCOPE_A, elementId: "lore-rule-1", elementLabel: "대침수 규칙", designatedAtIso: NOW,
    }, NOW);
    const restored = parseStoryworldUniverseRegistry(JSON.stringify(next));
    expect(restored.universes[0]?.sharedElements[0]).toMatchObject({ kind: "lore", name: "대침수 규칙" });
    expect(restored.universes[0]?.sharedElements[0]?.usages[0]?.elementId).toBe("lore-rule-1");
  });
});

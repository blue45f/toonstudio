import { describe, expect, it } from "vitest";

import {
  EMPTY_STORYWORLD_UNIVERSE_REGISTRY as EMPTY,
  addStoryworldSharedElement,
  buildStoryworldUniverseMatrix,
  createStoryworldUniverse,
  currentWorkSharedStatus,
  deleteStoryworldUniverse,
  designateStoryworldSharedUsage,
  joinStoryworldUniverse,
  leaveStoryworldUniverse,
  parseStoryworldUniverseRegistry,
  removeStoryworldSharedElement,
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
});

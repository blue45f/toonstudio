import { beforeAll, describe, expect, it } from "vitest";

import {
  buildStudioCharmCatalog,
  type StudioCharmCatalog,
} from "./studio-charm-catalog";
import { loadStudioCharmCatalogData } from "./studio-charm-catalog-data";
import { writeStudioCharmDragPayload } from "./studio-charm-drag";
import {
  STUDIO_CHARM_BAR_MAX_CHARMS,
  createEmptyStudioCharmBarState,
  normalizeStudioCharmBarState,
  setStudioCharmBarOpen,
  splitStudioCharmId,
} from "./studio-charm-model";
import {
  STUDIO_CHARM_STARTER_PACK,
  applyStudioCharmStarterPack,
  shouldAutoSeedStudioCharmStarter,
} from "./studio-charm-starter-pack";

let catalog: StudioCharmCatalog;

beforeAll(async () => {
  catalog = buildStudioCharmCatalog({ data: await loadStudioCharmCatalogData(), library: [], libraryReady: true });
});

describe("기본 스타터 팩", () => {
  it("중복 없이 최대 개수 안에 들어가고 저장소에 이미 있는 소재만 가리킨다", () => {
    expect(new Set(STUDIO_CHARM_STARTER_PACK).size).toBe(STUDIO_CHARM_STARTER_PACK.length);
    expect(STUDIO_CHARM_STARTER_PACK.length).toBeLessThanOrEqual(STUDIO_CHARM_BAR_MAX_CHARMS);
    for (const id of STUDIO_CHARM_STARTER_PACK) {
      const resolution = catalog.resolve(id);
      expect(resolution.status, `${id} 해석`).toBe("ready");
    }
  });

  it("요구한 반복 요소(집중선·눈물·땀·소품)를 담는다", () => {
    const labels = STUDIO_CHARM_STARTER_PACK.map((id) => {
      const resolution = catalog.resolve(id);
      return resolution.status === "ready" ? resolution.descriptor.label : "";
    });
    expect(labels).toEqual(expect.arrayContaining(["집중선", "속도선", "큰 땀방울", "눈물·물방울", "당황 식은땀"]));
    const kinds = STUDIO_CHARM_STARTER_PACK.map((id) => splitStudioCharmId(id).kind);
    expect(kinds).toContain("emoji");
    expect(STUDIO_CHARM_STARTER_PACK.some((id) => id.startsWith("fx:prop-"))).toBe(true);
  });

  it("외부 소재·AI 생성 소재·사용자 소재를 끌어오지 않는다(권리 부담이 없는 내장 항목만)", () => {
    for (const id of STUDIO_CHARM_STARTER_PACK) {
      const resolution = catalog.resolve(id);
      if (resolution.status !== "ready") continue;
      expect(resolution.descriptor.rights.aiGenerated, id).toBe(false);
      expect(["toonstudio-original", "system-glyph"], id).toContain(resolution.descriptor.rights.origin);
    }
  });

  it("모든 스타터 참은 끌어다 놓기 계약을 통과한다(드롭 쪽 파서가 거절하지 않는다)", () => {
    for (const id of STUDIO_CHARM_STARTER_PACK) {
      const resolution = catalog.resolve(id);
      expect(resolution.status).toBe("ready");
      if (resolution.status !== "ready") continue;
      const written = new Map<string, string>();
      const accepted = writeStudioCharmDragPayload(
        { effectAllowed: "none", setData: (format, value) => { written.set(format, value); } },
        resolution.descriptor,
        { width: 720, height: 1280 },
      );
      expect(accepted, `${id} 드래그`).toBe(true);
      expect(written.size, `${id} 페이로드`).toBe(1);
    }
  });

  it("스타터 덧붙이기는 처리 완료로 표시하고, 처음 연 빈 바에만 자동으로 담는다", () => {
    const empty = createEmptyStudioCharmBarState();
    expect(shouldAutoSeedStudioCharmStarter(empty)).toBe(false);
    const opened = setStudioCharmBarOpen(empty, true);
    expect(shouldAutoSeedStudioCharmStarter(opened)).toBe(true);
    const seeded = applyStudioCharmStarterPack(opened);
    expect(seeded.charms).toEqual(STUDIO_CHARM_STARTER_PACK);
    expect(seeded.starterSettled).toBe(true);
    expect(seeded.open).toBe(true);
    expect(shouldAutoSeedStudioCharmStarter(seeded)).toBe(false);
    const settledEmpty = normalizeStudioCharmBarState({ version: 1, charms: [], open: true, starterSettled: true });
    expect(shouldAutoSeedStudioCharmStarter(settledEmpty)).toBe(false);
  });
});

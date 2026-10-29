import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createStudioWorldStarterTemplate } from "./studio-world-template-package";
import { STUDIO_OFFICE_ENVIRONMENTS, studioOfficeEnvironmentManifest } from "./studio-virtual-space-office-environments";
import { resolveStudioVirtualBuiltinWorld } from "./studio-virtual-space-campus-world";
import { STUDIO_VIRTUAL_PLACES } from "./studio-virtual-space-place-catalog";
import { STUDIO_SPACE_MODULES } from "./studio-virtual-space-room-catalog";
import { studioSpaceTheme } from "./studio-virtual-space-theme";
import { DEFAULT_STUDIO_WORLD_MANIFEST, validateStudioWorldManifest } from "./studio-virtual-space-world-manifest";
import { findStudioWorldPath, studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import { office2dSceneFor } from "./office2d/office2d-scene";

for (const environment of STUDIO_OFFICE_ENVIRONMENTS) {
  describe(environment.labelKo, () => {
    it("같은 원본 아트를 미리보기·테마·실제 진입 월드에서 사용한다", () => {
      const place = STUDIO_VIRTUAL_PLACES.find((candidate) => candidate.id === environment.key);
      const world = resolveStudioVirtualBuiltinWorld(environment.key, true);
      expect(place?.previewUrl).toBe(environment.previewUrl);
      expect(existsSync(resolve("apps/web/public", environment.previewUrl.slice(1)))).toBe(true);
      expect(STUDIO_SPACE_MODULES.find((module) => module.id === environment.key)?.entry).toEqual({ type: "zone", zoneId: environment.key });
      expect(studioSpaceTheme(environment.key).labelKo).toBe(environment.labelKo);
      expect(world.placeId).toBe(environment.key);
      expect(world.manifest).toBe(studioOfficeEnvironmentManifest(environment.key));
      expect(world.manifest.backgroundUrl).toBe(environment.previewUrl);
      expect(office2dSceneFor(world.manifest).backgroundUrl).toBe(environment.previewUrl);
      expect(validateStudioWorldManifest(world.manifest)).toEqual([]);
    });
    it("그려진 가구를 통과하지 않고 모든 제작 도구·좌석·출구까지 걸어간다", () => {
      const world = studioOfficeEnvironmentManifest(environment.key);
      expect(world).not.toBeNull();
      if (!world) return;
      const start = environment.spawn;
      for (const collider of environment.colliders) {
        expect(studioWorldCanOccupy(world, { x: collider.x + collider.width / 2, y: collider.y + collider.height / 2 })).toBe(false);
      }
      const destinations = [...world.interactions.map((interaction) => interaction.point), ...(world.interactionSlots ?? []).flatMap((slot) => [slot.approachPoint, slot.anchorPoint, slot.exitPoint]), ...world.portals.map((portal) => portal.point)];
      for (const target of destinations) {
        expect(studioWorldCanOccupy(world, target), `${target.x},${target.y} 점유`).toBe(true);
        const path = findStudioWorldPath(world, start, target);
        expect(path.length, `${target.x},${target.y} 경로`).toBeGreaterThan(0);
        expect(path[path.length - 1]).toEqual(target);
      }
    });
    it("기존 비공개 영역과 작업 식별자를 보존하는 시작 템플릿을 만든다", () => {
      const before = { ...DEFAULT_STUDIO_WORLD_MANIFEST, id: "office-project", version: 7 };
      const serialized = JSON.stringify(before);
      const next = createStudioWorldStarterTemplate(environment.key, before);
      expect(next.id).toBe(before.id);
      expect(next.version).toBe(before.version);
      expect(next.backgroundUrl).toBe(environment.previewUrl);
      expect(validateStudioWorldManifest(next)).toEqual([]);
      expect(next.acousticZones).toEqual(before.acousticZones?.filter((zone) => zone.policy === "private" || Boolean(zone.doorId)));
      expect(JSON.stringify(before)).toBe(serialized);
    });
  });
}

it("세 사무실의 실제 충돌 배치·좌석·진입 위치가 서로 다르다", () => {
  expect(new Set(STUDIO_OFFICE_ENVIRONMENTS.map((environment) => JSON.stringify(environment.colliders))).size).toBe(3);
  expect(new Set(STUDIO_OFFICE_ENVIRONMENTS.map((environment) => JSON.stringify(environment.seats))).size).toBe(3);
  expect(new Set(STUDIO_OFFICE_ENVIRONMENTS.map((environment) => JSON.stringify(environment.spawn))).size).toBe(3);
});

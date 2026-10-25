import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { parseStudioVrmLicenseMetadata } from "../../vrm/studio-vrm-license-metadata";
import {
  BUNDLED_VRM_RIGHTS_BLOCKS,
  isBundledVrmUrlRightsBlocked,
  SAMPLE_VRM_ENTRIES,
  SAMPLE_VRMS,
} from "../../vrm/vrm-library";
import { CAMPUS_HEIGHT, CAMPUS_INTERACTIONS, CAMPUS_NPCS, CAMPUS_WIDTH, CAMPUS_ZONES } from "../studio-virtual-space-campus-blueprint";
import {
  computeZonePlinthTransform,
  findClickedWorldTarget,
  formatParticipantOverlayBadge,
  resolveOverlayCollisions,
  STUDIO_THREE_HDRI_URLS,
  STUDIO_THREE_ZONE_DIORAMAS,
} from "./studio-virtual-space-three-dioramas";
import {
  applyNaturalVrmPosture,
  buildStudioThreeCampusArchitecture,
  createStylized3DCharacterNode,
  facingToYawRadians,
  isVerifiedStudioThreeVrmUrl,
  resolveStudioThreeVrmUrl,
  shortestAngleLerp,
  STUDIO_THREE_PROPS,
  STUDIO_THREE_VRM_URLS,
  threeToWorld,
  worldToThree,
} from "./studio-virtual-space-three-scene";

const WEB_ROOT = resolve(import.meta.dirname, "../../../../..");
const PUBLIC_ROOT = resolve(WEB_ROOT, "public");
const LICENSES_MD_PATH = resolve(PUBLIC_ROOT, "vrm/LICENSES.md");

function readGlbJson(filePath: string): unknown {
  const bytes = readFileSync(filePath);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
}

describe("3D 가상 스튜디오 씬 아키텍처·디오라마·VRM·HDRI 검증", () => {
  it("2D 캠퍼스 좌표와 3D 미터 좌표 간 왕복 변환이 정확하다", () => {
    for (const zone of CAMPUS_ZONES) {
      const threePos = worldToThree(zone.spawn, 1.5);
      expect(threePos.y).toBe(1.5);
      const roundtrip = threeToWorld({ x: threePos.x, z: threePos.z });
      expect(roundtrip).toEqual(zone.spawn);
    }
  });

  it("4방향 facing을 3D 라디안 회전각으로 매핑하고 최단 각도 보간을 수행한다", () => {
    expect(facingToYawRadians("down")).toBe(0);
    expect(facingToYawRadians("right")).toBeCloseTo(Math.PI * 0.5);
    expect(facingToYawRadians("up")).toBeCloseTo(Math.PI);
    expect(facingToYawRadians("left")).toBeCloseTo(-Math.PI * 0.5);

    const wrapped = shortestAngleLerp(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(wrapped)).toBeGreaterThan(Math.PI - 0.15);
  });

  it("10개 캠퍼스 구역 전부에 풀 3D 건축 디오라마 에셋과 3종 HDRI 환경맵이 매핑된다", () => {
    expect(STUDIO_THREE_ZONE_DIORAMAS).toHaveLength(CAMPUS_ZONES.length);
    const mappedRooms = new Set(STUDIO_THREE_ZONE_DIORAMAS.map((d) => d.roomId));
    for (const zone of CAMPUS_ZONES) {
      expect(mappedRooms.has(zone.roomId)).toBe(true);
      const plinth = computeZonePlinthTransform(zone.tiles);
      expect(plinth.zw).toBeGreaterThan(8);
      expect(plinth.zh).toBeGreaterThan(8);
    }
    for (const spec of STUDIO_THREE_ZONE_DIORAMAS) {
      expect(spec.url).toMatch(/^\/assets\/3d\/environments\/.+\.glb$/u);
      expect(spec.targetWidthMeters).toBeGreaterThan(10);
      expect(spec.targetDepthMeters).toBeGreaterThan(8);
    }
    expect(STUDIO_THREE_HDRI_URLS.day).toMatch(/\.hdr$/u);
    expect(STUDIO_THREE_HDRI_URLS.studio).toMatch(/\.hdr$/u);
    expect(STUDIO_THREE_HDRI_URLS.night).toMatch(/\.hdr$/u);
  });

  it("모든 3D GLB 협업 워크스테이션 소품과 9종 VRM 아바타 경로가 유효하고 권리 차단·고지 의무 제약을 위반하지 않는다", () => {
    expect(STUDIO_THREE_PROPS.length).toBeGreaterThanOrEqual(40);
    const ids = new Set(STUDIO_THREE_PROPS.map((prop) => prop.id));
    expect(ids.size).toBe(STUDIO_THREE_PROPS.length);

    for (const prop of STUDIO_THREE_PROPS) {
      expect(prop.url).toMatch(/^\/assets\/3d\/.+\.glb$/u);
      expect(prop.x).toBeGreaterThanOrEqual(0);
      expect(prop.x).toBeLessThanOrEqual(CAMPUS_WIDTH);
      expect(prop.y).toBeGreaterThanOrEqual(0);
      expect(prop.y).toBeLessThanOrEqual(CAMPUS_HEIGHT);
      expect(prop.heightMeters).toBeGreaterThan(0.15);
    }

    expect(STUDIO_THREE_VRM_URLS).toHaveLength(9);
    expect(new Set(STUDIO_THREE_VRM_URLS).size).toBe(STUDIO_THREE_VRM_URLS.length);
    const sampleByUrl = new Map(SAMPLE_VRMS.map((sample) => [sample.url, sample] as const));
    const activeIds = new Set(SAMPLE_VRM_ENTRIES.map((entry) => entry.id));
    const licensesMarkdown = readFileSync(LICENSES_MD_PATH, "utf8");

    for (const url of STUDIO_THREE_VRM_URLS) {
      expect(url).toMatch(/^\/vrm\/.+\.vrm$/u);
      expect(isBundledVrmUrlRightsBlocked(url)).toBe(false);
      expect(isVerifiedStudioThreeVrmUrl(url)).toBe(true);
      const catalogEntry = sampleByUrl.get(url);
      expect(catalogEntry).toBeDefined();
      expect(activeIds.has(catalogEntry!.id)).toBe(true);
      expect(catalogEntry?.licenseNotice).toBeUndefined();
      expect(catalogEntry?.limitations ?? []).not.toContain("heavy-payload");

      const fileName = url.replace(/^\/vrm\//u, "");
      const licenseLines = licensesMarkdown
        .split(/\r?\n/u)
        .filter((line) => line.includes(`\`${fileName}\``));
      expect(licenseLines.length).toBeGreaterThan(0);
      expect(licenseLines.some((line) => line.includes("CC0"))).toBe(true);
      expect(licenseLines.every((line) => !line.includes("제외"))).toBe(true);
      expect(licenseLines.every((line) => !line.includes("조건부"))).toBe(true);
      expect(licenseLines.every((line) => !line.includes("고지 조건"))).toBe(true);

      const diskPath = resolve(PUBLIC_ROOT, url.slice(1));
      expect(existsSync(diskPath)).toBe(true);
      const parsed = parseStudioVrmLicenseMetadata(readGlbJson(diskPath));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.receipt.licenseIdentifier).toBe("CC0");
        expect(parsed.receipt.avatarPermission).toBe("everyone");
        expect(parsed.receipt.commercial).toBe("allow");
        expect(parsed.receipt.redistribution).toBe("allow");
        expect(parsed.receipt.modification).toBe("allow-modification-redistribution");
        expect(parsed.receipt.credit).toBe("unnecessary");
      }
    }

    for (const blocked of BUNDLED_VRM_RIGHTS_BLOCKS) {
      expect(isVerifiedStudioThreeVrmUrl(blocked.url)).toBe(false);
      expect(STUDIO_THREE_VRM_URLS).not.toContain(blocked.url);
    }
    for (const nonCc0Url of [
      "/vrm/Vita.vrm",
      "/vrm/Vivi.vrm",
      "/vrm/Victoria_Rubin.vrm",
      "/vrm/sample.vrm",
      "/vrm/Seed_san.vrm",
      "/vrm/AliciaSolid.vrm",
      "/vrm/Sakurada_Fumiriya.vrm",
      "https://evil.example/avatar.vrm",
    ]) {
      expect(isVerifiedStudioThreeVrmUrl(nonCc0Url)).toBe(false);
      expect(STUDIO_THREE_VRM_URLS).not.toContain(nonCc0Url);
    }

    expect(resolveStudioThreeVrmUrl(0)).toBe(STUDIO_THREE_VRM_URLS[0]);
    expect(resolveStudioThreeVrmUrl(9)).toBe(STUDIO_THREE_VRM_URLS[0]);
    expect(resolveStudioThreeVrmUrl(-1)).toBe(STUDIO_THREE_VRM_URLS[8]);
    expect(resolveStudioThreeVrmUrl(Number.NaN)).toBe(STUDIO_THREE_VRM_URLS[0]);
  });

  it("3D 캠퍼스 아키텍처 빌더와 스타일라이즈드 3D 캐릭터 리그를 정상 생성한다", () => {
    const scene = new THREE.Scene();
    const { floorMesh, waterMeshes, workstationRings } = buildStudioThreeCampusArchitecture(scene);
    expect(floorMesh.name).toBe("campus-walkable-floor");
    expect(waterMeshes).toHaveLength(2);
    expect(workstationRings).toHaveLength(CAMPUS_INTERACTIONS.length);
    expect(scene.children.length).toBeGreaterThan(35);

    const selfActor = createStylized3DCharacterNode("self", 0x4f46e5, true);
    expect(selfActor.group.name).toBe("actor-self");
    expect(selfActor.rigGroup.children.length).toBeGreaterThanOrEqual(8);
  });

  it("VRM T-포즈 상완·전완 본을 월드 Y 계측 기반으로 자연스러운 차렷 자세로 보정한다", () => {
    const selfActor = createStylized3DCharacterNode("self", 0x4f46e5, true);
    const mockVrm = new THREE.Group();
    const leftArm = new THREE.Object3D();
    leftArm.name = "J_Bip_L_UpperArm";
    const rightArm = new THREE.Object3D();
    rightArm.name = "J_Bip_R_UpperArm";
    const leftLeg = new THREE.Object3D();
    leftLeg.name = "J_Bip_L_UpperLeg";
    mockVrm.add(leftArm, rightArm, leftLeg);

    applyNaturalVrmPosture(selfActor, mockVrm);
    expect(leftArm.rotation.z).toBeCloseTo(1.16);
    expect(rightArm.rotation.z).toBeCloseTo(-1.16);
    expect(selfActor.armDownZLeft).toBeCloseTo(1.16);
    expect(selfActor.armDownZRight).toBeCloseTo(-1.16);
    expect(selfActor.vrmLeftUpperArm).toBe(leftArm);
    expect(selfActor.vrmRightUpperArm).toBe(rightArm);
    expect(selfActor.vrmLeftUpperLeg).toBe(leftLeg);

    const resolved = resolveOverlayCollisions([
      { id: "a", label: "A", kind: "workstation", x: 100, y: 100 },
      { id: "b", label: "B", kind: "npc", x: 102, y: 104 },
    ]);
    expect(Math.abs(resolved[0]!.y - resolved[1]!.y)).toBeGreaterThan(20);
  });

  it("참가자 협업 상태·말풍선·이모트·타이핑을 3D 오버레이 배지 정보로 정확히 포맷하고 바닥 클릭 타겟을 판별한다", () => {
    const baseState = {
      x: 1500,
      y: 900,
      zoneId: "lobby",
      facing: "down" as const,
      activity: "available" as const,
      moving: false,
      avatarIndex: 0,
    };

    expect(formatParticipantOverlayBadge(baseState, false, "3D 아바타", "3D Avatar")).toEqual({
      sublabel: "3D 아바타",
      accent: "#10b981",
    });

    expect(
      formatParticipantOverlayBadge({ ...baseState, activity: "focused" }, false, "3D 아바타", "3D Avatar"),
    ).toEqual({
      sublabel: "🎯 집중 작업",
      accent: "#a855f7",
    });

    expect(
      formatParticipantOverlayBadge({ ...baseState, userStatus: "in-meeting" }, false, "3D 아바타", "3D Avatar"),
    ).toEqual({
      sublabel: "🔴 회의 중",
      accent: "#ef4444",
    });

    expect(
      formatParticipantOverlayBadge({ ...baseState, emote: "clap" }, false, "3D 아바타", "3D Avatar"),
    ).toEqual({
      sublabel: "👏 박수",
      accent: "#10b981",
    });

    expect(
      formatParticipantOverlayBadge({ ...baseState, bubble: "콘티 피드백 부탁해요!" }, false, "3D 아바타", "3D Avatar"),
    ).toEqual({
      sublabel: "💬 콘티 피드백 부탁해요!",
      accent: "#10b981",
    });

    const firstWorkstation = CAMPUS_INTERACTIONS[0]!;
    expect(findClickedWorldTarget(firstWorkstation.point, CAMPUS_INTERACTIONS, CAMPUS_NPCS)).toEqual({
      kind: "workstation",
      id: firstWorkstation.id,
    });

    const firstNpc = CAMPUS_NPCS[0]!;
    expect(findClickedWorldTarget(firstNpc.point, [], CAMPUS_NPCS)).toEqual({
      kind: "npc",
      id: firstNpc.id,
    });

    expect(findClickedWorldTarget({ x: 10, y: 10 }, CAMPUS_INTERACTIONS, CAMPUS_NPCS)).toBeNull();
  });
});



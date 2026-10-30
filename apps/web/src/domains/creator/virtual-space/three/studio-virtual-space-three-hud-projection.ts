import * as THREE from "three";

import { STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS } from "../studio-virtual-space-engine-events";
import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { studioNpcLabel } from "../studio-virtual-space-npc-director";
import type { StudioVirtualSpaceSnapshot } from "../studio-virtual-space-presence";
import type { StudioVirtualSpaceWorldManifest, StudioWorldInteractionDefinition } from "../studio-virtual-space-world-manifest";
import { DUPLICATE_ARCADE_IDS, formatParticipantOverlayBadge, resolveOverlayCollisions, WORKSTATION_ACTION_BADGES, type ProjectedOverlayItem } from "./studio-virtual-space-three-dioramas";
import { STUDIO_THREE_SCALE, type StudioThreeActorNode } from "./studio-virtual-space-three-scene";
import type { studioThreeRoomSigns } from "./studio-virtual-space-three-world-layout";

interface StudioThreeOverlayProjection {
  readonly width: number;
  readonly height: number;
  readonly camera: THREE.PerspectiveCamera;
  readonly selfNode: StudioThreeActorNode;
  readonly actorNodes: ReadonlyMap<string, StudioThreeActorNode>;
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly currentPoint: StudioVirtualSpacePoint;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly allInteractions: readonly StudioWorldInteractionDefinition[];
  readonly roomSigns: ReturnType<typeof studioThreeRoomSigns>;
  readonly selfLabel: string;
  readonly isEn: boolean;
  readonly closestInteraction: StudioWorldInteractionDefinition | null;
}

/** 기존 거리·우선순위·충돌 배치를 유지하며 한 번의 HUD 갱신에서 투영 벡터를 재사용한다. */
export function projectStudioThreeOverlays(input: StudioThreeOverlayProjection): readonly ProjectedOverlayItem[] {
  const { width, height, camera, selfNode, actorNodes, snapshot, currentPoint, manifest, allInteractions, roomSigns, selfLabel, isEn, closestInteraction } = input;
  const projected: ProjectedOverlayItem[] = [];
  const vector = new THREE.Vector3();
  const projectPoint = (x: number, y: number, z: number) => {
    vector.set(x, y, z).project(camera);
    if (vector.z < -1 || vector.z > 1) return { x: 0, y: 0, visible: false };
    const sx = (vector.x * 0.5 + 0.5) * width, sy = (-vector.y * 0.5 + 0.5) * height;
    return { x: sx, y: sy, visible: sx >= -60 && sx <= width + 60 && sy >= -40 && sy <= height + 40 };
  };
  const selfHead = projectPoint(selfNode.group.position.x, 2.04, selfNode.group.position.z);
  if (selfHead.visible) {
    const badge = formatParticipantOverlayBadge(snapshot.self, isEn, "3D 아바타", "3D Avatar");
    projected.push({ id: "self", label: selfLabel, sublabel: badge.sublabel, kind: "self", x: selfHead.x, y: selfHead.y, accent: badge.accent });
  }
  for (const peer of snapshot.peers) {
    const node = actorNodes.get(`peer:${peer.participant.sessionId}`);
    if (!node) continue;
    const head = projectPoint(node.group.position.x, 2.04, node.group.position.z);
    if (head.visible) {
      const badge = formatParticipantOverlayBadge(peer.state, isEn, "동료", "Peer");
      projected.push({ id: `peer:${peer.participant.sessionId}`, label: peer.participant.displayName, sublabel: badge.sublabel, kind: "peer", x: head.x, y: head.y, accent: badge.accent });
    }
  }
  for (const npc of manifest.npcs ?? []) {
    const distance = Math.hypot(npc.point.x - currentPoint.x, npc.point.y - currentPoint.y);
    if (distance > 640) continue;
    const node = actorNodes.get(npc.id);
    if (!node) continue;
    const label = studioNpcLabel(npc);
    const head = projectPoint(node.group.position.x, 2.12, node.group.position.z);
    if (head.visible) projected.push({ id: `npc:${npc.id}`, targetId: npc.id, label: isEn ? label.en : label.ko, sublabel: isEn ? "Talk" : "대화", kind: "npc", x: head.x, y: head.y, active: distance <= STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS });
  }
  for (const interaction of allInteractions) {
    if (DUPLICATE_ARCADE_IDS.has(interaction.id) || Math.hypot(interaction.point.x - currentPoint.x, interaction.point.y - currentPoint.y) > 520) continue;
    const point = projectPoint(interaction.point.x * STUDIO_THREE_SCALE, 0.92, interaction.point.y * STUDIO_THREE_SCALE);
    if (point.visible) {
      const meta = WORKSTATION_ACTION_BADGES[interaction.action] ?? { ko: "협업 도구", en: "Tool", color: "#6366f1" };
      projected.push({ id: `workstation:${interaction.id}`, targetId: interaction.id, label: isEn ? interaction.labelEn : interaction.labelKo, sublabel: isEn ? meta.en : meta.ko, kind: "workstation", x: point.x, y: point.y, accent: meta.color, active: closestInteraction?.id === interaction.id });
    }
  }
  for (const zone of roomSigns) {
    if (Math.hypot(zone.x - currentPoint.x, zone.y - currentPoint.y) > 920) continue;
    const point = projectPoint(zone.x * STUDIO_THREE_SCALE, zone.heightMeters, zone.y * STUDIO_THREE_SCALE);
    if (point.visible) {
      const room = manifest.rooms.find((candidate) => candidate.id === zone.roomId);
      projected.push({ id: `zone:${zone.roomId}`, label: zone.label, sublabel: isEn ? (room?.labelEn ?? zone.label) : (room?.labelKo ?? zone.label), kind: "zone", x: point.x, y: point.y });
    }
  }
  return resolveOverlayCollisions(projected);
}

import type { PropAnchorDef, PropAnchorRole, PropDef, Vec3 } from "./studio-vrm-props";

const FORWARD: Vec3 = [0, 0, 1];
const UP: Vec3 = [0, 1, 0];

export function anchor(id: string, role: PropAnchorRole, position: Vec3, forward: Vec3 = FORWARD, up: Vec3 = UP): PropAnchorDef {
  return { id, role, position, forward, up };
}

export function handAnchor(
  id: string,
  role: "primary" | "secondary",
  position: Vec3,
  gripRadius: number,
  forward: Vec3 = FORWARD,
  up: Vec3 = UP,
): PropAnchorDef {
  return { ...anchor(id, role, position, forward, up), gripRadius };
}

export function primaryPropAnchor(def: PropDef, requestedId?: string, repairId?: string): PropAnchorDef {
  const lookup = (id?: string) => id && def.anchors.find(item => item.id === id && item.role !== "secondary");
  return lookup(requestedId) || lookup(repairId)
    || def.anchors.find(item => item.role === "primary" || item.role === "surface") || def.anchors[0];
}

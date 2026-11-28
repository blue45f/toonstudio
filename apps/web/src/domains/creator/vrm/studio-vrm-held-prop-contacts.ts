import { usesDefaultFittedThumbGrip } from "./studio-vrm-microphone-grip";
import { propDefById } from "./studio-vrm-props";

import type { VrmPropRigMetrics } from "./studio-vrm-prop-rig";
import type { PropInstance } from "./studio-vrm-props";

/** 다른 소품을 직접 쥔 손에는 책의 기본 보조 접촉을 적용하지 않는다. 원고의 장착 설정은 그대로 보존한다. */
export function resolveStudioVrmHeldPropContacts(items: readonly PropInstance[], metrics: VrmPropRigMetrics): readonly PropInstance[] {
  if (items.length < 2 || !items.some(item => item.propId === "book")) return items;
  let effective: PropInstance[] | null = null;
  for (const [i, item] of items.entries()) {
    const rig = item.rig, secondary = rig?.secondary;
    if (item.propId !== "book" || !rig || !usesDefaultFittedThumbGrip(item, metrics)
      || !secondary?.enabled || secondary.anchorId !== "secondary" || secondary.elbowHint
      || secondary.influence !== propDefById("book")?.secondaryGripInfluence) continue;
    const occupied = items.some(other => {
      if (other.uid === item.uid || other.bone !== secondary.bone) return false;
      const grip = propDefById(other.propId)?.grip;
      return Boolean(grip && grip.kind !== "wear");
    });
    if (!occupied) continue;
    effective ??= [...items];
    effective[i] = { ...item, rig: { ...rig, secondary: { ...secondary, enabled: false } } };
  }
  return effective ?? items;
}

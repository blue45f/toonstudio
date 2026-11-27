import type { StudioVrmProjectionAttachmentStatus } from "../vrm/StudioVrmWardrobePropsProjection";

interface Receipt {
  readonly item: string;
  readonly status: StudioVrmProjectionAttachmentStatus;
  readonly detail?: "asset-load-failed" | undefined;
}

export function createLinkedCutAttachmentReceipts() {
  const props = new Map<string, Receipt>();
  const wardrobe = new Map<string, Receipt>();
  function record(map: Map<string, Receipt>, key: string, receipt: Receipt) {
    if (receipt.status !== "detached" || map.get(key)?.item === receipt.item) map.set(key, receipt);
  }
  function pending(label: string, expected: string, receipt?: Receipt) {
    if (receipt?.item === expected && receipt.status === "ready") return null;
    if (receipt?.item === expected && receipt.detail === "asset-load-failed") {
      return { reason: `${label} 3D 파일을 불러오지 못해 기존 컷을 보존했습니다.`, failed: true };
    }
    const status = receipt?.item === expected ? receipt.status : undefined;
    const reason = status === "detached" ? "장착 해제" : status === "unavailable" ? "모델 또는 본 연결 대기" : "장착 확인 대기";
    return { reason: `${label} ${reason}`, failed: false };
  }
  return {
    prop(uid: string, item: string, status: StudioVrmProjectionAttachmentStatus, detail?: "asset-load-failed") {
      record(props, uid, { item, status, detail });
    },
    garment(slot: string, item: string, status: StudioVrmProjectionAttachmentStatus) {
      record(wardrobe, slot, { item, status });
    },
    issue(instances: readonly { uid: string; propId: string }[], equips: Readonly<Record<string, { itemId: string } | undefined>>) {
      let first: ReturnType<typeof pending> = null;
      for (const { uid, propId } of instances) {
        const problem = pending(`소품 ${propId} (${uid})`, propId, props.get(uid));
        if (problem?.failed) return problem;
        first ??= problem;
      }
      for (const [slot, equip] of Object.entries(equips)) {
        if (equip) first ??= pending(`의상 ${slot} (${equip.itemId})`, equip.itemId, wardrobe.get(slot));
      }
      return first;
    },
  };
}

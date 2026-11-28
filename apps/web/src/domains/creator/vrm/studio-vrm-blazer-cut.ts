import type { GarmentPart } from "./studio-vrm-wardrobe";

/** 같은 재단선·부착 프레임·스킨 좌표를 쓰면서 단추만 별도 재질로 나눈다. */
export function cutStudioVrmBlazerPanels(shell: GarmentPart): GarmentPart[] {
  const shape = shell.shape;
  if (shape.kind !== "lathe") throw new Error("블레이저 몸판 단면 누락");
  return (["blazer-body", "blazer-facing", "blazer-buttons"] as const).map((tailoring) => {
    const finish = tailoring === "blazer-buttons" ? { color: "#ad9063", metalness: 0.42 } : {};
    return { ...shell, shape: { ...shape, tailoring }, ...finish };
  });
}

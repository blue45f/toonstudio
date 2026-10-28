import { formatI18nTemplate } from "@/shared/lib/i18n-bilingual-copy";

type BilingualFn = (ko: string, en: string) => string;

/** 장면 목록에 보이는 쉬운 이름. 원본 식별자는 작은 글씨로 따로 보여 준다. */
export function friendlyHybridDccAssetName(bt: BilingualFn, assetId: string, index: number): string {
  if (/^(?:asset-)?cube(?:-|$)/iu.test(assetId)) return bt("큐브", "Cube");
  const roomPart = /-part-(\d+)$/u.exec(assetId);
  if (roomPart) return formatI18nTemplate(bt("방 구성품 {n}", "Room part {n}"), { n: Number(roomPart[1]) });
  return formatI18nTemplate(bt("오브젝트 {n}", "Object {n}"), { n: index + 1 });
}

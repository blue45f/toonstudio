import type { CastHeightEntry, CharacterSheetBible, OklchColorChipValue } from "./character-sheet-bible-engine";

function text(value: string): void {
  if (typeof value !== "string" || value.length > 10000) throw new TypeError("설정집 텍스트는 10000자 이내 문자열이어야 합니다.");
}
function unique<T extends { readonly id: string }>(items: readonly T[], max: number): void {
  if (!Array.isArray(items) || items.length > max) throw new RangeError("설정집 목록 상한을 초과했습니다.");
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item.id !== "string" || !item.id.trim() || item.id.length > 256 || seen.has(item.id)) throw new TypeError("고유한 설정집 ID가 필요합니다.");
    seen.add(item.id);
  }
}
export function assertCastStructure(cast: readonly CastHeightEntry[]): void {
  unique(cast, 64);
  for (const item of cast) { text(item.nameKo); text(item.nameEn); }
}
/** 누락 항목은 감사 대상으로 허용하되, 중복·과대·지원하지 않는 구조는 거부한다. */
export function assertBibleStructure(sheet: CharacterSheetBible): void {
  for (const value of [sheet.id, sheet.code, sheet.seriesTitle, sheet.nameKo, sheet.nameEn, sheet.roleKo, sheet.roleEn, sheet.ageLabel, sheet.silhouetteSignature, sheet.asymmetryPoints, sheet.hairAndBuildNotes]) text(value);
  unique(sheet.expressions, 9);
  unique(sheet.outfits, 5);
  unique(sheet.colorChips, 64);
  const positions = new Set<string>();
  for (const cell of sheet.expressions) {
    if (!["joy", "anger", "sadness", "surprise", "neutral", "flustered", "smirk", "exhausted", "serious"].includes(cell.id)
      || !Number.isInteger(cell.gridRow) || cell.gridRow < 0 || cell.gridRow > 2
      || !Number.isInteger(cell.gridCol) || cell.gridCol < 0 || cell.gridCol > 2
      || positions.has(`${cell.gridRow},${cell.gridCol}`)) throw new TypeError("표정 슬롯·좌표가 유효하지 않습니다.");
    positions.add(`${cell.gridRow},${cell.gridCol}`);
    for (const value of [cell.labelKo, cell.labelEn, cell.usageContextKo, cell.usageContextEn, cell.eyebrowNote, cell.eyeNote, cell.mouthNote, cell.blushSweatNote]) text(value);
  }
  const outfitIds = ["uniform", "casual", "combat", "damaged", "winter"];
  for (const outfit of sheet.outfits) {
    if (!outfitIds.includes(outfit.id) || !Array.isArray(outfit.keyAccessories) || outfit.keyAccessories.length > 64) throw new TypeError("의상 슬롯·소품 목록이 유효하지 않습니다.");
    for (const value of [outfit.labelKo, outfit.labelEn, outfit.silhouetteSummary, outfit.continuityChecklist, outfit.damageOrWeatherRule, ...outfit.keyAccessories]) text(value);
  }
  for (const chip of sheet.colorChips) {
    if (chip.slotScope !== "base" && !outfitIds.includes(chip.slotScope)) throw new TypeError("색상 적용 슬롯이 유효하지 않습니다.");
    for (const value of [chip.partKo, chip.partEn, chip.printCmykNote, chip.doNotColorRule]) text(value);
  }
  if (!Array.isArray(sheet.globalColoringProhibitions) || sheet.globalColoringProhibitions.length > 64) throw new RangeError("채색 규칙은 최대 64개입니다.");
  sheet.globalColoringProhibitions.forEach(text);
}
function validColor(color: OklchColorChipValue): boolean {
  return Boolean(color) && Number.isFinite(color.l) && color.l >= 0.05 && color.l <= 0.98
    && Number.isFinite(color.c) && color.c >= 0 && color.c <= 0.36 && Number.isFinite(color.h);
}
export function validBibleNumerics(sheet: CharacterSheetBible): boolean {
  return Number.isFinite(sheet.heightCm) && sheet.heightCm >= 110 && sheet.heightCm <= 230
    && Number.isFinite(sheet.headRatio) && sheet.headRatio >= 5.5 && sheet.headRatio <= 8.5
    && Number.isFinite(sheet.footwearBonusCm) && sheet.footwearBonusCm >= 0 && sheet.footwearBonusCm <= 15
    && validColor(sheet.accentOklch) && sheet.colorChips.every((chip) => validColor(chip.oklch));
}
export function assertBibleExport(sheet: CharacterSheetBible, cast?: readonly CastHeightEntry[]): void {
  assertBibleStructure(sheet);
  if (!validBibleNumerics(sheet)) throw new RangeError("설정집 수치가 유한 범위를 벗어났습니다.");
  if (cast) {
    assertCastStructure(cast);
    for (const item of cast) {
      if (!Number.isFinite(item.heightCm) || !Number.isFinite(item.headRatio)
        || (item.footwearBonusCm !== undefined && !Number.isFinite(item.footwearBonusCm))
        || (item.accentOklch !== undefined && !validColor(item.accentOklch))) throw new RangeError("비교 캐릭터 수치가 유효하지 않습니다.");
    }
  }
}

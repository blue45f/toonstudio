import { normalizeStudioHybridDccToonMaterial, type StudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";

export interface StudioToonEditorFields {
  readonly base: string; readonly shade: string; readonly shift: string; readonly toony: string;
  readonly outline: boolean; readonly outlineMode: StudioHybridDccToonMaterial["outline"]["mode"];
  readonly width: string; readonly outlineColor: string;
  readonly widthSource?: { readonly factor: number; readonly text: string; readonly mode: StudioHybridDccToonMaterial["outline"]["mode"] };
}
export function studioToonEditorFields(material: StudioHybridDccToonMaterial): StudioToonEditorFields {
  const width = String(material.outline.width * (material.outline.mode === "screenCoordinates" ? 50 : 1));
  return { base: material.baseColorSrgb, shade: material.shadeColorSrgb, shift: String(material.shadingShift), toony: String(material.shadingToony),
    outline: material.outline.enabled, outlineMode: material.outline.mode,
    width, outlineColor: material.outline.colorSrgb, widthSource: { factor: material.outline.width, text: width, mode: material.outline.mode } };
}
export function studioToonEditorRequest(fields: StudioToonEditorFields): StudioHybridDccToonMaterial {
  const number = (value: string) => value.trim() ? Number(value) : NaN;
  const width = fields.widthSource?.text === fields.width && fields.widthSource.mode === fields.outlineMode
    ? fields.widthSource.factor : number(fields.width) * (fields.outlineMode === "screenCoordinates" ? .02 : 1);
  return normalizeStudioHybridDccToonMaterial({ version: 1, model: "toon", baseColorSrgb: fields.base, shadeColorSrgb: fields.shade,
    shadingShift: number(fields.shift), shadingToony: number(fields.toony), outline: { enabled: fields.outline, mode: fields.outlineMode,
      // MToon SDK의 NDC 폭은 width이며 실제 화면 높이 비율은 width/2다. UI는 사람이 읽는 %로 편집한다.
      width, colorSrgb: fields.outlineColor } });
}
export function studioToonEditorWidthMode(fields: StudioToonEditorFields, mode: StudioToonEditorFields["outlineMode"]): StudioToonEditorFields {
  const value = fields.width.trim() ? Number(fields.width) : NaN;
  const factor = fields.widthSource?.text === fields.width && fields.widthSource.mode === fields.outlineMode
    ? fields.widthSource.factor : value * (fields.outlineMode === "screenCoordinates" ? .02 : 1);
  const width = Number.isFinite(factor) ? String(factor * (mode === "screenCoordinates" ? 50 : 1)) : fields.width;
  return { ...fields, outlineMode: mode, width, widthSource: Number.isFinite(factor) ? { factor, text: width, mode } : undefined };
}

/** Eager-safe brush file sniffing (heavy parsers stay behind dynamic imports). */

export type StudioBrushPackFormat =
  | "abr"
  | "myb"
  | "kpp"
  | "sut"
  | "sutg"
  | "bundle"
  | "brushset"
  | "json";

export const STUDIO_BRUSH_PACK_ACCEPT =
  ".json,.abr,.myb,.kpp,.sut,.sutg,.bundle,.brushset,application/json,application/octet-stream,application/x-photoshop,image/png,application/zip,application/x-krita-resourcebundle,application/x-procreate-brushset";

export const STUDIO_BRUSH_PROGRAM_MAX_BYTES = 8 * 1024 * 1024;
export const STUDIO_EXTERNAL_BRUSH_PACK_MAX_BYTES = 128_000_000;

export function studioBrushPackFormatOf(
  fileName: string,
  mimeType = "",
): StudioBrushPackFormat | null {
  if (/\.abr$/iu.test(fileName) || mimeType === "application/x-photoshop") return "abr";
  if (/\.myb$/iu.test(fileName)) return "myb";
  if (/\.kpp$/iu.test(fileName)) return "kpp";
  if (/\.sut$/iu.test(fileName)) return "sut";
  if (/\.sutg$/iu.test(fileName)) return "sutg";
  if (/\.bundle$/iu.test(fileName) || mimeType === "application/x-krita-resourcebundle") return "bundle";
  if (/\.brushset$/iu.test(fileName) || mimeType === "application/x-procreate-brushset") return "brushset";
  if (/\.json$/iu.test(fileName) || mimeType === "application/json") return "json";
  return null;
}

import { z } from "zod";
import { StudioScopedWriteContextSchema } from "@toonstudio/contracts/studio-scoped-write";

/** JSON과 multipart에서 같은 명시적 context를 읽는다. 누락된 배정은 추정하지 않는다. */
export const StudioScopedAssetContextSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}, StudioScopedWriteContextSchema).optional();

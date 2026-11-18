import { guardPng as guardPngBytes } from "../../platform/images/guard-png";
import { COVER_MAX_DECODE_PIXELS, COVER_MAX_DECODE_RAW_BYTES } from "./cover-decode-limits";

export { PNG_SIGNATURE, type GuardedPng } from "../../platform/images/guard-png";

export function guardPng(body: Buffer) {
  return guardPngBytes(body, COVER_MAX_DECODE_PIXELS, COVER_MAX_DECODE_RAW_BYTES);
}

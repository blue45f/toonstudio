import { z } from "zod";
import { decodeStudioCrdtBinaryEnvelope } from "@toonstudio/contracts/studio-crdt-binary-envelope";
import type { StudioCrdtBinaryEnvelopeKind } from "@toonstudio/contracts/studio-crdt-binary-envelope";

const STUDIO_CRDT_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

export const encodedBase64 = (maximumDecodedBytes: number) =>
  z
    .string()
    .min(4)
    .max(Math.ceil(maximumDecodedBytes / 3) * 4)
    .regex(STUDIO_CRDT_BASE64_PATTERN)
    .refine(
      (value) => Buffer.from(value, "base64").toString("base64") === value,
      "base64 must use its canonical encoding"
    );

export const decodedBinaryEnvelope = (kind: StudioCrdtBinaryEnvelopeKind) =>
  z.unknown().transform((value, context): Uint8Array => {
    try {
      return decodeStudioCrdtBinaryEnvelope(value, kind).bytes;
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error
            ? error.message
            : `invalid ${kind} CRDT binary envelope`,
      });
      return z.NEVER;
    }
  });


import { CspToolFileError } from "./csp-sut-error";

import type { DynamicMappingIR } from "@toonstudio/studio-project-model";

export interface CspPressureGraph {
  version: number;
  count: number;
  stride: number;
  curve: number[];
}

export function parseCspPressureGraph(bytes: Uint8Array): CspPressureGraph {
  if (bytes.byteLength < 44) {
    throw new CspToolFileError("pressure graph is shorter than header + 2 taps", "pressure-graph-truncated");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(0, false);
  const count = view.getUint32(4, false);
  const stride = view.getUint32(8, false);
  const reserved = [
    view.getUint32(12, false),
    view.getUint32(16, false),
    view.getUint32(20, false),
    view.getUint32(24, false),
  ];
  if (version !== 1) {
    throw new CspToolFileError(
      `pressure graph version ${version} is unsupported (v1 only)`,
      "pressure-graph-unsupported-version",
    );
  }
  if (count < 2 || count > 4_096 || stride !== 8) {
    throw new CspToolFileError(
      `pressure graph count/stride ${count}/${stride} is unsupported`,
      "pressure-graph-invalid-header",
    );
  }
  if (reserved.some((value) => value !== 0)) {
    throw new CspToolFileError(
      "pressure graph reserved header words are non-zero",
      "pressure-graph-invalid-header",
    );
  }
  if (bytes.byteLength !== 28 + count * stride) {
    throw new CspToolFileError(
      `pressure graph length ${bytes.byteLength} does not match 28 + ${count}×${stride}`,
      "pressure-graph-truncated",
    );
  }
  const curve: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const value = view.getFloat64(28 + index * stride, false);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new CspToolFileError(
        `pressure graph tap ${index} is outside [0,1]`,
        "pressure-graph-value-out-of-range",
      );
    }
    curve.push(value);
  }
  return { version, count, stride, curve };
}

export function constantMapping(value: number): DynamicMappingIR {
  return { input: "constant", curve: [value, value], min: 0, max: 1 };
}

export function pressureMapping(curve: number[]): DynamicMappingIR {
  return { input: "pressure", curve, min: 0, max: 1 };
}

export function safeScalar(
  value: number | null,
  minimum: number,
  maximum: number,
): number | null {
  return value !== null && value >= minimum && value <= maximum ? value : null;
}

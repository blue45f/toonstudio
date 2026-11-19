interface GlbNodeInfo {
  readonly name: string;
  readonly skinned: boolean;
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
  readonly matrix?: readonly number[];
}

interface GlbInfo {
  readonly used: readonly string[];
  readonly required: readonly string[];
  readonly nodes: readonly GlbNodeInfo[];
}

/**
 * GLB JSON 청크에서 확장 목록과 노드 변환을 읽는다(형식이 틀리면 null — Babylon 로더가 `kit-glb-load-failed`로 알린다).
 * 스킨 메시 노드의 변환은 glTF 규약상 무시되어 Babylon 월드 행렬에 나타나지 않으므로 JSON에서 직접 확인한다.
 */
export function readGlbInfo(bytes: Uint8Array): GlbInfo | null {
  if (bytes.byteLength < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(16, true) !== 0x4e4f534a) return null;
  const length = view.getUint32(12, true);
  if (20 + length > bytes.byteLength) return null;
  try {
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as { extensionsUsed?: unknown; extensionsRequired?: unknown; nodes?: unknown };
    const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
    const numbers = (value: unknown): number[] | undefined => (Array.isArray(value) && value.every((item) => typeof item === "number") ? (value as number[]) : undefined);
    const nodes: GlbNodeInfo[] = [];
    if (Array.isArray(json.nodes)) {
      for (const raw of json.nodes as Array<Record<string, unknown>>) {
        const translation = numbers(raw.translation);
        const rotation = numbers(raw.rotation);
        const scale = numbers(raw.scale);
        const matrix = numbers(raw.matrix);
        nodes.push({
          name: typeof raw.name === "string" ? raw.name : "",
          skinned: raw.mesh !== undefined && raw.skin !== undefined,
          ...(translation ? { translation } : {}),
          ...(rotation ? { rotation } : {}),
          ...(scale ? { scale } : {}),
          ...(matrix ? { matrix } : {}),
        });
      }
    }
    return { used: strings(json.extensionsUsed), required: strings(json.extensionsRequired), nodes };
  } catch {
    return null;
  }
}

const NODE_EPSILON = 1e-6;

/** glTF 노드의 TRS/행렬이 항등인지 */
export function identityNode(node: GlbNodeInfo): boolean {
  const near = (values: readonly number[] | undefined, expected: readonly number[]): boolean => values === undefined || expected.every((value, index) => Math.abs((values[index] ?? Number.NaN) - value) <= NODE_EPSILON);
  const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return near(node.translation, [0, 0, 0]) && near(node.rotation, [0, 0, 0, 1]) && near(node.scale, [1, 1, 1]) && near(node.matrix, matrix);
}

/** 작업을 최대 `limit`개씩 동시에 돌린다. 하나가 실패하면 아직 시작하지 않은 항목은 시작하지 않고 첫 실패를 던진다. */

import type {
  CreatorMarketplaceJsonValue,
  CreatorMarketplaceResourceKind,
} from "./creator-marketplace-resource-contract";

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasPortableControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function inspectPortablePayload(
  payload: unknown
): { path: Array<string | number>; message: string } | null {
  const pending: Array<{
    value: unknown;
    path: Array<string | number>;
    depth: number;
  }> = [{ value: payload, path: [], depth: 0 }];
  const visitedObjects = new WeakSet<object>();
  let visited = 0;

  while (pending.length > 0) {
    const current = pending.pop()!;
    visited += 1;
    if (visited > 4_096) {
      return { path: current.path, message: "portable JSON 항목 수가 너무 많습니다." };
    }
    if (current.depth > 12) {
      return { path: current.path, message: "portable JSON 중첩 깊이가 너무 큽니다." };
    }
    if (typeof current.value === "string") {
      if (
        current.value.length > 1_000 ||
        hasPortableControlCharacter(current.value) ||
        /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(current.value.trim()) ||
        /^(?:\/\/|\\\\)/u.test(current.value.trim())
      ) {
        return {
          path: current.path,
          message: "portable JSON에는 제어문자, URI scheme, 원격 또는 protocol-relative 참조를 넣을 수 없습니다.",
        };
      }
      continue;
    }
    if (
      current.value === null ||
      typeof current.value === "boolean"
    ) continue;
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) {
        return { path: current.path, message: "portable JSON 숫자는 유한해야 합니다." };
      }
      continue;
    }
    if (typeof current.value !== "object") {
      return { path: current.path, message: "portable JSON 값 형식이 올바르지 않습니다." };
    }
    if (visitedObjects.has(current.value)) {
      return { path: current.path, message: "portable JSON에는 순환·공유 객체 참조를 넣을 수 없습니다." };
    }
    visitedObjects.add(current.value);

    if (Array.isArray(current.value)) {
      if (current.value.length > 256) {
        return { path: current.path, message: "portable JSON 배열 항목이 너무 많습니다." };
      }
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({
          value: current.value[index],
          path: [...current.path, index],
          depth: current.depth + 1,
        });
      }
      continue;
    }
    if (!isPlainRecord(current.value)) {
      return { path: current.path, message: "portable JSON에는 일반 객체만 사용할 수 있습니다." };
    }

    for (const [key, child] of Object.entries(current.value)) {
      if (!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/u.test(key)) {
        return {
          path: [...current.path, key],
          message: "portable JSON 키는 ASCII 식별자 형식이어야 합니다.",
        };
      }
      if (/^(?:data[-_]?url|base64|binary|blob|remote[-_]?url)$/iu.test(key)) {
        return {
          path: [...current.path, key],
          message: "portable JSON에는 바이너리 또는 원격 콘텐츠 필드를 넣을 수 없습니다.",
        };
      }
      pending.push({
        value: child,
        path: [...current.path, Array.isArray(current.value) ? Number(key) : key],
        depth: current.depth + 1,
      });
    }
  }
  return null;
}

export function inspectKindDefinition(
  kind: CreatorMarketplaceResourceKind,
  definition: Record<string, CreatorMarketplaceJsonValue>
): { path: Array<string | number>; message: string } | null {
  const keys = Object.keys(definition).sort();
  const exactKeys = (...expected: string[]) =>
    keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index]);
  const stableId = (value: unknown) =>
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/u.test(value);

  if (kind === "brush") {
    if (!exactKeys("snapshot") || !isPlainRecord(definition.snapshot) ||
      Object.keys(definition.snapshot).length === 0) {
      return {
        path: [],
        message: "브러시 definition은 비어 있지 않은 snapshot 객체 하나만 포함해야 합니다.",
      };
    }
    return null;
  }
  if (kind === "filter") {
    if (
      !exactKeys("engine", "values") ||
      !stableId(definition.engine) ||
      !isPlainRecord(definition.values) ||
      Object.keys(definition.values).length === 0
    ) {
      return {
        path: [],
        message: "필터 definition에는 engine과 비어 있지 않은 values 객체가 필요합니다.",
      };
    }
    return null;
  }
  if (kind === "palette") {
    if (!exactKeys("colors") || !Array.isArray(definition.colors) ||
      definition.colors.length < 1 || definition.colors.length > 64) {
      return { path: ["colors"], message: "팔레트에는 1~64개의 색상이 필요합니다." };
    }
    const colors = definition.colors;
    if (
      colors.some((color) => typeof color !== "string" || !/^#[0-9a-f]{6}$/u.test(color)) ||
      new Set(colors).size !== colors.length
    ) {
      return {
        path: ["colors"],
        message: "팔레트 색상은 중복 없는 소문자 #rrggbb 형식이어야 합니다.",
      };
    }
    return null;
  }
  if (kind === "template") {
    if (!exactKeys("templateId") || !stableId(definition.templateId)) {
      return {
        path: [],
        message: "템플릿 definition에는 안정적인 templateId 하나만 필요합니다.",
      };
    }
    return null;
  }
  if (
    !(
      exactKeys("recipeId") ||
      exactKeys("parameters", "recipeId")
    ) ||
    !stableId(definition.recipeId) ||
    (Object.hasOwn(definition, "parameters") && !isPlainRecord(definition.parameters))
  ) {
    return {
      path: [],
      message: "절차형 2D/3D definition에는 recipeId와 선택적 parameters 객체만 사용할 수 있습니다.",
    };
  }
  return null;
}

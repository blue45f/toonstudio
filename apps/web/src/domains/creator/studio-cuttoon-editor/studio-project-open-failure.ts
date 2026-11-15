export type StudioProjectOpenFailureKind =
  | "incompatible-version"
  | "missing-resource"
  | "invalid-format";

export function classifyStudioProjectOpenFailure(message: string): StudioProjectOpenFailureKind {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("version")
    || message.includes("버전")
    || message.includes("상위")
  ) {
    return "incompatible-version";
  }
  if (
    message.includes("없습니다")
    || message.includes("없어요")
    || message.includes("누락")
    || message.includes("포함하지 않")
    || normalized.includes("missing")
    || normalized.includes("attachment")
    || message.includes("3D pass")
    || message.includes("6패스")
  ) {
    return "missing-resource";
  }
  return "invalid-format";
}

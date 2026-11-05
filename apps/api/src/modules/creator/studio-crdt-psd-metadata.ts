/** Scene 요소와 보존 획은 같은 기존 PSD 참조 형식 검사를 사용한다. */
export function hasValidStudioPsdElementMetadata(props: Record<string, unknown>,
  boundedExactText: (value: unknown, maximum: number) => boolean,
  boundedString: (value: unknown, maximum: number) => boolean): boolean {
  if ("psdSource" in props) {
    const value = props.psdSource;
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const source = value as Record<string, unknown>;
    if (source.version !== 1 || typeof source.hash !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(source.hash)
      || !boundedExactText(source.name, 512) || typeof source.bytes !== "number" || !Number.isSafeInteger(source.bytes)
      || source.bytes < 26 || source.bytes > 128 * 1024 * 1024
      || Object.keys(source).some((key) => !["version", "hash", "name", "bytes"].includes(key))) return false;
  }
  for (const key of ["psdGroupId", "psdRasterSourceId"]) {
    if (key in props && !boundedExactText(props[key], 160)) return false;
  }
  if ("psdFolderPath" in props) {
    const path = props.psdFolderPath;
    if (!Array.isArray(path) || path.length > 64 || path.some((entry: unknown) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return true;
      const folder = entry as Record<string, unknown>;
      return !boundedExactText(folder.id, 160) || !boundedString(folder.name, 512)
        || Object.keys(folder).some((key) => key !== "id" && key !== "name");
    })) return false;
  }
  return true;
}

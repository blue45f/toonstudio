/** source entry를 쓰는 엔진은 그 정본으로, 수동 청크를 쓰는 엔진은 기존 청크 이름으로 식별한다. */
export function isStudioSpecialistRuntimeEntry(key, entry, {
  runtimeEntrySource,
  runtimeChunkName,
}) {
  if (runtimeEntrySource !== undefined) {
    return key === runtimeEntrySource || entry.src === runtimeEntrySource;
  }
  return key.includes(runtimeChunkName) || entry.file?.includes(runtimeChunkName) === true;
}

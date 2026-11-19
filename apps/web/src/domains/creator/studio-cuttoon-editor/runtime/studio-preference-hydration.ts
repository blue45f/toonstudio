/** 초기 읽기 중 사용자가 편집했으면 현재 값을 저장해 뒤늦은 결과로 덮어쓰지 않는다. */
export async function hydrateStudioPreference<T>(
  result: PromiseSettledResult<T>,
  revisionUnchanged: boolean,
  applySaved: (saved: T) => void,
  saveCurrent: () => Promise<void>,
): Promise<boolean> {
  if (revisionUnchanged) {
    if (result.status === "rejected") return false;
    applySaved(result.value);
    return true;
  }
  try {
    await saveCurrent();
    return true;
  } catch {
    return false;
  }
}

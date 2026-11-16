/** 실제 어댑터 정보를 실패 증거와 성공 보고에 같은 형태로 기록한다. */
export function adapterInfo(adapter: GPUAdapter) {
  const info = adapter.info;
  return {
    vendor: String(info?.vendor ?? ""),
    architecture: String(info?.architecture ?? ""),
    device: String(info?.device ?? ""),
    description: String(info?.description ?? ""),
    isFallbackAdapter:
      typeof adapter.isFallbackAdapter === "boolean"
        ? adapter.isFallbackAdapter
        : null,
  };
}


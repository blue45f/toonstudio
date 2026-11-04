import { useEffect, useState } from "react";

/** 권한·quota를 올리지 않고 실제 문서 저장 경로가 준비된 경우만 분리 캡처를 연다. */
export function useStudioBg3dSixPassDocumentCapability(workId: string | null, master: boolean, enabled: boolean): string | null {
  const [result, setResult] = useState<{ key: string; reason: string | null } | null>(null);
  const key = `${workId ?? "origin"}:${master}`;
  useEffect(() => {
    if (!enabled || master) return;
    let active = true;
    void (async () => {
      const authority = await import("../../../scene3d/bg3d-six-pass/studio-bg3d-six-pass-bundle-product-authority");
      await authority.acquireStudioBg3dSixPassBundleProductAuthority();
      if (workId) {
        const api = await import("../../../scene3d/bg3d-six-pass/studio-bg3d-six-pass-bundle-api");
        const capabilities = await api.getStudioBg3dSixPassRemoteCapabilities(workId);
        if (!capabilities.enabled) throw new Error("이 작품의 서버는 아직 6패스 원본 묶음 저장을 지원하지 않습니다. 일반 LT를 사용할 수 있습니다.");
      }
      if (active) setResult({ key, reason: null });
    })().catch((cause: unknown) => {
      if (active) setResult({ key, reason: cause instanceof Error ? cause.message : "6패스 원본 저장 경로를 확인하지 못했습니다." });
    });
    return () => { active = false; };
  }, [enabled, key, master, workId]);
  if (master) return "문서 마스터는 6패스 분리 묶음을 지원하지 않습니다. 일반 원고 페이지에서 사용하세요.";
  return result?.key === key ? result.reason : "6패스 원본의 문서 저장 경로를 확인하고 있습니다.";
}

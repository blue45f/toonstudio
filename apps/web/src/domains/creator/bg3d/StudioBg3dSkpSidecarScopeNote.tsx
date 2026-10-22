import { useT } from "@/shared/lib/i18n";

/**
 * .skp 가져오기가 이름만 이어 준다는 범위 안내. 가져오기 안내와 변환 보고서의 자세히 보기가 같은 문장을 쓴다.
 * 컴포넌트 계층·태그(레이어) 표시 상태·장면(카메라)을 되살린다는 인상을 주지 않는 것이 이 문장의 일이다.
 */
export function StudioBg3dSkpSidecarScopeNote() {
  const t = useT();
  return (
    <span data-studio-bg3d-skp-sidecar-scope="">
      {t(
        "studio.bg3dScene.skp.importScope",
        "가져온 컴포넌트·태그·장면 이름은 배치한 모델에 이름으로만 연결돼요. 컴포넌트 계층, 태그(레이어) 표시 상태, 장면(카메라)은 되살리지 않고, 장면 이름은 메모 후보로만 보여 줘요.",
      )}
    </span>
  );
}

import { lazy, Suspense } from "react";

import type { StudioCharmBarSlotProps } from "./StudioCharmBarSlot";

/**
 * 참 바 슬롯의 지연 경계.
 *
 * 슬롯(상태 저장소·호스트 브리지·도킹)은 본체와 달리 편집기를 열 때마다 필요하지 않다 — 참 바는 템플릿·에셋 메뉴에서
 * 켜야 쓰는 선택 기능이다. 그래서 슬롯째 Studio 진입 그래프에서 빼고, 작업공간이 마운트된 뒤에 받는다. 정적으로
 * 가져오면 슬롯과 순수 모듈 8개(약 45 KiB 원본)가 편집기의 첫 청크 그래프에 묶여 번들 래칫(`check:studio-bundle`)을 깬다.
 *
 * 참 바는 편집을 돕는 부가 기능이므로, 슬롯 청크를 받지 못해도(예: 새 배포 직후의 낡은 청크) 편집기는 그대로 두고
 * 아무것도 그리지 않는다. 낡은 청크를 고치려고 페이지를 자동으로 다시 불러오지도 않는다 — 작업 중인 편집기를
 * 부가 기능 때문에 새로 고치면 안 된다. 타입은 `import type` 이라 이 파일이 슬롯을 정적으로 끌어오지 않는다.
 */
const LazyStudioCharmBarSlot = lazy(() =>
  import("./StudioCharmBarSlot")
    .then((module) => ({ default: module.StudioCharmBarSlot }))
    .catch(() => ({ default: () => null })),
);

export function StudioCharmBarSlotLazy(props: StudioCharmBarSlotProps) {
  return (
    <Suspense fallback={null}>
      <LazyStudioCharmBarSlot {...props} />
    </Suspense>
  );
}

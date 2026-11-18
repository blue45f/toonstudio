import type { ComponentProps } from "react";

type ScrollRegionProps = Pick<ComponentProps<"div">, "aria-label" | "aria-labelledby" | "children" | "className">;

export function StudioSpaceScrollRegion(props: ScrollRegionProps) {
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 표와 목록이 넘칠 때 키보드로 스크롤할 수 있도록 이름 있는 영역 자체가 포커스를 받는다.
  return <div {...props} role="region" tabIndex={0} />;
}

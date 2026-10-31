import { useLayoutEffect, useRef, useState, type KeyboardEventHandler, type ReactNode } from "react";

import {
  createStudioCreateSubmitController,
  type StudioCreateSubmitState,
} from "./studio-create-submit-controller";

interface StudioCreateKeyboardFormProps extends StudioCreateSubmitState {
  readonly label: string;
  readonly onCreate: () => boolean;
  readonly onFixName: () => void;
  readonly onFixSize: () => void;
  readonly children: (onInputKeyDown: KeyboardEventHandler<HTMLInputElement>) => ReactNode;
}

/** 입력·클릭의 제출 경계를 통일한다. 접기·선택 컨트롤은 본래 키보드 동작을 유지한다. */
export function StudioCreateKeyboardForm(props: StudioCreateKeyboardFormProps) {
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; }, [props]);
  const [controller] = useState(() => createStudioCreateSubmitController({
    state: () => latest.current,
    create: () => latest.current.onCreate(),
    fixName: () => latest.current.onFixName(),
    fixSize: () => latest.current.onFixSize(),
  }));

  return (
    <form noValidate aria-label={props.label} data-studio-create-form="true"
      className="mx-auto max-w-6xl"
      onCompositionStart={controller.compositionStart}
      onCompositionEnd={controller.compositionEnd}
      onSubmit={(event) => controller.submit(event.nativeEvent)}>
      {props.children((event) => controller.keyDown(event.nativeEvent))}
    </form>
  );
}

import { events, type EventManager, type RootStore } from "@react-three/fiber";

export type Studio3dPointerEvents = EventManager<HTMLElement> & {
  connect: (target: HTMLElement | null) => void;
};

/** 대기 중이던 Canvas.onCreated가 닫힌 편집기나 분리된 캔버스에 포인터를 연결하지 않도록 한다. */
export function createStudio3dPointerEvents(store: RootStore): Studio3dPointerEvents {
  const manager = events(store);
  return {
    ...manager,
    connect(target) {
      if (!target?.isConnected) {
        manager.disconnect?.();
        return;
      }
      manager.connect?.(target);
    },
  };
}

import { expect, it } from "vitest";

import { createPresetCatalog } from "../contracts";
import { vocabularyCatalogEntries } from "../testing/recipe-fixtures";

import { createLabStore } from "./lab-store";

it("세션 포즈 병합은 다른 명령·undo/redo 경계를 넘어 이전 입력에 합쳐지지 않는다", () => {
  let at = 0;
  const store = createLabStore({ catalog: createPresetCatalog(vocabularyCatalogEntries()), now: () => at });
  const set = (amount: number) => { at += 8000; store.dispatch({ type: "pose/set", pose: { leftIndexProximal: [amount, 0, 0, Math.sqrt(1 - amount * amount)] }, scope: "left-hand", labelKo: "손 추적", coalesceKey: "live-A", coalesceMode: "session" }); };
  set(0.1); set(0.2); expect(store.getState().history.depth).toBe(1);
  store.dispatch({ type: "color/set", key: "skin", value: "#aabbcc" });
  set(0.3); expect(store.getState().history.depth).toBe(3);
  store.dispatch({ type: "history/undo" });
  expect(store.getState().recipe.pose.leftIndexProximal?.[0]).toBe(0.2);
  store.dispatch({ type: "history/redo" });
  set(0.4); expect(store.getState().history.depth).toBe(4);
  store.dispatch({ type: "history/undo" });
  expect(store.getState().recipe.pose.leftIndexProximal?.[0]).toBe(0.3);
});

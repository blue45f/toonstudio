import { afterEach, describe, expect, it } from "vitest";

import { i18nDict, useI18n } from "@/shared/lib/i18n";
import {
  STUDIO_COPLANAR_EDGE_DISSOLVE_MESSAGE_KEYS, studioCoplanarEdgeDissolveCommandLabel,
  studioCoplanarEdgeDissolveError, studioCoplanarEdgeDissolveNotice,
} from "./studio-hybrid-dcc-coplanar-edge-dissolve-messages";
import { StudioCoplanarEdgeDissolveWorkspaceError } from "./studio-hybrid-dcc-coplanar-edge-dissolve-workspace";
import { StudioCoplanarEdgeDissolveWorkerError } from "./studio-hybrid-dcc-coplanar-edge-dissolve-worker-client";

const originalLanguage = useI18n.getState().lang;
afterEach(() => useI18n.setState({ lang: originalLanguage }));

describe("공유 모서리 치유의 정본 번역과 오류 경계", () => {
  it.each(Object.values(STUDIO_COPLANAR_EDGE_DISSOLVE_MESSAGE_KEYS))("%s는 ko/en 정본에 서로 다른 문구를 가진다", (key) => {
    const ko = i18nDict.ko?.[key], en = i18nDict.en?.[key];
    expect(ko).toEqual(expect.any(String)); expect(en).toEqual(expect.any(String));
    expect(ko?.trim()).not.toBe(""); expect(en?.trim()).not.toBe(""); expect(ko).not.toBe(en);
  });

  it("실패한 정본 계획의 내부 진단은 노출하지 않고 호출 시점 언어로 안내한다", () => {
    const cause = new StudioCoplanarEdgeDissolveWorkspaceError("invalid-result", "내부 원본 해시 진단");
    useI18n.setState({ lang: "en" });
    const english = studioCoplanarEdgeDissolveError(cause);
    expect(english).toBe(i18nDict.en?.[STUDIO_COPLANAR_EDGE_DISSOLVE_MESSAGE_KEYS["invalid-result"]]);
    expect(english).not.toContain(cause.detail);
    useI18n.setState({ lang: "ko" });
    const korean = studioCoplanarEdgeDissolveError(cause);
    expect(korean).toBe(i18nDict.ko?.[STUDIO_COPLANAR_EDGE_DISSOLVE_MESSAGE_KEYS["invalid-result"]]);
    expect(korean).not.toBe(english); expect(cause.detail).toBe("내부 원본 해시 진단");
  });

  it("직접 계산 경계 오류와 알 수 없는 오류도 내부 내용을 화면에 그대로 쓰지 않는다", () => {
    useI18n.setState({ lang: "en" });
    const cause = new StudioCoplanarEdgeDissolveWorkerError("timeout");
    expect(studioCoplanarEdgeDissolveError(cause)).toBe(i18nDict.en?.[STUDIO_COPLANAR_EDGE_DISSOLVE_MESSAGE_KEYS.timeout]);
    expect(studioCoplanarEdgeDissolveError(new Error("공개하지 않을 내부 진단")))
      .toBe(studioCoplanarEdgeDissolveNotice("preparationFailed"));
  });

  it("완료 안내와 명령 제목은 같은 언어를 사용한다", () => {
    for (const lang of ["ko", "en"]) {
      useI18n.setState({ lang });
      expect(studioCoplanarEdgeDissolveNotice("applied")).toBe(i18nDict[lang]?.["studio.bg3dScene.coplanarEdgeHeal.notice.applied"]);
      expect(studioCoplanarEdgeDissolveCommandLabel()).toBe(i18nDict[lang]?.["studio.bg3dScene.coplanarEdgeHeal.title"]);
    }
  });
});

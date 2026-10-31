import { afterEach, describe, expect, it } from "vitest";

import { i18nDict, useI18n } from "@/shared/lib/i18n";
import {
  STUDIO_BOUNDARY_CHORD_MESSAGE_KEYS,
  studioBoundaryChordCommandLabel,
  studioBoundaryChordMessage,
  studioBoundaryChordNotice,
} from "./studio-hybrid-dcc-boundary-chord-messages";
import { StudioBoundaryChordWorkerError } from "./studio-hybrid-dcc-boundary-chord-worker-client";
import { StudioBoundaryChordWorkspaceError } from "./studio-hybrid-dcc-boundary-chord-workspace";

const initialLanguage = useI18n.getState().lang;
afterEach(() => { useI18n.setState({ lang: initialLanguage }); });

describe("면 나누기의 정본 번역 키와 호출 시점 언어", () => {
  it.each(Object.values(STUDIO_BOUNDARY_CHORD_MESSAGE_KEYS))("%s의 ko/en 문구가 정본 사전에 존재한다", (key) => {
    const ko = i18nDict.ko?.[key], en = i18nDict.en?.[key];
    expect(ko).toEqual(expect.any(String)); expect(en).toEqual(expect.any(String));
    expect(ko?.trim()).not.toBe(""); expect(en?.trim()).not.toBe("");
    expect(ko).not.toBe(en);
  });

  it("같은 실패 코드도 호출 시점 언어를 사용하고 내부 진단을 화면에 노출하지 않는다", () => {
    const key = STUDIO_BOUNDARY_CHORD_MESSAGE_KEYS["invalid-result"];
    useI18n.setState({ lang: "en" });
    const english = new StudioBoundaryChordWorkspaceError("invalid-result", "내부 source 해시 진단");
    expect(english.message).toBe(i18nDict.en?.[key]);
    expect(english.reasonKo).toBe("내부 source 해시 진단");
    expect(english.message).not.toContain("source");

    useI18n.setState({ lang: "ko" });
    const korean = new StudioBoundaryChordWorkspaceError("invalid-result", "다른 내부 진단");
    expect(korean.message).toBe(i18nDict.ko?.[key]);
    expect(korean.message).not.toBe(english.message);
    expect(korean.code).toBe(english.code);
  });

  it("계산 오류의 이름과 코드는 언어를 바꿔도 유지한다", () => {
    for (const lang of ["ko", "en"]) {
      useI18n.setState({ lang });
      const aborted = new StudioBoundaryChordWorkerError("aborted");
      expect(aborted.name).toBe("AbortError"); expect(aborted.code).toBe("aborted");
      expect(aborted.message).toBe(i18nDict[lang]?.[STUDIO_BOUNDARY_CHORD_MESSAGE_KEYS.aborted]);
      const timeout = new StudioBoundaryChordWorkerError("timeout", true);
      expect(timeout.name).toBe("TimeoutError"); expect(timeout.code).toBe("timeout");
      expect(timeout.cleanupFailed).toBe(true);
      expect(timeout.message).toBe(i18nDict[lang]?.[STUDIO_BOUNDARY_CHORD_MESSAGE_KEYS.timeout]);
    }
  });

  it("끝점 거부·완료 안내·명령 제목도 같은 언어의 키로 해소한다", () => {
    for (const lang of ["ko", "en"]) {
      useI18n.setState({ lang });
      expect(studioBoundaryChordMessage("outside-face"))
        .toBe(i18nDict[lang]?.[STUDIO_BOUNDARY_CHORD_MESSAGE_KEYS["outside-face"]]);
      expect(studioBoundaryChordNotice("applied"))
        .toBe(i18nDict[lang]?.["studio.bg3dScene.boundaryChord.notice.applied"]);
      expect(studioBoundaryChordCommandLabel())
        .toBe(i18nDict[lang]?.["studio.bg3dScene.boundaryChord.title"]);
    }
  });
});

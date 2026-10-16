// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { EXTRA_POSE_PRESETS, NATURAL_IDLE_POSES } from "../studio-pose-presets";

import {
  WebtoonCutPoseSuggestionPanel,
  type WebtoonCutPoseSuggestionPanelProps,
} from "./WebtoonCutPoseSuggestionPanel";
import { poseCandidatesFromPresets } from "./webtoon-cut-pose-suggestion";

import type { CutPoseTarget } from "./studio-webtoon-assistant-cut-pose";
import type { CutPoseCatalogState } from "./use-cut-pose-catalog";

const READY: CutPoseCatalogState = {
  status: "ready",
  entries: poseCandidatesFromPresets(NATURAL_IDLE_POSES, EXTRA_POSE_PRESETS),
};

const RAGE_CUT = { emotion: "rage", shotScale: "full-shot", cameraAngle: "low-angle" } as const;
const NO_DATA = { emotion: null, shotScale: null, cameraAngle: null } as const;

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function target(overrides: Partial<CutPoseTarget> = {}): CutPoseTarget {
  return { pageId: "page-3", pageLabel: "3페이지", currentPoseId: null, ...overrides };
}

function renderPanel(overrides: Partial<WebtoonCutPoseSuggestionPanelProps> = {}) {
  const props: WebtoonCutPoseSuggestionPanelProps = {
    initial: RAGE_CUT,
    cutLabel: "컷 7",
    catalog: READY,
    onRetryCatalog: vi.fn(),
    target: target(),
    onApplyPose: vi.fn(() => true),
    ...overrides,
  };
  return { props, ...render(<WebtoonCutPoseSuggestionPanel {...props} />) };
}

describe("WebtoonCutPoseSuggestionPanel — suggestions", () => {
  it("shows the top three poses with rank, fit score and Korean reasons", () => {
    renderPanel();
    const ranked = ["xp_guard_up", "xp_kick", "xp_point_you"].map((id) =>
      screen.getByTestId(`cut-pose-suggestion-${id}`),
    );
    expect(screen.getByTestId("cut-pose-suggestion-list").querySelectorAll(":scope > li")).toHaveLength(3);
    expect(within(ranked[0]).getByText("싸움 자세(가드)")).toBeTruthy();
    expect(within(ranked[0]).getByText("적합도 100")).toBeTruthy();
    expect(within(ranked[2]).getByText("적합도 93")).toBeTruthy();
    expect(within(ranked[0]).getByText(/분노 컷에 가장 잘 어울리는 동작으로 분류했어요/)).toBeTruthy();
    expect(within(ranked[0]).getByText(/풀 샷에서 동작이 잘 읽혀요/)).toBeTruthy();
    expect(within(ranked[0]).getByText(/로우 앵글에서 실루엣이 살아요/)).toBeTruthy();
  });

  it("states that the score is a heuristic and which weights it uses", () => {
    renderPanel();
    expect(screen.getByText("휴리스틱 점수")).toBeTruthy();
    expect(screen.getByText(/감정 60% · 샷 크기 25% · 앵글 15%/)).toBeTruthy();
  });

  it("prefills the three selects from the cut and re-ranks when the artist changes them", () => {
    renderPanel();
    expect((screen.getByLabelText("감정") as HTMLSelectElement).value).toBe("rage");
    expect((screen.getByLabelText("샷 크기") as HTMLSelectElement).value).toBe("full-shot");
    expect((screen.getByLabelText("카메라 앵글") as HTMLSelectElement).value).toBe("low-angle");

    fireEvent.change(screen.getByLabelText("감정"), { target: { value: "joy" } });
    expect(screen.queryByTestId("cut-pose-suggestion-xp_guard_up")).toBeNull();
    expect(screen.getByTestId("cut-pose-suggestion-xp_jump_joy")).toBeTruthy();

    // 모르는 값으로 되돌리면 샷·앵글 이유 문구는 사라지고 감정 이유만 남는다
    fireEvent.change(screen.getByLabelText("샷 크기"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("카메라 앵글"), { target: { value: "" } });
    const first = screen.getByTestId("cut-pose-suggestion-list").querySelector("li");
    expect(first?.textContent).toContain("기쁨 컷에");
    expect(first?.textContent).not.toContain("잘 읽혀요");
    expect(first?.textContent).not.toContain("실루엣");
  });

  it("asks for an emotion instead of inventing one when the cut has none", () => {
    renderPanel({ initial: NO_DATA });
    expect(screen.getByTestId("cut-pose-need-emotion").textContent).toContain("감정 정보가 없어요");
    expect(screen.queryByTestId("cut-pose-suggestion-list")).toBeNull();
    fireEvent.change(screen.getByLabelText("감정"), { target: { value: "sorrow" } });
    expect(screen.queryByTestId("cut-pose-need-emotion")).toBeNull();
    expect(within(screen.getByTestId("cut-pose-suggestion-list")).getAllByRole("button")).toHaveLength(3);
  });

  it("falls back to an empty state when nothing matches the chosen conditions", () => {
    renderPanel({ catalog: { status: "ready", entries: [{ id: "custom_pose", label: "x", tone: "y" }] } });
    expect(screen.getByText("조건에 맞는 포즈가 없어요")).toBeTruthy();
  });

  it("renders English copy when the language is English", () => {
    useI18n.getState().setLang("en");
    renderPanel();
    expect(screen.getByText("Heuristic score")).toBeTruthy();
    // 상위 세 포즈가 모두 분노 컷의 대표 동작이라 같은 이유 문구가 세 번 보인다
    expect(screen.getAllByText(/Classified as the best fit for a Rage beat/)).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Apply to '3페이지': 싸움 자세(가드)" })).toBeTruthy();
  });
});

describe("WebtoonCutPoseSuggestionPanel — catalog states", () => {
  it("announces loading without showing stale suggestions", () => {
    renderPanel({ catalog: { status: "loading" } });
    const status = screen.getByText("포즈 목록을 불러오는 중…").closest("[role='status']");
    expect(status).not.toBeNull();
    expect(status?.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByTestId("cut-pose-suggestion-list")).toBeNull();
  });

  it("shows an alert with a retry button when the catalog fails, and retry calls back", () => {
    const { props } = renderPanel({ catalog: { status: "error" } });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("포즈 목록을 불러오지 못했어요");
    expect(alert.textContent).toContain("긴장도 곡선은 그대로 볼 수 있어요");
    fireEvent.click(within(alert).getByRole("button", { name: "다시 시도" }));
    expect(props.onRetryCatalog).toHaveBeenCalledTimes(1);
  });

  it("does not show a loading or error state when no emotion is chosen yet", () => {
    renderPanel({ initial: NO_DATA, catalog: { status: "loading" } });
    expect(screen.queryByText("포즈 목록을 불러오는 중…")).toBeNull();
    expect(screen.getByTestId("cut-pose-need-emotion")).toBeTruthy();
  });
});

describe("WebtoonCutPoseSuggestionPanel — explicit apply and undo", () => {
  it("never applies on its own: rendering and changing inputs do not call onApplyPose", () => {
    const { props } = renderPanel();
    fireEvent.change(screen.getByLabelText("샷 크기"), { target: { value: "close-up" } });
    fireEvent.change(screen.getByLabelText("감정"), { target: { value: "shock" } });
    expect(props.onApplyPose).not.toHaveBeenCalled();
  });

  it("applies one pose only when its button is pressed, naming the target page", () => {
    const { props } = renderPanel();
    const buttons = screen.getAllByRole("button", { name: /^'3페이지'에 적용: / });
    expect(buttons).toHaveLength(3);
    expect(buttons[0].textContent).toContain("'3페이지'에 적용");
    fireEvent.click(buttons[1]);
    expect(props.onApplyPose).toHaveBeenCalledTimes(1);
    expect(props.onApplyPose).toHaveBeenCalledWith("page-3", "xp_kick");
    expect(screen.getByTestId("cut-pose-notice").textContent).toContain("'3페이지'에 포즈를 적용했어요: 킥");
  });

  it("explains where the pose goes and that undo is available through the editor", () => {
    renderPanel({ target: target({ currentPoseId: "xp_sprint" }) });
    expect(screen.getByTestId("cut-pose-target").textContent).toContain("'3페이지'");
    expect(screen.getByTestId("cut-pose-target").textContent).toContain("현재 포즈: 전력 질주");
    expect(screen.getByText(/자동으로 적용되지 않아요/)).toBeTruthy();
    expect(screen.getByText(/편집기의 실행 취소로도 되돌릴 수 있어요/)).toBeTruthy();
  });

  /** 호스트처럼 페이지의 현재 포즈를 소유하는 래퍼 — 적용 결과가 prop 으로 되돌아온다. */
  function Host(props: { readonly onCommit: (pageId: string, presetId: string | null) => boolean }) {
    const [pose, setPose] = useState<string | null>(null);
    return (
      <WebtoonCutPoseSuggestionPanel
        initial={RAGE_CUT}
        cutLabel="컷 7"
        catalog={READY}
        onRetryCatalog={() => {}}
        target={target({ currentPoseId: pose })}
        onApplyPose={(pageId, presetId) => {
          const ok = props.onCommit(pageId, presetId);
          if (ok) setPose(presetId);
          return ok;
        }}
      />
    );
  }

  it("offers undo after an apply, restores the previous pose through the same commit, then hides it", () => {
    const commits: (string | null)[] = [];
    render(
      <Host
        onCommit={(_pageId, presetId) => {
          commits.push(presetId);
          return true;
        }}
      />,
    );
    expect(screen.queryByTestId("cut-pose-undo")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /^'3페이지'에 적용: / })[0]);
    expect(commits).toEqual(["xp_guard_up"]);
    expect(screen.getByTestId("cut-pose-target").textContent).toContain("현재 포즈: 싸움 자세(가드)");

    // 적용된 카드는 눌린 상태(적용됨)로 보이고 같은 포즈를 또 커밋하지 않는다
    const applied = screen.getByRole("button", { name: "적용됨: 싸움 자세(가드) ('3페이지')" });
    expect(applied.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(applied);
    expect(commits).toEqual(["xp_guard_up"]);

    fireEvent.click(screen.getByTestId("cut-pose-undo"));
    expect(commits).toEqual(["xp_guard_up", null]);
    expect(screen.queryByTestId("cut-pose-undo")).toBeNull();
    expect(screen.getByTestId("cut-pose-notice").textContent).toContain("이전 상태로 되돌렸어요");
    expect(screen.getByTestId("cut-pose-target").textContent).toContain("현재 포즈: 없음");
  });

  it("restores the pose that was there before, not just 'none'", () => {
    const commits: (string | null)[] = [];
    function Seeded() {
      const [pose, setPose] = useState<string | null>("xp_sprint");
      return (
        <WebtoonCutPoseSuggestionPanel
          initial={RAGE_CUT}
          cutLabel="컷 7"
          catalog={READY}
          onRetryCatalog={() => {}}
          target={target({ currentPoseId: pose })}
          onApplyPose={(_pageId, presetId) => {
            commits.push(presetId);
            setPose(presetId);
            return true;
          }}
        />
      );
    }
    render(<Seeded />);
    fireEvent.click(screen.getAllByRole("button", { name: /^'3페이지'에 적용: / })[1]);
    fireEvent.click(screen.getByTestId("cut-pose-undo"));
    expect(commits).toEqual(["xp_kick", "xp_sprint"]);
  });

  it("drops the undo button when the page's pose was changed by someone else, instead of overwriting it", () => {
    const { rerender, props } = renderPanel({ target: target({ currentPoseId: null }) });
    fireEvent.click(screen.getAllByRole("button", { name: /^'3페이지'에 적용: / })[0]);
    // 호스트가 방금 적용한 값을 반영한 상태
    rerender(
      <WebtoonCutPoseSuggestionPanel {...props} target={target({ currentPoseId: "xp_guard_up" })} />,
    );
    expect(screen.getByTestId("cut-pose-undo")).toBeTruthy();
    // 그 뒤 다른 곳에서 포즈가 바뀜 → 되돌리기가 그 변경을 덮으면 안 된다
    rerender(
      <WebtoonCutPoseSuggestionPanel {...props} target={target({ currentPoseId: "xp_dance" })} />,
    );
    expect(screen.queryByTestId("cut-pose-undo")).toBeNull();
  });

  it("reports a refused commit as an alert and leaves no undo behind", () => {
    renderPanel({ onApplyPose: vi.fn(() => false) });
    fireEvent.click(screen.getAllByRole("button", { name: /^'3페이지'에 적용: / })[0]);
    const alert = screen.getByTestId("cut-pose-notice");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("포즈를 적용하지 못했어요");
    expect(screen.queryByTestId("cut-pose-undo")).toBeNull();
  });

  it("offers no apply button, only an explanation, when the host gave no way to commit", () => {
    renderPanel({ onApplyPose: undefined });
    expect(screen.queryAllByRole("button", { name: /에 적용/ })).toHaveLength(0);
    expect(screen.getByTestId("cut-pose-no-target").textContent).toContain("적용할 수 없어요");
    expect(screen.getByTestId("cut-pose-suggestion-xp_guard_up")).toBeTruthy();
  });

  it("offers no apply button when there is no page to target", () => {
    renderPanel({ target: null });
    expect(screen.queryAllByRole("button", { name: /에 적용/ })).toHaveLength(0);
    expect(screen.getByTestId("cut-pose-no-target")).toBeTruthy();
  });
});

describe("WebtoonCutPoseSuggestionPanel — moving between cuts", () => {
  const SHOCK_CUT = { emotion: "shock", shotScale: "extreme-close-up", cameraAngle: "eye-level" } as const;
  const select = (label: string): HTMLSelectElement => screen.getByLabelText(label) as HTMLSelectElement;

  it("refills the three inputs from the newly selected cut and drops the manual edits made on the previous one", () => {
    const { rerender, props } = renderPanel({ resetKey: "script|plan-7" });
    fireEvent.change(select("감정"), { target: { value: "joy" } });
    fireEvent.change(select("샷 크기"), { target: { value: "" } });
    expect(select("감정").value).toBe("joy");

    rerender(<WebtoonCutPoseSuggestionPanel {...props} resetKey="script|plan-8" initial={SHOCK_CUT} />);
    expect(select("감정").value).toBe("shock");
    expect(select("샷 크기").value).toBe("extreme-close-up");
    expect(select("카메라 앵글").value).toBe("eye-level");
  });

  it("refills even when the next cut happens to carry the same three values, because it is a different cut", () => {
    const { rerender, props } = renderPanel({ resetKey: "script|plan-7" });
    fireEvent.change(select("감정"), { target: { value: "joy" } });
    rerender(<WebtoonCutPoseSuggestionPanel {...props} resetKey="script|plan-9" />);
    expect(select("감정").value).toBe("rage");
  });

  it("keeps a manual edit while the same cut stays selected, even if the parent passes a fresh object of equal values", () => {
    const { rerender, props } = renderPanel({ resetKey: "script|plan-7" });
    fireEvent.change(select("감정"), { target: { value: "joy" } });
    rerender(<WebtoonCutPoseSuggestionPanel {...props} initial={{ ...RAGE_CUT }} />);
    expect(select("감정").value).toBe("joy");
  });

  it("does not turn an explicit 'not set' back into the cut's own value on the next render", () => {
    const { rerender, props } = renderPanel({ resetKey: "script|plan-7" });
    fireEvent.change(select("카메라 앵글"), { target: { value: "" } });
    rerender(<WebtoonCutPoseSuggestionPanel {...props} />);
    expect(select("카메라 앵글").value).toBe("");
  });

  it("keeps the undo and the notice when another cut is selected, and the undo still restores the page", () => {
    const commits: (string | null)[] = [];
    function CutSwitchHost() {
      const [pose, setPose] = useState<string | null>(null);
      const [cut, setCut] = useState<"rage" | "shock">("rage");
      return (
        <>
          <button type="button" onClick={() => setCut("shock")}>
            다른 컷 고르기
          </button>
          <WebtoonCutPoseSuggestionPanel
            resetKey={`script|${cut}`}
            initial={cut === "rage" ? RAGE_CUT : SHOCK_CUT}
            cutLabel={cut === "rage" ? "컷 7" : "컷 5"}
            catalog={READY}
            onRetryCatalog={() => {}}
            target={target({ currentPoseId: pose })}
            onApplyPose={(_pageId, presetId) => {
              commits.push(presetId);
              setPose(presetId);
              return true;
            }}
          />
        </>
      );
    }
    render(<CutSwitchHost />);
    fireEvent.click(screen.getAllByRole("button", { name: /^'3페이지'에 적용: / })[0]);
    expect(commits).toEqual(["xp_guard_up"]);

    fireEvent.click(screen.getByRole("button", { name: "다른 컷 고르기" }));
    expect(select("감정").value).toBe("shock");
    expect(screen.getByTestId("cut-pose-notice").textContent).toContain("'3페이지'에 포즈를 적용했어요");
    const undo = screen.getByTestId("cut-pose-undo");

    fireEvent.click(undo);
    expect(commits).toEqual(["xp_guard_up", null]);
    expect(screen.getByTestId("cut-pose-target").textContent).toContain("현재 포즈: 없음");
  });
});

describe("WebtoonCutPoseSuggestionPanel — keyboard and labels", () => {
  it("labels every control and keeps the controls reachable as native form elements", () => {
    renderPanel();
    for (const name of ["감정", "샷 크기", "카메라 앵글"]) {
      const select = screen.getByLabelText(name);
      expect(select.tagName).toBe("SELECT");
      expect(select.tabIndex).toBe(0);
    }
    for (const button of screen.getAllByRole("button")) {
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("type")).toBe("button");
      expect(button.tabIndex).toBe(0);
    }
  });

  it("marks cautions for assistive tech and does not hide them in colour alone", () => {
    // 분노 포즈는 모두 로우·더치 앵글 특성이라 하이 앵글 컷에서는 "다른 앵글이 더 낫다"는 주의가 붙는다
    renderPanel({ initial: { emotion: "rage", shotScale: "medium-shot", cameraAngle: "high-angle" } });
    const cautions = screen.getAllByText(/주의:/);
    expect(cautions.length).toBeGreaterThan(0);
    expect(cautions[0].className).toContain("sr-only");
    expect(cautions[0].parentElement?.textContent).toContain("에서 더 잘 읽혀요");
  });

  it("keeps a polite status region present before anything happens so announcements are heard", () => {
    renderPanel();
    const notice = screen.getByTestId("cut-pose-notice");
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.getAttribute("aria-live")).toBe("polite");
    expect(notice.textContent).toBe("");
  });

  it("uses only themed colour tokens", () => {
    const { container } = renderPanel();
    expect(container.innerHTML).not.toMatch(
      /\b(?:bg|text|border|ring|outline|fill|stroke)-(?:emerald|amber|rose|slate|zinc|gray|neutral|stone|sky|indigo|red|green|yellow|blue|violet)-\d/,
    );
    expect(container.innerHTML).not.toContain("dark:");
  });
});

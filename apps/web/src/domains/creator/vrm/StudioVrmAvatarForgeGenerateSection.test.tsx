// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAvatarForgeState, type AvatarForgeState } from "./studio-vrm-avatar-forge";
import { readAvatarForgeVrmAuthoring, withAvatarForgeVrmAuthoring } from "./studio-vrm-avatar-forge-authoring";
import {
  createStudioVrmGenerateExportMetaDraft,
  STUDIO_VRM_THUMBNAIL_MAX_BYTES,
  STUDIO_VRM_THUMBNAIL_TOO_LARGE_REASON,
  studioVrmExportProfileFromDraft,
  type StudioVrmExportProfile,
} from "./studio-vrm-generate-export-meta";
import { STUDIO_VRM_HAIR_SWAY_MAX_CHAINS, STUDIO_VRM_HAIR_SWAY_PRESETS } from "./studio-vrm-generate-hair-sway";
import { STUDIO_VRM_GENERATE_GENERATOR } from "./studio-vrm-generate-recipe";
import { StudioVrmAvatarForgeGenerateSection } from "./StudioVrmAvatarForgeGenerateSection";

import type { StudioVrmExportProfileStore } from "./studio-vrm-export-profile-store";

afterEach(cleanup);

function authoringOf(state: AvatarForgeState | undefined) {
  return state ? readAvatarForgeVrmAuthoring(state) : undefined;
}

function memoryProfileStore(initial: StudioVrmExportProfile | null = null) {
  let stored = initial;
  const store: StudioVrmExportProfileStore = {
    load: vi.fn(async () => stored),
    save: vi.fn(async (profile: StudioVrmExportProfile) => {
      stored = profile;
      return true;
    }),
    clear: vi.fn(async () => {
      stored = null;
      return true;
    }),
  };
  return store;
}

function renderSection(options: {
  readonly state?: AvatarForgeState;
  readonly store?: StudioVrmExportProfileStore;
  readonly sessionKey?: string;
} = {}) {
  const changes: AvatarForgeState[] = [];
  const onGeneratedFile = vi.fn<(file: File) => void>();
  const store = options.store ?? memoryProfileStore();
  function Harness({ sessionKey }: { readonly sessionKey?: string }) {
    const [state, setState] = useState(options.state ?? createAvatarForgeState("pop-twin"));
    return (
      <StudioVrmAvatarForgeGenerateSection
        state={state}
        sessionKey={sessionKey}
        allowDefaultPreset
        exportProfileStore={store}
        onChange={(next) => {
          changes.push(next);
          setState(next);
        }}
        onGeneratedFile={onGeneratedFile}
      />
    );
  }
  const view = render(<Harness sessionKey={options.sessionKey} />);
  return {
    changes,
    onGeneratedFile,
    store,
    switchSession: (sessionKey: string) => view.rerender(<Harness sessionKey={sessionKey} />),
  };
}

async function readMeta(file: File): Promise<Record<string, unknown>> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const length = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as {
    extensions: { VRMC_vrm: { meta: Record<string, unknown> } };
  };
  return json.extensions.VRMC_vrm.meta;
}

describe("StudioVrmAvatarForgeGenerateSection expression editing", () => {
  it("adds a custom expression from a template and tunes it with part sliders", () => {
    const { changes } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /표정 편집/u }));
    const region = screen.getByRole("region", { name: "표정 편집" });
    expect(within(region).getAllByRole("img")).toHaveLength(2);

    fireEvent.click(within(region).getByRole("button", { name: /윙크 커스텀 표정 추가/u }));
    expect(authoringOf(changes.at(-1))?.expressions?.custom?.map((entry) => entry.name)).toEqual(["wink"]);
    expect(within(region).getByRole("button", { name: "윙크" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(within(region).getByRole("slider", { name: "윙크 입꼬리" }), { target: { value: "0.9" } });
    expect(authoringOf(changes.at(-1))?.expressions?.custom?.[0]?.delta.mouthCurve).toBe(0.9);
    expect(screen.getByRole("button", { name: /표정 편집/u }).textContent).toContain("편집 1개");
  });

  it("edits a preset expression and offers only mouth sliders for lip-sync shapes", () => {
    const { changes } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /표정 편집/u }));
    const region = screen.getByRole("region", { name: "표정 편집" });
    fireEvent.change(within(region).getByRole("slider", { name: "행복 눈썹 높이" }), { target: { value: "0.5" } });
    expect(authoringOf(changes.at(-1))?.expressions?.presets?.happy).toEqual({ browRaise: 0.5 });

    fireEvent.click(within(region).getByRole("button", { name: "입모양 A" }));
    expect(within(region).queryByRole("slider", { name: "입모양 A 눈썹 높이" })).toBeNull();
    expect(within(region).getByRole("slider", { name: "입모양 A 입 벌림" })).toBeTruthy();
  });
});

describe("StudioVrmAvatarForgeGenerateSection hair sway", () => {
  it("applies a sway preset to the generate-only authoring state", () => {
    const { changes } = renderSection({ state: createAvatarForgeState("hime-noble") });
    fireEvent.click(screen.getByRole("button", { name: /헤어 흔들림/u }));
    fireEvent.click(screen.getByRole("button", { name: /거의 고정/u }));
    const still = STUDIO_VRM_HAIR_SWAY_PRESETS.find((preset) => preset.id === "still");
    expect(authoringOf(changes.at(-1))?.hairSway?.global).toEqual(still?.params);
    expect(screen.getByRole("button", { name: "앞머리" })).toBeTruthy();
  });

  it("tunes a single strand from the per-strand chips of a group", () => {
    const { changes } = renderSection({ state: createAvatarForgeState("hime-noble") });
    fireEvent.click(screen.getByRole("button", { name: /헤어 흔들림/u }));
    fireEvent.click(screen.getByRole("button", { name: "앞머리" }));
    const strands = screen.getByRole("group", { name: "앞머리 가닥별 조율" });
    fireEvent.click(within(strands).getByRole("button", { name: "앞머리 1번 가닥" }));
    fireEvent.change(screen.getByRole("slider", { name: "앞머리 1번 가닥 단단함" }), { target: { value: "2" } });

    const hairSway = authoringOf(changes.at(-1))?.hairSway;
    expect(hairSway?.groups).toBeUndefined();
    expect(Object.values(hairSway?.chains ?? {})).toEqual([{ stiffness: 2 }]);
    expect(within(strands).getByRole("button", { name: "앞머리 1번 가닥 (조정됨)" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /헤어 흔들림/u }).textContent).toContain("묶음·가닥 1곳");
  });

  it("ignores strand tweaks the current hair does not have, so a new tweak still sticks", () => {
    // 이전 헤어들에서 쌓인 가닥 조정이 상한까지 차 있고, 지금 헤어(히메컷)에는 그 가닥들이 없다.
    const stale = Object.fromEntries(
      Array.from({ length: STUDIO_VRM_HAIR_SWAY_MAX_CHAINS }, (_unused, index) => [`aa-${index}`, { gravity: 2 }]),
    );
    const { changes } = renderSection({
      state: withAvatarForgeVrmAuthoring(createAvatarForgeState("hime-noble"), { hairSway: { chains: stale } }),
    });
    expect(screen.getByRole("button", { name: /헤어 흔들림/u }).textContent).not.toContain("묶음·가닥");

    fireEvent.click(screen.getByRole("button", { name: /헤어 흔들림/u }));
    fireEvent.click(screen.getByRole("button", { name: "앞머리" }));
    const strands = screen.getByRole("group", { name: "앞머리 가닥별 조율" });
    fireEvent.click(within(strands).getByRole("button", { name: "앞머리 1번 가닥" }));
    fireEvent.change(screen.getByRole("slider", { name: "앞머리 1번 가닥 단단함" }), { target: { value: "2" } });

    // 쌓인 조정에 밀려 버려지지 않고, 지금 헤어에 없는 가닥의 조정은 함께 걷힌다.
    expect(Object.values(authoringOf(changes.at(-1))?.hairSway?.chains ?? {})).toEqual([{ stiffness: 2 }]);
    expect(screen.getByRole("button", { name: /헤어 흔들림/u }).textContent).toContain("묶음·가닥 1곳");
  });

  it("offers only the hair groups that actually sway in the generated VRM", () => {
    // 정수리 번은 스프링 체인이 없다. 묶음 탭을 주면 배율을 바꿔도 아무것도 달라지지 않는다.
    renderSection({ state: createAvatarForgeState("elegant-bun") });
    fireEvent.click(screen.getByRole("button", { name: /헤어 흔들림/u }));
    const scopes = screen.getByRole("group", { name: "흔들림 조율 범위" });
    expect(within(scopes).getAllByRole("button").map((button) => button.textContent)).toEqual(["전체", "앞머리", "옆머리"]);
  });
});

describe("StudioVrmAvatarForgeGenerateSection avatar info", () => {
  it("keeps the legacy default meta until the author fills the form", async () => {
    const { onGeneratedFile, store } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: "VRM 생성" }));
    await waitFor(() => expect(onGeneratedFile).toHaveBeenCalledOnce());
    const file = onGeneratedFile.mock.calls[0][0];
    expect(file.name).toBe("팝 트윈.vrm");
    expect((await readMeta(file)).authors).toEqual([STUDIO_VRM_GENERATE_GENERATOR]);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("embeds the author's info, names the file after the avatar and remembers the profile", async () => {
    const { onGeneratedFile, store } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /아바타 정보·이용 조건/u }));
    fireEvent.change(screen.getByLabelText(/아바타 이름/u), { target: { value: "하늘 시노" } });
    fireEvent.change(screen.getByLabelText(/제작자\(쉼표로 여러 명\)/u), { target: { value: "하늘 작가, 바다" } });
    fireEvent.click(screen.getByRole("button", { name: /자유 이용/u }));
    fireEvent.click(screen.getByRole("button", { name: "VRM 생성" }));

    await waitFor(() => expect(onGeneratedFile).toHaveBeenCalledOnce());
    const file = onGeneratedFile.mock.calls[0][0];
    expect(file.name).toBe("하늘 시노.vrm");
    expect(await readMeta(file)).toMatchObject({
      name: "하늘 시노",
      authors: ["하늘 작가", "바다"],
      avatarPermission: "everyone",
      commercialUsage: "corporation",
      allowRedistribution: true,
    });
    await waitFor(() => expect(store.save).toHaveBeenCalledOnce());
    expect(vi.mocked(store.save).mock.calls[0][0]).toMatchObject({ authors: "하늘 작가, 바다", avatarPermission: "everyone" });
    expect(screen.getByRole("status").textContent).toContain("하늘 시노");
  });

  it("starts a new character's name and version on a new sculpt session but keeps the author", () => {
    const { switchSession } = renderSection({ sessionKey: "model-a" });
    fireEvent.click(screen.getByRole("button", { name: /아바타 정보·이용 조건/u }));
    fireEvent.change(screen.getByLabelText(/아바타 이름/u), { target: { value: "하늘 시노" } });
    fireEvent.change(screen.getByLabelText(/제작자\(쉼표로 여러 명\)/u), { target: { value: "하늘 작가" } });
    fireEvent.change(screen.getByLabelText(/버전/u), { target: { value: "1.2" } });

    switchSession("model-b");
    expect((screen.getByLabelText(/아바타 이름/u) as HTMLInputElement).value).toBe("팝 트윈");
    expect((screen.getByLabelText(/버전/u) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/제작자\(쉼표로 여러 명\)/u) as HTMLInputElement).value).toBe("하늘 작가");
  });

  it("does not export silently without a thumbnail when 'my image' has no image", async () => {
    const { onGeneratedFile } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /아바타 정보·이용 조건/u }));
    fireEvent.click(screen.getByRole("button", { name: "내 이미지" }));
    fireEvent.click(screen.getByRole("button", { name: "VRM 생성" }));
    expect(await screen.findByText(/썸네일로 쓸 이미지를 아직 고르지 않았어요/u)).toBeTruthy();
    expect(onGeneratedFile).not.toHaveBeenCalled();
  });

  it("refuses an oversized thumbnail before reading it into memory", async () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /아바타 정보·이용 조건/u }));
    fireEvent.click(screen.getByRole("button", { name: "내 이미지" }));
    const file = new File([new Uint8Array(8)], "huge.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: STUDIO_VRM_THUMBNAIL_MAX_BYTES + 1 });
    const read = vi.spyOn(file, "arrayBuffer");
    const input = document.querySelector<HTMLInputElement>("input[type=file]");
    if (!input) throw new Error("expected the thumbnail file input");
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText(STUDIO_VRM_THUMBNAIL_TOO_LARGE_REASON)).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
  });

  it("blocks generation and points at the field when a required value is missing", async () => {
    const { onGeneratedFile } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /아바타 정보·이용 조건/u }));
    const authors = screen.getByLabelText(/제작자\(쉼표로 여러 명\)/u);
    fireEvent.change(authors, { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "VRM 생성" }));

    await waitFor(() => expect(document.querySelector("[data-studio-vrm-generate-meta-invalid]")).toBeTruthy());
    expect(screen.getByLabelText(/제작자\(쉼표로 여러 명\)/u).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("제작자를 한 명 이상 적어 주세요.")).toBeTruthy();
    expect(onGeneratedFile).not.toHaveBeenCalled();
  });

  it("uses the remembered profile automatically on the next character", async () => {
    const profile = studioVrmExportProfileFromDraft({
      ...createStudioVrmGenerateExportMetaDraft({ avatarName: "이전 캐릭터" }),
      authors: "하늘 작가",
    });
    const { onGeneratedFile } = renderSection({ store: memoryProfileStore(profile) });
    await waitFor(() => expect(screen.getByRole("button", { name: /아바타 정보·이용 조건/u }).textContent).toContain("팝 트윈"));
    fireEvent.click(screen.getByRole("button", { name: "VRM 생성" }));
    await waitFor(() => expect(onGeneratedFile).toHaveBeenCalledOnce());
    expect((await readMeta(onGeneratedFile.mock.calls[0][0])).authors).toEqual(["하늘 작가"]);
  });

  it("stops remembering once the author clears the stored profile", async () => {
    const profile = studioVrmExportProfileFromDraft({
      ...createStudioVrmGenerateExportMetaDraft({ avatarName: "이전 캐릭터" }),
      authors: "하늘 작가",
    });
    const store = memoryProfileStore(profile);
    const { onGeneratedFile } = renderSection({ store });
    fireEvent.click(screen.getByRole("button", { name: /아바타 정보·이용 조건/u }));
    fireEvent.click(await screen.findByRole("button", { name: "기억한 제작자 정보 지우기" }));
    await waitFor(() => expect(store.clear).toHaveBeenCalledOnce());
    expect((screen.getByRole("checkbox", { name: /이 기기에 기억/u }) as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "VRM 생성" }));
    await waitFor(() => expect(onGeneratedFile).toHaveBeenCalledOnce());
    // 이번 VRM 에는 입력한 정보가 들어가지만 이 기기에는 다시 저장하지 않는다.
    expect((await readMeta(onGeneratedFile.mock.calls[0][0])).authors).toEqual(["하늘 작가"]);
    expect(store.save).not.toHaveBeenCalled();
  });
});

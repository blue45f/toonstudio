// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORYWORLD_DEMO_PROJECT, type StoryworldProject } from "../studio-storyworld-causality";
import { StudioStoryPlausibilityManuscript } from "./StudioStoryPlausibilityManuscript";
import type { ManuscriptNameSources } from "./studio-story-manuscript-names";
import { MANUSCRIPT_MAX_CHARS } from "./studio-story-manuscript-extractor";
import { manuscriptFingerprint } from "./studio-story-manuscript-project";
import { storyworldManuscriptStore } from "./studio-story-manuscript-store";
import { DOJIN, HAEUN, makeStory } from "./studio-story-plausibility-golden-fixtures";

const kv = vi.hoisted(() => ({ rows: new Map<string, string>() }));
vi.mock("../universe-store", () => ({
  storyworldAuxStore: {
    load: async (key: string) => kv.rows.get(key) ?? null,
    save: async (key: string, payload: string) => { kv.rows.set(key, payload); },
  },
}));

const TEXT = [
  "1화 비 내리는 시장",
  "",
  "장면 1. 기억 시장",
  "하은이 걸었다. 다음 날 아침이 밝았다.",
  "",
  "첫째 문단이 끝났다.",
  "",
  "둘째 문단이 이어진다.",
  "",
  "장면 2",
  "도진이 금고 앞에서 하은에게 말했다.",
].join("\n");

const EXISTING: StoryworldProject = makeStory("mine", "내 이야기", {
  characters: [HAEUN, DOJIN],
  facts: [{ id: "f1", label: "열쇠가 있다", subjectId: "haeun", key: "key" }],
  setupContracts: [{ id: "umbrella", label: "우산" }],
  scenes: [
    { id: "old-1", title: "옛 장면 하나", order: 10 },
    { id: "old-2", title: "옛 장면 둘", order: 20 },
  ],
});

type CreateFn = (project: StoryworldProject, message: string) => void;

interface Props {
  readonly project?: StoryworldProject;
  readonly isExampleSeed?: boolean;
  readonly onCreate?: CreateFn;
  readonly onCancel?: () => void;
  readonly onExportCurrent?: () => void;
  readonly nameSources?: ManuscriptNameSources;
  readonly nameNotices?: readonly string[];
}

function renderFlow({ project = EXISTING, isExampleSeed = false, onCreate = vi.fn<CreateFn>(), onCancel = vi.fn(), onExportCurrent = vi.fn(), nameSources, nameNotices }: Props = {}) {
  return render(
    <StudioStoryPlausibilityManuscript
      isExampleSeed={isExampleSeed}
      {...(nameSources ? { nameSources } : {})}
      {...(nameNotices ? { nameNotices } : {})}
      now={() => new Date("2026-10-15T09:30:00.000Z")}
      onCancel={onCancel}
      onCreate={onCreate}
      onExportCurrent={onExportCurrent}
      project={project}
      scopeKey="scope"
    />,
  );
}

async function toPreview(text = TEXT) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "장면 나누기 미리보기" }));
  await screen.findByRole("region", { name: "장면 나누기 미리보기" });
}

beforeEach(() => {
  kv.rows.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("원고로 시작하기: 붙여 넣기", () => {
  it("빈 글에서는 미리보기를 시작할 수 없고, 글자 수를 알린다", () => {
    renderFlow();
    expect(screen.getByRole("button", { name: "장면 나누기 미리보기" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "가나다" } });
    expect(screen.getByText("3자")).toBeTruthy();
    expect(screen.getByRole("button", { name: "장면 나누기 미리보기" }).hasAttribute("disabled")).toBe(false);
  });

  it("한도를 넘으면 얼마나 넘었는지 알리고 시작하지 못하게 한다", () => {
    renderFlow();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "가".repeat(MANUSCRIPT_MAX_CHARS + 5) } });
    expect(screen.getByText(/5자 넘었어요\. 나눠서 넣어 주세요/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "장면 나누기 미리보기" }).hasAttribute("disabled")).toBe(true);
  });

  it("줄바꿈 CRLF는 LF로 맞춘다(저장하는 사본과 위치가 어긋나지 않게)", () => {
    renderFlow();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "가\r\n나\r다" } });
    expect(screen.getByText("5자")).toBeTruthy();
  });

  it("파일로 가져오면 글이 채워진다", async () => {
    renderFlow();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("파일 입력이 없습니다.");
    const file = new File(["장면 1\r\n하은이 걸었다."], "원고.txt", { type: "text/plain" });
    Object.defineProperty(file, "text", { value: async () => "장면 1\r\n하은이 걸었다." });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("textbox").textContent).toBe("장면 1\n하은이 걸었다."));
  });

  it("어떤 표시로 장면을 나누는지 안내한다", () => {
    renderFlow();
    fireEvent.click(screen.getByText("어떤 표시로 장면을 나누나요?"));
    expect(screen.getByText(/장면 번호 줄: ‘장면 3’/u)).toBeTruthy();
    expect(screen.getByText(/빈 줄이 두 줄 이상 이어질 때/u)).toBeTruthy();
  });

  it("취소하고 돌아갈 수 있다", () => {
    const onCancel = vi.fn();
    renderFlow({ onCancel });
    fireEvent.click(screen.getByRole("button", { name: "취소하고 돌아가기" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("원고로 시작하기: 미리보기", () => {
  it("장면을 나누고 경계 종류, 글자 수, 등장인물, 장소, 시간 표현을 보여 준다", async () => {
    renderFlow();
    await toPreview();
    const scenes = screen.getAllByRole("listitem").filter((item) => item.classList.contains("plausibility-ms__scene"));
    expect(scenes).toHaveLength(2);
    const [first, second] = scenes;
    if (!first || !second) throw new Error("장면이 부족합니다.");
    expect(within(first).getByText("장면 번호 줄")).toBeTruthy();
    expect(within(first).getByRole("textbox", { name: "장면 1 제목" })).toHaveProperty("value", "기억 시장");
    expect(within(first).getByRole("button", { name: "하은 빼기" })).toBeTruthy();
    expect(within(first).getByText(/원문에 적힌 시간 표현: 다음 날 아침/u)).toBeTruthy();
    expect(within(second).getByRole("button", { name: "도진 빼기" })).toBeTruthy();
    expect(within(second).getByRole("button", { name: "하은 빼기" })).toBeTruthy();
    expect(screen.getByText(/장면 2개를 찾았어요/u)).toBeTruthy();
  });

  it("앞 장면과 합치면 장면 수가 줄고, 문단 위치에서 나누면 늘어난다", async () => {
    renderFlow();
    await toPreview();
    fireEvent.click(screen.getByRole("button", { name: "장면 2 · 앞 장면과 합치기" }));
    await waitFor(() => expect(screen.getByText(/장면 1개를 찾았어요/u)).toBeTruthy());
    fireEvent.click(screen.getByText("장면 1 · 나누기…"));
    const splitButtons = screen.getAllByRole("button", { name: /^여기서 나누기:/u });
    expect(splitButtons.length).toBeGreaterThan(1);
    const target = splitButtons.find((button) => button.textContent?.includes("둘째 문단"));
    if (!target) throw new Error("문단 나누기 위치가 없습니다.");
    fireEvent.click(target);
    await waitFor(() => expect(screen.getByText(/장면 2개를 찾았어요/u)).toBeTruthy());
    expect(screen.getAllByText("직접 나눔").length).toBeGreaterThan(0);
  });

  it("제목·등장인물·장소를 고칠 수 있다", async () => {
    const onCreate = vi.fn<CreateFn>();
    renderFlow({ onCreate });
    await toPreview();
    const first = screen.getAllByRole("listitem").find((item) => item.classList.contains("plausibility-ms__scene"));
    if (!first) throw new Error("장면이 없습니다.");
    fireEvent.change(within(first).getByRole("textbox", { name: "장면 1 제목" }), { target: { value: "  내가 고친 제목  " } });
    fireEvent.click(within(first).getByRole("button", { name: "하은 빼기" }));
    expect(within(first).getByText("확정된 인물이 없어요")).toBeTruthy();
    fireEvent.change(within(first).getByRole("combobox", { name: "인물 더하기" }), { target: { value: "dojin" } });
    expect(within(first).getByRole("button", { name: "도진 빼기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "이대로 계속" }));
    fireEvent.click(screen.getByRole("radio", { name: /지금 설정 뒤에 덧붙이기/u }));
    fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const created = onCreate.mock.calls[0]?.[0];
    const added = created?.scenes.filter((scene) => scene.id.startsWith("ms-"));
    expect(added?.[0]).toMatchObject({ title: "내가 고친 제목", participantIds: ["dojin"] });
  });

  it("이름이 같은 사람이 여럿이면 직접 고르게 한다", async () => {
    const twins = makeStory("twins", "동명이인", {
      characters: [{ id: "a", name: "민준" }, { id: "b", name: "민준", description: "다른 사람" }],
      scenes: [{ id: "old", title: "옛 장면", order: 1 }],
    });
    renderFlow({ project: twins });
    await toPreview("장면 1\n민준이 웃었다.");
    expect(screen.getByText(/이름이 같은 사람이 있는 장면 1개는 직접 골라 주세요/u)).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: /‘민준’은 누구인가요/u }), { target: { value: "character:b" } });
    expect(screen.getByRole("button", { name: "민준 빼기" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: /‘민준’은 누구인가요/u })).toBeNull();
  });

  it("원고를 다시 고치러 돌아갈 수 있고 글은 남아 있다", async () => {
    renderFlow();
    await toPreview();
    fireEvent.click(screen.getByRole("button", { name: "원고 다시 고치기" }));
    expect(screen.getByRole("textbox").textContent).toBe(TEXT);
  });
});

describe("원고로 시작하기: 확인과 초안 만들기", () => {
  it("지금 설정을 덮어쓰는 경우 사라지는 내용을 알리고 확인을 받기 전에는 만들 수 없다", async () => {
    const onExportCurrent = vi.fn();
    const onCreate = vi.fn<CreateFn>();
    renderFlow({ onExportCurrent, onCreate });
    await toPreview();
    fireEvent.click(screen.getByRole("button", { name: "이대로 계속" }));
    fireEvent.click(screen.getByRole("radio", { name: /새로 시작하기/u }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("장면 2개, 설정(사실) 1개, 복선 1개");
    expect(alert.textContent).toContain("질문지로 답한 내용도 함께 사라져요");
    const create = screen.getByRole("button", { name: "초안 만들기" });
    expect(create.hasAttribute("disabled")).toBe(true);
    fireEvent.click(within(alert).getByRole("button", { name: "먼저 지금 설정을 파일로 저장" }));
    expect(onExportCurrent).toHaveBeenCalledTimes(1);
    fireEvent.click(within(alert).getByRole("checkbox", { name: "사라지는 내용을 확인했어요" }));
    expect(create.hasAttribute("disabled")).toBe(false);
    fireEvent.click(create);
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
  });

  it("새로 시작하면 인물 이름은 남기고 장면·설정·복선을 새로 만들며 의미 칸은 비워 둔다", async () => {
    const onCreate = vi.fn<CreateFn>();
    renderFlow({ onCreate });
    await toPreview();
    fireEvent.click(screen.getByRole("button", { name: "이대로 계속" }));
    fireEvent.click(screen.getByRole("radio", { name: /새로 시작하기/u }));
    fireEvent.click(screen.getByRole("checkbox", { name: "사라지는 내용을 확인했어요" }));
    fireEvent.change(screen.getByRole("textbox", { name: /작품 이름/u }), { target: { value: "새 이야기" } });
    fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const created = onCreate.mock.calls[0]?.[0];
    const message = onCreate.mock.calls[0]?.[1] ?? "";
    expect(created?.title).toBe("새 이야기");
    expect(created?.scenes.map((scene) => scene.title)).toEqual(["기억 시장", "장면 2"]);
    expect(created?.facts).toEqual([]);
    expect(created?.setupContracts).toBeUndefined();
    expect(created?.characters.map((character) => character.name)).toEqual(["하은", "도진"]);
    for (const scene of created?.scenes ?? []) {
      expect(scene.plausibility).toBeUndefined();
      expect(scene.preconditions).toBeUndefined();
      expect(scene.knowledgeUses).toBeUndefined();
      expect(scene.timeIndex).toBeUndefined();
    }
    expect(message).toContain("장면 2개를 만들었어요");
    expect(message).toContain("동기·원인·정보 칸은 비워 뒀으니 질문지로 채워 주세요");
  });

  it("원고 사본을 이 기기에 저장하고, 각 장면이 그 사본을 가리킨다", async () => {
    const onCreate = vi.fn<CreateFn>();
    renderFlow({ onCreate });
    await toPreview();
    fireEvent.click(screen.getByRole("button", { name: "이대로 계속" }));
    fireEvent.click(screen.getByRole("radio", { name: /지금 설정 뒤에 덧붙이기/u }));
    fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const copyId = manuscriptFingerprint(TEXT);
    const created = onCreate.mock.calls[0]?.[0];
    const added = created?.scenes.filter((scene) => scene.id.startsWith("ms-")) ?? [];
    expect(added).toHaveLength(2);
    for (const scene of added) expect(scene.source?.copy).toBe(copyId);
    expect(created?.scenes.slice(0, 2).map((scene) => scene.id)).toEqual(["old-1", "old-2"]);
    const loaded = await storyworldManuscriptStore.load("scope", copyId);
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") expect(loaded.text).toBe(TEXT);
  });

  it("사본 저장에 실패하면 알리고, 사본 없이 만들 수 있다", async () => {
    vi.spyOn(storyworldManuscriptStore, "save").mockRejectedValueOnce(new Error("저장소가 가득 찼어요"));
    const onCreate = vi.fn<CreateFn>();
    renderFlow({ onCreate });
    await toPreview();
    fireEvent.click(screen.getByRole("button", { name: "이대로 계속" }));
    fireEvent.click(screen.getByRole("radio", { name: /지금 설정 뒤에 덧붙이기/u }));
    fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
    const warning = await screen.findByText(/원고 사본을 이 기기에 저장하지 못했어요/u);
    expect(onCreate).not.toHaveBeenCalled();
    expect(warning.textContent).toContain("이름 표기 검사는 건너뛰어요");
    fireEvent.click(screen.getByRole("button", { name: "사본 없이 만들기" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const created = onCreate.mock.calls[0]?.[0];
    expect(created?.scenes.filter((scene) => scene.id.startsWith("ms-")).every((scene) => scene.source?.copy === undefined)).toBe(true);
  });

  it("처음 보여 준 예시 데이터는 덮어써도 잃을 것이 없다고 알리고, 예시 인물·id를 이어받지 않는다", async () => {
    const onCreate = vi.fn<CreateFn>();
    renderFlow({ project: STORYWORLD_DEMO_PROJECT, isExampleSeed: true, onCreate });
    await toPreview("장면 1\n본문입니다.");
    fireEvent.click(screen.getByRole("button", { name: "이대로 계속" }));
    expect(screen.getByRole("radio", { name: /새로 시작하기/u })).toHaveProperty("checked", true);
    expect(screen.getByText(/처음 보여 드린 예시라서/u)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const created = onCreate.mock.calls[0]?.[0];
    expect(created?.id).toBe("manuscript-draft");
    expect(created?.characters).toEqual([]);
    expect(created?.scenes).toHaveLength(1);
  });
});

describe("원고로 시작하기: 등록된 이름", () => {
  const BLANK: StoryworldProject = makeStory("blank", "빈 문서", { characters: [], scenes: [] });
  const BIBLE: ManuscriptNameSources = {
    bibleCharacters: [{ id: "c-1", name: "하은", aliases: ["은이"] }, { id: "c-2", name: "도진", aliases: [] }],
    bibleLocations: [{ id: "l-1", name: "기억 시장" }],
    loreLocations: [{ id: "p-1", name: "별빛 거리", aliases: ["별길"] }],
  };
  const NAMED_TEXT = ["장면 1", "은이가 기억 시장을 걸었다. 도진이 불렀다.", "", "* * *", "", "장면 2", "하은은 별길로 접어들었다."].join("\n");

  it("스토리 바이블·세계관 설정에 등록된 이름 수를 알려 준다", () => {
    renderFlow({ project: BLANK, nameSources: BIBLE });
    expect(screen.getByText(/찾을 수 있는 이름: 인물 2명 · 장소 2곳/u)).toBeTruthy();
    expect(screen.getByText(/등록된 이름과 글자가 같을 때만 찾아요/u)).toBeTruthy();
  });

  it("등록된 이름이 하나도 없으면 장면 경계와 시간 표현만 찾는다고 알린다", () => {
    renderFlow({ project: BLANK });
    expect(screen.getByText(/등록된 인물·장소 이름이 없어서 장면 경계와 시간 표현만 찾아요/u)).toBeTruthy();
  });

  it("이름을 읽다가 막힌 저장소가 있으면 그 사실을 알린다", () => {
    renderFlow({ project: BLANK, nameNotices: ["스토리 바이블을 읽지 못해서 바이블에 등록된 인물·장소 이름은 쓰지 않았어요."] });
    expect(screen.getByRole("status", { name: "이름을 읽으면서 알게 된 점" }).textContent).toContain("스토리 바이블을 읽지 못해서");
  });

  it("문서가 비어 있어도 바이블 이름의 글자 일치로 등장인물과 장소를 찾고, 만든 문서에 바이블 id로 남긴다", async () => {
    const onCreate = vi.fn<CreateFn>();
    renderFlow({ project: BLANK, nameSources: BIBLE, onCreate });
    await toPreview(NAMED_TEXT);
    const scenes = screen.getAllByRole("listitem").filter((item) => item.classList.contains("plausibility-ms__scene"));
    expect(scenes).toHaveLength(2);
    const [first, second] = scenes;
    if (!first || !second) throw new Error("장면이 부족합니다.");
    expect(within(first).getByRole("button", { name: "하은 빼기" })).toBeTruthy();
    expect(within(first).getByRole("button", { name: "도진 빼기" })).toBeTruthy();
    expect(within(second).getByRole("button", { name: "하은 빼기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "이대로 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const created = onCreate.mock.calls[0]?.[0];
    expect(created?.characters.map((character) => [character.id, character.name])).toEqual([["c-1", "하은"], ["c-2", "도진"]]);
    expect(created?.characters[0]?.aliases).toEqual(["은이"]);
    expect(created?.scenes.map((scene) => scene.locationId)).toEqual(["기억 시장", "별빛 거리"]);
    expect(created?.scenes.map((scene) => scene.participantIds)).toEqual([["c-1", "c-2"], ["c-1"]]);
  });

  it("처음 보여 준 예시 이야기의 인물 이름은 작가의 원고에서 찾지 않는다", async () => {
    renderFlow({ project: STORYWORLD_DEMO_PROJECT, isExampleSeed: true });
    expect(screen.getByText(/등록된 인물·장소 이름이 없어서/u)).toBeTruthy();
    await toPreview("장면 1\n하은이 도진에게 말했다.");
    const [scene] = screen.getAllByRole("listitem").filter((item) => item.classList.contains("plausibility-ms__scene"));
    if (!scene) throw new Error("장면이 없습니다.");
    expect(within(scene).getByText("확정된 인물이 없어요")).toBeTruthy();
  });
});

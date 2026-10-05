// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_AI_DEFAULT_SETTINGS,
  type StudioAiSettings,
} from "../studio-ai-client";
import {
  buildCharacterCanonSheet,
  validateCanonSheetDraft,
  type CanonSheetDraft,
} from "./studio-character-canon";
import { StudioPhotoCharacterWizard } from "./StudioPhotoCharacterWizard";
import type { PhotoCharacterGenerateFn } from "./studio-photo-character-wizard";

const PHOTO = "data:image/webp;base64,photo";
const GENERATED = "data:image/png;base64,generated";

const CONFIGURED: StudioAiSettings = {
  ...STUDIO_AI_DEFAULT_SETTINGS,
  apiKey: "sk-test",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeCanon() {
  const saveSheet = vi.fn((draft: CanonSheetDraft) => {
    const errors = validateCanonSheetDraft(draft);
    return errors.length > 0
      ? { ok: false as const, errors }
      : { ok: true as const, sheet: buildCharacterCanonSheet(draft) };
  });
  return { canon: { saveSheet }, saveSheet };
}

function renderWizard(overrides: {
  aiSettings?: StudioAiSettings;
  generateImage?: PhotoCharacterGenerateFn;
} = {}) {
  const { canon, saveSheet } = makeCanon();
  const generateImage: PhotoCharacterGenerateFn =
    overrides.generateImage ??
    vi.fn(async () => ({ ok: true as const, data: { dataUrl: GENERATED } }));
  const loadPhotoFile = vi.fn(async () => ({ src: PHOTO, width: 800, height: 800 }));
  render(
    <MemoryRouter>
      <StudioPhotoCharacterWizard
        canon={canon}
        onClose={vi.fn()}
        aiSettings={overrides.aiSettings ?? CONFIGURED}
        generateImage={generateImage}
        loadPhotoFile={loadPhotoFile}
        prepareReferenceImage={async (dataUrl) => dataUrl}
      />
    </MemoryRouter>,
  );
  return { saveSheet, generateImage, loadPhotoFile };
}

async function uploadPhotoAndNext() {
  const input = screen.getByLabelText("사진 파일 선택");
  fireEvent.change(input, {
    target: { files: [new File(["x"], "me.png", { type: "image/png" })] },
  });
  await screen.findByText("사진이 준비됐어요.");
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
}

async function pickStyleAndNext() {
  fireEvent.click(screen.getByRole("radio", { name: /선명한 카툰/ }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
}

async function fillDetailsAndSave() {
  fireEvent.change(screen.getByLabelText("캐릭터 이름"), {
    target: { value: "하린" },
  });
  fireEvent.change(screen.getByLabelText(/캐릭터 설명/), {
    target: { value: "긴 흑발, 회색 눈" },
  });
  fireEvent.click(screen.getByRole("button", { name: "캐논에 저장" }));
  await screen.findByText("캐릭터를 캐논에 저장했어요.");
}

describe("사진→캐릭터 위저드", () => {
  it("사진이 없으면 다음 버튼이 비활성이고, 올리면 활성화된다", async () => {
    renderWizard();
    expect((screen.getByRole("button", { name: "다음" }) as HTMLButtonElement).disabled).toBe(true);
    const input = screen.getByLabelText("사진 파일 선택");
    fireEvent.change(input, {
      target: { files: [new File(["x"], "me.png", { type: "image/png" })] },
    });
    await screen.findByText("사진이 준비됐어요.");
    expect((screen.getByRole("button", { name: "다음" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("스타일을 고르기 전에는 생성 단계로 넘어갈 수 없다", async () => {
    renderWizard();
    await uploadPhotoAndNext();
    expect((screen.getByRole("button", { name: "다음" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /흑백 망점/ }));
    expect((screen.getByRole("button", { name: "다음" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("생성→확인→이름 입력→캐논 저장까지 한 동선으로 이어진다", async () => {
    const { saveSheet, generateImage } = renderWizard();
    await uploadPhotoAndNext();
    await pickStyleAndNext();

    fireEvent.click(screen.getByRole("button", { name: "캐릭터 생성" }));
    const resultImage = await screen.findByAltText("생성된 캐릭터");
    expect(resultImage.getAttribute("src")).toBe(GENERATED);
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledWith(
      CONFIGURED,
      PHOTO,
      expect.stringContaining("선명한 컬러 웹툰 캐릭터"),
      { signal: undefined },
    );

    fireEvent.click(screen.getByRole("button", { name: "이 결과로 계속" }));
    await fillDetailsAndSave();

    expect(saveSheet).toHaveBeenCalledTimes(1);
    const draft = saveSheet.mock.calls[0]?.[0];
    expect(draft?.name).toBe("하린");
    expect(draft?.appearance).toBe("긴 흑발, 회색 눈");
    expect(draft?.referenceImage).toBe(GENERATED);
    expect(draft?.referenceSource).toBe("upload");
    expect(draft?.tags).toEqual(["사진 생성", "선명한 카툰"]);
  });

  it("생성이 실패하면 오류를 보여주고 다시 생성할 수 있다", async () => {
    const generateImage: PhotoCharacterGenerateFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: "http_error", error: "제공자 오류" })
      .mockResolvedValue({ ok: true, data: { dataUrl: GENERATED } });
    renderWizard({ generateImage });
    await uploadPhotoAndNext();
    await pickStyleAndNext();

    fireEvent.click(screen.getByRole("button", { name: "캐릭터 생성" }));
    expect((await screen.findByRole("alert")).textContent).toContain("제공자 오류");

    fireEvent.click(screen.getByRole("button", { name: "다시 생성" }));
    expect(await screen.findByAltText("생성된 캐릭터")).toBeTruthy();
    expect(generateImage).toHaveBeenCalledTimes(2);
  });

  it("BYOK 키가 없으면 생성 단계가 비활성으로 표시되고, 원본 사진으로는 저장까지 된다", async () => {
    const { saveSheet, generateImage } = renderWizard({
      aiSettings: STUDIO_AI_DEFAULT_SETTINGS,
    });
    await uploadPhotoAndNext();
    await pickStyleAndNext();

    expect(screen.getByText("AI 생성을 쓰려면 API 키가 필요해요.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "통합 API 키 설정 열기" }).getAttribute("href")).toBe(
      "/settings/api-keys",
    );
    expect(screen.queryByRole("button", { name: "캐릭터 생성" })).toBeNull();
    expect(generateImage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "원본 사진으로 계속" }));
    await fillDetailsAndSave();

    const draft = saveSheet.mock.calls[0]?.[0];
    expect(draft?.referenceImage).toBe(PHOTO);
    expect(draft?.tags).toEqual(["사진 등록", "선명한 카툰"]);
  });
});

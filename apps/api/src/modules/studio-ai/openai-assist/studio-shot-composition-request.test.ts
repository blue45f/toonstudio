import { describe, expect, it, vi } from "vitest";

import { StudioOpenAiCreativeAssistService } from "../studio-openai-creative-assist.service";

describe("원고의 시각 제약을 담는 제작 지시", () => {
  it.each([
    {
      mode: "bg3d-camera-blocking",
      inputText: "기록 보관소. 앞쪽의 장갑 낀 손은 크게, 뒤쪽 시계는 작게 보인다. 카드를 회수할 때도 뒷면 식별표는 렌즈에 안 보이게 한다.",
    },
    {
      mode: "bg3d-camera-blocking",
      inputText: "무대 전환 중 막은 고정한다. 댄서 둘이 자리만 바꾼다. 가까운 댄서가 멀리 선 수어 통역사의 손을 가리면 안 된다.",
    },
    {
      mode: "thumbnail-hook-optimizer",
      inputText: "박물관 사진 속 기와만 무채색이고 사진 밖의 나무 액자는 갈색이다. 액자의 금속 걸쇠도 크롭 안에 남긴다.",
    },
    {
      mode: "thumbnail-hook-optimizer",
      inputText: "시계방 진열대에서 무광 진회색 밴드와 유광 청록색 문자판을 한 화면에 담는다. 상품 로고를 가리거나 편집 글자를 올리지 않는다.",
    },
  ] as const)("$mode 실제 요청의 제작 필드에서 $inputText 조건을 전달한다", async ({ mode, inputText }) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }));
    const service = new StudioOpenAiCreativeAssistService();
    await expect(service.assist("composition-test", { mode, inputText }, {
      env: { OPENAI_API_KEY: "offline-placeholder" }, fetchImpl,
    })).rejects.toMatchObject({ status: 503 });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const body = fetchImpl.mock.calls[0][1]?.body;
    if (typeof body !== "string") throw new Error("모델에 전송할 JSON 요청이 필요합니다.");
    const request = JSON.parse(body);
    expect(request.messages.at(-1)).toMatchObject({ role: "user", content: expect.stringContaining(inputText) });
    const system = request.messages[0].content;
    const properties = request.response_format.json_schema.schema.properties;
    if (mode === "bg3d-camera-blocking") {
      expect(system).toMatch(/blockingNotes.*카메라/u);
      expect(properties.blockingNotes.description).toMatch(/상대 크기.*보이는 면.*가림/u);
    } else {
      expect(system).toMatch(/focalSubject.*피사체/u);
      expect(properties.thumbnailSpec.properties.focalSubject.description).toMatch(/색.*질감.*적용/u);
    }
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IpfsContentAddressPanel } from "./IpfsContentAddressPanel";
import * as ipfs from "./ipfs-content-address";

vi.mock("./ipfs-content-address", async (importOriginal) => {
  const original = await importOriginal<typeof import("./ipfs-content-address")>();
  return { ...original, fetchVerifiedContent: vi.fn() };
});

const HELLO_WORLD_RAW_CID = "bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("IpfsContentAddressPanel", () => {
  it("파일을 고르면 실제 CID를 계산해 보여준다", async () => {
    render(<IpfsContentAddressPanel />);
    const input = screen.getByLabelText("CID를 만들 파일 선택");
    const file = new File(["hello world"], "hello.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(HELLO_WORLD_RAW_CID)).toBeTruthy();
    });
    expect(screen.getByText(`ipfs://${HELLO_WORLD_RAW_CID}`)).toBeTruthy();
  });

  it("CID를 입력하면 코덱 정보를 보여주고, 검증 가져오기가 성공하면 크기와 재검증 결과를 알린다", async () => {
    vi.mocked(ipfs.fetchVerifiedContent).mockResolvedValue(new Response("hello world"));
    render(<IpfsContentAddressPanel />);
    const input = screen.getByPlaceholderText(/bafkrei/u);
    fireEvent.change(input, { target: { value: HELLO_WORLD_RAW_CID } });
    expect(screen.getByText(/raw/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /검증하며 가져오기/u }));
    await waitFor(() => {
      expect(screen.getByText(/재검증까지 일치합니다/u)).toBeTruthy();
    });
    expect(ipfs.fetchVerifiedContent).toHaveBeenCalledWith(HELLO_WORLD_RAW_CID);
  });

  it("깨진 CID는 형식 오류를 알리고 가져오기 버튼을 만들지 않는다", () => {
    render(<IpfsContentAddressPanel />);
    const input = screen.getByPlaceholderText(/bafkrei/u);
    fireEvent.change(input, { target: { value: "not-a-cid" } });
    expect(screen.getByRole("alert").textContent).toContain("올바르지 않습니다");
    expect(screen.queryByRole("button", { name: /검증하며 가져오기/u })).toBeNull();
  });

  it("가져오기 실패는 빈 상태가 아니라 오류로 알린다", async () => {
    vi.mocked(ipfs.fetchVerifiedContent).mockRejectedValue(new Error("gateway timeout"));
    render(<IpfsContentAddressPanel />);
    const input = screen.getByPlaceholderText(/bafkrei/u);
    fireEvent.change(input, { target: { value: HELLO_WORLD_RAW_CID } });
    fireEvent.click(screen.getByRole("button", { name: /검증하며 가져오기/u }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("가져오지 못했습니다");
    });
  });
});

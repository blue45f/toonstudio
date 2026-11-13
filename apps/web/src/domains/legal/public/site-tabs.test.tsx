// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { SiteTabPanel } from "./site-section-tabs";
import { useSiteTabs } from "./site-tabs";

const IDS = ["display", "account", "data"] as const;

function Panels({ fromUrl = true }: { readonly fromUrl?: boolean }) {
  const { value, select, isMounted } = useSiteTabs({ ids: IDS, fallback: "display", param: fromUrl ? "view" : undefined });
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <Link to="/settings?project=keep&view=account#draft">주소로 계정 열기</Link>
    <button onClick={() => navigate(-1)}>뒤로</button><button onClick={() => navigate(1)}>앞으로</button>
    <button onClick={() => select("account")}>계정 탭 선택</button><button onClick={() => select("data")}>데이터 탭 선택</button>
    <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>
    {IDS.map((id) => <SiteTabPanel key={id} idPrefix="draft" id={id} active={value === id} mounted={isMounted(id)}>
      <input aria-label={`${id} 초안`} defaultValue="" />
    </SiteTabPanel>)}
  </>;
}

afterEach(cleanup);

describe("공통 탭의 방문한 입력 보존", () => {
  it("Link로 처음 연 패널도 즉시 Back·Forward하면 같은 미저장 입력 DOM을 유지한다", () => {
    render(<MemoryRouter initialEntries={["/settings?project=keep"]}><Panels /></MemoryRouter>);
    expect(screen.queryByLabelText("account 초안")).toBeNull();
    expect(screen.queryByLabelText("data 초안")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "주소로 계정 열기" }));
    const draft = screen.getByLabelText("account 초안");
    fireEvent.change(draft, { target: { value: "url-draft-placeholder" } });
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    expect(screen.getByLabelText("account 초안")).toBe(draft);
    expect(draft.closest("[hidden]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "앞으로" }));
    expect(screen.getByTestId("location").textContent).toBe("/settings?project=keep&view=account#draft");
    expect(screen.getByLabelText("account 초안")).toBe(draft);
    expect(draft).toHaveProperty("value", "url-draft-placeholder");
    expect(draft.closest("[hidden]")).toBeNull();
    expect(screen.queryByLabelText("data 초안")).toBeNull();
  });

  it("URL을 쓰지 않는 탭도 방문한 패널만 유지하고 미저장 입력을 보존한다", () => {
    render(<MemoryRouter><Panels fromUrl={false} /></MemoryRouter>);
    expect(screen.queryByLabelText("account 초안")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "계정 탭 선택" }));
    const draft = screen.getByLabelText("account 초안");
    fireEvent.change(draft, { target: { value: "local-draft-placeholder" } });
    fireEvent.click(screen.getByRole("button", { name: "데이터 탭 선택" }));
    expect(screen.getByLabelText("account 초안")).toBe(draft);
    expect(draft.closest("[hidden]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "계정 탭 선택" }));
    expect(screen.getByLabelText("account 초안")).toBe(draft);
    expect(draft).toHaveProperty("value", "local-draft-placeholder");
  });
});

// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceSpaceBookingPanel } from "./StudioVirtualSpaceSpaceBookingPanel";
import type { StudioSpaceBooking, StudioSpaceWaitlistEntry } from "./studio-virtual-space-space-booking";

const SPACES = [
  { id: "conti-room", name: "콘티룸", capacity: 4, equipmentTags: ["4K 모니터"] },
  { id: "rec-booth", name: "녹음부스", capacity: 2, equipmentTags: ["마이크"] },
];

// 2026-09-30 09:00 KST
const NOW = Date.UTC(2026, 8, 30, 0, 0, 0);

function book(date: string, start: string, end: string, roster: string) {
  render(<StudioVirtualSpaceSpaceBookingPanel spaces={SPACES} nowMs={NOW} />);
  fireEvent.change(screen.getByLabelText(/날짜/), { target: { value: date } });
  fireEvent.change(screen.getByLabelText(/시작/), { target: { value: start } });
  fireEvent.change(screen.getByLabelText(/종료/), { target: { value: end } });
  fireEvent.change(screen.getByLabelText(/예약자/), { target: { value: roster } });
  fireEvent.click(screen.getByRole("button", { name: "예약하기" }));
}

describe("StudioVirtualSpaceSpaceBookingPanel", () => {
  it("예약을 만들고 하루 일정에 표시한다", () => {
    book("2026-09-30", "10:00", "11:00", "김작가, 이작가");
    expect(screen.queryByRole("alert")).toBeNull();
    const items = screen.getAllByRole("listitem");
    expect(items.some((item) => item.textContent?.includes("김작가, 이작가"))).toBe(true);
  });

  it("겹치는 예약은 대기열 안내를 보여준다", () => {
    render(<StudioVirtualSpaceSpaceBookingPanel spaces={SPACES} nowMs={NOW} />);
    const date = screen.getByLabelText(/날짜/);
    const start = screen.getByLabelText(/시작/);
    const end = screen.getByLabelText(/종료/);
    const roster = screen.getByLabelText(/예약자/);
    const bookButton = screen.getByRole("button", { name: "예약하기" });
    fireEvent.change(date, { target: { value: "2026-09-30" } });
    fireEvent.change(start, { target: { value: "10:00" } });
    fireEvent.change(end, { target: { value: "11:00" } });
    fireEvent.change(roster, { target: { value: "김작가" } });
    fireEvent.click(bookButton);
    fireEvent.change(start, { target: { value: "10:30" } });
    fireEvent.change(end, { target: { value: "11:30" } });
    fireEvent.click(bookButton);
    expect(screen.getByRole("alert")).toBeTruthy();
    // 대기열 등록
    fireEvent.click(screen.getByRole("button", { name: "대기열 등록" }));
    expect(screen.getByText("대기열")).toBeTruthy();
  });

  it("예약을 취소하면 목록에서 사라진다", () => {
    book("2026-09-30", "10:00", "11:00", "김작가");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    const items = screen.queryAllByRole("listitem");
    expect(items.some((item) => item.textContent?.includes("김작가"))).toBe(false);
  });

  it("취소하면 대기 1순위가 예약으로 승격되고 대기열에서만 사라진다", () => {
    render(<StudioVirtualSpaceSpaceBookingPanel spaces={SPACES} nowMs={NOW} />);
    fireEvent.change(screen.getByLabelText(/날짜/), { target: { value: "2026-09-30" } });
    fireEvent.change(screen.getByLabelText(/시작/), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText(/종료/), { target: { value: "11:00" } });
    fireEvent.change(screen.getByLabelText(/예약자/), { target: { value: "김작가" } });
    fireEvent.click(screen.getByRole("button", { name: "예약하기" }));
    // 같은 시간대에 이작가가 대기열 등록
    fireEvent.change(screen.getByLabelText(/예약자/), { target: { value: "이작가" } });
    fireEvent.click(screen.getByRole("button", { name: "예약하기" }));
    fireEvent.click(screen.getByRole("button", { name: "대기열 등록" }));
    expect(screen.getByText("대기열")).toBeTruthy();
    // 김작가 예약을 취소하면 이작가 예약이 일정에 나타나야 한다
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    const items = screen.getAllByRole("listitem");
    expect(items.some((item) => item.textContent?.includes("이작가"))).toBe(true);
    expect(screen.queryByText("대기열")).toBeNull();
    expect(screen.getByText(/대기 중이던 예약이 대신 확정됐어요/)).toBeTruthy();
  });

  it("제어 모드에서는 바깥 상태로 예약이 공유된다", () => {
    function Harness() {
      const [bookings, setBookings] = useState<readonly StudioSpaceBooking[]>([]);
      const [waitlist, setWaitlist] = useState<readonly StudioSpaceWaitlistEntry[]>([]);
      return (
        <>
          <StudioVirtualSpaceSpaceBookingPanel
            spaces={SPACES}
            nowMs={NOW}
            bookings={bookings}
            waitlist={waitlist}
            onBookingsChange={setBookings}
            onWaitlistChange={setWaitlist}
          />
          <p data-testid="shared-count">{bookings.length}</p>
        </>
      );
    }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/날짜/), { target: { value: "2026-09-30" } });
    fireEvent.change(screen.getByLabelText(/시작/), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText(/종료/), { target: { value: "11:00" } });
    fireEvent.change(screen.getByLabelText(/예약자/), { target: { value: "김작가" } });
    fireEvent.click(screen.getByRole("button", { name: "예약하기" }));
    expect(screen.getByTestId("shared-count").textContent).toBe("1");
  });

  it("게스트 보류 묶음이 있으면 확인 카드에 예약 내용과 버리기 고지를 보여 준다", () => {
    const onPromote = vi.fn();
    const onDismiss = vi.fn();
    render(
      <StudioVirtualSpaceSpaceBookingPanel
        spaces={SPACES}
        nowMs={NOW}
        guestPromotion={{
          bundle: {
            bookings: [
              {
                id: "g1",
                spaceId: "rec-booth",
                spaceName: "녹음부스",
                capacity: 2,
                equipmentTags: [],
                startsAt: NOW + 3_600_000,
                endsAt: NOW + 7_200_000,
                bookerNames: ["김작가", "이작가"],
                note: "",
                status: "confirmed",
              },
            ],
            waitlist: [],
          },
          summary: null,
          busy: false,
          onPromote,
          onDismiss,
          onClearSummary: vi.fn(),
        }}
      />,
    );
    const card = screen.getByTestId("guest-promotion");
    expect(card.textContent).toContain("녹음부스");
    expect(card.textContent).toContain("김작가, 이작가");
    expect(card.textContent).toContain("버리면 위 예약은 이 기기에서도 사라져요");
    fireEvent.click(screen.getByRole("button", { name: "계정으로 가져오기" }));
    expect(onPromote).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "버리기" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("승격 결과가 있으면 승격·충돌 건수와 충돌 사유를 보여 준다", () => {
    const onClearSummary = vi.fn();
    render(
      <StudioVirtualSpaceSpaceBookingPanel
        spaces={SPACES}
        nowMs={NOW}
        guestPromotion={{
          bundle: { bookings: [], waitlist: [] },
          summary: {
            promotedCount: 1,
            deferredCount: 0,
            rejected: [
              {
                kind: "booking",
                id: "g2",
                status: "rejected",
                code: "slot-taken",
                spaceName: "녹음부스",
                startsAt: NOW + 3_600_000,
                endsAt: NOW + 7_200_000,
              },
            ],
          },
          busy: false,
          onPromote: vi.fn(),
          onDismiss: vi.fn(),
          onClearSummary,
        }}
      />,
    );
    const result = screen.getByTestId("guest-promotion-result");
    expect(result.textContent).toContain("승격 1건");
    expect(result.textContent).toContain("충돌 1건");
    expect(result.textContent).toContain("승격 실패");
    expect(result.textContent).toContain("이미 예약됨");
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(onClearSummary).toHaveBeenCalledTimes(1);
  });

  it("보류가 비어 있으면 승격 카드를 그리지 않는다", () => {
    render(
      <StudioVirtualSpaceSpaceBookingPanel
        spaces={SPACES}
        nowMs={NOW}
        guestPromotion={{
          bundle: { bookings: [], waitlist: [] },
          summary: null,
          busy: false,
          onPromote: vi.fn(),
          onDismiss: vi.fn(),
          onClearSummary: vi.fn(),
        }}
      />,
    );
    expect(screen.queryByTestId("guest-promotion")).toBeNull();
    expect(screen.queryByTestId("guest-promotion-result")).toBeNull();
  });
});

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProductionDemoProject } from "./production-demo";
import { MemoryRouter } from "react-router-dom";
import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { ProductionTeamSurface } from "./ProductionTeamSurface";

const api = vi.hoisted(() => ({
  capabilities: vi.fn(),
  calendar: vi.fn(),
  syncCalendar: vi.fn(),
  disconnectGoogle: vi.fn(),
  connectGoogle: vi.fn(),
  mailto: vi.fn(),
  gmail: vi.fn(),
  drive: vi.fn(),
  backup: vi.fn(),
  signing: vi.fn(),
  provenance: vi.fn(),
  notification: vi.fn(),
  documenso: vi.fn(),
  toss: vi.fn(),
}));

vi.mock("./production-api", () => ({
  getProductionIntegrationCapabilities: api.capabilities,
  getProductionCalendarEvents: api.calendar,
  syncProductionGoogleCalendar: api.syncCalendar,
  disconnectGoogleProduction: api.disconnectGoogle,
  getGoogleProductionConnectUrl: api.connectGoogle,
  createProductionMailtoDraft: api.mailto,
  createProductionGmailDraft: api.gmail,
  uploadProductionGoogleDriveArtifact: api.drive,
  getProductionProjectBackup: api.backup,
  getProductionSigningPackage: api.signing,
  getProductionProvenance: api.provenance,
  sendProductionIntegrationNotification: api.notification,
  createProductionDocumensoEnvelope: api.documenso,
  confirmProductionTossPayment: api.toss,
  productionCalendarIcsUrl: (projectId: string) => `/api/production/projects/${projectId}/integrations/calendar.ics`,
  productionTaxInvoiceCsvUrl: (projectId: string) => `/api/production/projects/${projectId}/integrations/tax-invoices.csv`,
}));

vi.mock("./production-push-client", () => ({
  productionPushSupported: () => true,
  subscribeProductionPush: vi.fn(),
  unsubscribeProductionPush: vi.fn(),
}));

const aggregate = createProductionDemoProject();

function capabilities(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    zeroCostFirst: true,
    costPolicy: "zero-cost-only",
    budget: {
      resetsAt: "2026-09-16T00:00:00.000Z",
      limits: {
        googleCalendarSyncs: 20,
        gmailDrafts: 100,
        googleDriveUploads: 50,
        notifications: 200,
        documensoEnvelopes: 20,
      },
      used: {
        googleCalendarSyncs: 0,
        gmailDrafts: 0,
        googleDriveUploads: 0,
        notifications: 0,
        documensoEnvelopes: 0,
      },
      remaining: {
        googleCalendarSyncs: 20,
        gmailDrafts: 100,
        googleDriveUploads: 50,
        notifications: 200,
        documensoEnvelopes: 20,
      },
    },
    calendar: {
      icsExport: true,
      googleTemplateLinks: true,
      googleApiConfigured: false,
      googleConnected: false,
    },
    email: {
      mailtoDraft: true,
      gmailApiConfigured: false,
      googleConnected: false,
    },
    drive: {
      googleApiConfigured: false,
      googleConnected: false,
      scope: "drive.file",
      artifacts: [
        "project-backup",
        "calendar-ics",
        "provenance-json",
        "tax-invoice-csv",
        "tax-invoice-sheet",
      ],
    },
    notifications: {
      webPush: false,
      vapidPublicKey: null,
      genericWebhook: false,
      discord: false,
      ntfy: false,
    },
    signatures: {
      documensoConfigured: false,
      selfHosted: false,
      hostedAllowed: false,
      manualSigningPackage: true,
      fallback: "download-pdf-and-sign-manually",
    },
    payments: {
      tossConfigured: false,
      mode: "disabled",
    },
    taxInvoice: {
      csvExport: true,
      googleSheetExport: false,
      automaticIssuance: false,
    },
    provenance: {
      hashManifest: true,
      c2paDraft: true,
      trustedCertificateSigning: false,
    },
    ...overrides,
  };
}


vi.mock("./ProductionProjectCoverSettings", () => ({ ProductionProjectCoverSettings: () => null }));
vi.mock("./ProductionScopedWriteSection", () => ({ ProductionScopedWriteSection: () => null }));
vi.mock("./ProductionCollaborationRoleSection", () => ({ ProductionCollaborationRoleSection: () => null }));
vi.mock("./ProductionRoleWorkspace", () => ({ ProductionCrewCoverage: () => null }));

const owner = { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" as const };
const realProject: ProductionProjectAggregate = {
  ...aggregate, projectId: "synthetic-real-project", title: "합성 실제 프로젝트",
  invoices: aggregate.invoices.map((invoice, index) => ({ ...invoice, id: `synthetic-invoice-${index}`, amountMinor: 42000 + index })),
};
const event = (title: string) => ({ key: title, title, startsAt: "2026-11-06T12:00:00.000Z", googleCalendarUrl: "https://example.test/calendar" });
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("합성 비동기 응답이 아직 준비되지 않았습니다."); };
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function view(project: ProductionProjectAggregate, isDemo = false) {
  return <MemoryRouter><ProductionTeamSurface aggregate={project} access={owner} isDemo={isDemo} /></MemoryRouter>;
}
const field = (name: string) => screen.getByLabelText<HTMLInputElement>(name).value;

beforeEach(() => {
  for (const mock of Object.values(api)) mock.mockReset();
  api.capabilities.mockResolvedValue(capabilities());
  api.calendar.mockResolvedValue({ events: [] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("프로젝트 전환에서 외부 연동 상태를 격리한다", () => {
  it("샘플에서 실제 프로젝트로 전환할 때 입력과 청구 금액을 초기화한다", async () => {
    const mounted = render(view(aggregate, true));
    await screen.findByText("일정 · Google Calendar");
    fireEvent.change(screen.getByLabelText("받는 사람"), { target: { value: "prior@example.test" } });
    fireEvent.change(screen.getByLabelText("메시지"), { target: { value: "이전 프로젝트 전용 메시지" } });
    fireEvent.change(screen.getByLabelText("Toss paymentKey"), { target: { value: "synthetic-old-key" } });
    fireEvent.change(screen.getByLabelText("Toss orderId"), { target: { value: "synthetic-old-order" } });
    fireEvent.change(screen.getByLabelText("Toss amount"), { target: { value: "99000" } });
    fireEvent.change(screen.getByLabelText("서명자 이름"), { target: { value: "합성 이전 서명자" } });
    mounted.rerender(view(realProject));
    await screen.findByText("일정 · Google Calendar");
    expect({ email: field("받는 사람"), message: field("메시지"), paymentKey: field("Toss paymentKey"), orderId: field("Toss orderId"), amount: field("Toss amount"), signer: field("서명자 이름"), invoice: field("청구서") }).toEqual({
      email: "", message: `${realProject.title} 제작 프로젝트의 최신 일정과 검토 항목을 확인해 주세요.`, paymentKey: "", orderId: "", amount: "42000", signer: "", invoice: "synthetic-invoice-0",
    });
  });

  it("화면 청구서와 실제 검증 payload가 모두 새 프로젝트의 청구서를 가리킨다", async () => {
    api.capabilities.mockResolvedValue(capabilities({ payments: { tossConfigured: true, mode: "test" } }));
    api.toss.mockResolvedValue({});
    const mounted = render(view(aggregate, true));
    await screen.findByText("일정 · Google Calendar");
    mounted.rerender(view(realProject));
    await screen.findByText("일정 · Google Calendar");
    fireEvent.change(screen.getByLabelText("Toss paymentKey"), { target: { value: "synthetic-new-key" } });
    fireEvent.change(screen.getByLabelText("Toss orderId"), { target: { value: "synthetic-new-order" } });
    fireEvent.click(screen.getByRole("button", { name: "테스트 결제 검증" }));
    await waitFor(() => expect(api.toss).toHaveBeenCalledTimes(1));
    expect(api.toss).toHaveBeenCalledWith(realProject.projectId, { paymentKey: "synthetic-new-key", orderId: "synthetic-new-order", invoiceId: "synthetic-invoice-0", amount: 42000 });
  });

  it("실제 프로젝트 사이의 반복 전환도 이전 입력을 되살리지 않는다", async () => {
    const anotherReal = { ...realProject, projectId: "synthetic-second-real", title: "다른 합성 실제 프로젝트" };
    const mounted = render(view(realProject));
    await screen.findByText("일정 · Google Calendar");
    fireEvent.change(screen.getByLabelText("받는 사람"), { target: { value: "first@example.test" } });
    mounted.rerender(view(anotherReal));
    await screen.findByText("일정 · Google Calendar");
    expect(field("받는 사람")).toBe("");
    fireEvent.change(screen.getByLabelText("받는 사람"), { target: { value: "second@example.test" } });
    mounted.rerender(view(realProject));
    await screen.findByText("일정 · Google Calendar");
    expect(field("받는 사람")).toBe("");
  });

  it("새 프로젝트 조회가 실패하면 이전 프로젝트의 외부 연동 권한을 사용하지 않는다", async () => {
    api.capabilities.mockResolvedValueOnce(capabilities({ drive: { googleConnected: true, googleApiConfigured: true }, payments: { tossConfigured: true, mode: "test" } }));
    const mounted = render(view(aggregate, true));
    await screen.findByText("일정 · Google Calendar");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Google Drive에 저장" }).disabled).toBe(false);
    api.capabilities.mockRejectedValueOnce(new Error("합성 권한 조회 실패"));
    mounted.rerender(view(realProject));
    await screen.findByRole("alert");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Google Drive에 저장" }).disabled).toBe(true);
    expect(screen.getByText("현재 모드: disabled")).toBeTruthy();
    expect(api.drive).not.toHaveBeenCalled();
    expect(api.toss).not.toHaveBeenCalled();
  });

  it("이전 프로젝트의 늦은 최초 조회 응답은 새 프로젝트 일정을 덮지 않는다", async () => {
    const oldCalendar = deferred<{ events: ReturnType<typeof event>[] }>();
    api.calendar.mockReturnValueOnce(oldCalendar.promise).mockResolvedValueOnce({ events: [event("새 샘플 일정")] });
    const mounted = render(view(realProject));
    mounted.rerender(view(aggregate, true));
    await screen.findByText("새 샘플 일정");
    await act(async () => { oldCalendar.resolve({ events: [event("이전 실제 일정")] }); });
    expect(screen.queryByText("이전 실제 일정")).toBeNull();
    expect(screen.getByText("새 샘플 일정")).toBeTruthy();
  });

  it("이전 프로젝트의 늦은 새로고침 응답은 샘플 일정과 권한을 덮지 않는다", async () => {
    const refreshCalendar = deferred<{ events: ReturnType<typeof event>[] }>();
    api.capabilities.mockResolvedValueOnce(capabilities({ calendar: { googleConnected: true, googleApiConfigured: true } }))
      .mockResolvedValueOnce(capabilities({ drive: { googleConnected: true, googleApiConfigured: true } }))
      .mockResolvedValueOnce(capabilities());
    api.calendar.mockResolvedValueOnce({ events: [] }).mockReturnValueOnce(refreshCalendar.promise).mockResolvedValueOnce({ events: [event("새 샘플 일정")] });
    api.disconnectGoogle.mockResolvedValue({});
    const mounted = render(view(realProject));
    await screen.findByText("일정 · Google Calendar");
    fireEvent.click(screen.getByRole("button", { name: "연결 해제" }));
    await waitFor(() => expect(api.calendar).toHaveBeenCalledTimes(2));
    mounted.rerender(view(aggregate, true));
    await screen.findByText("새 샘플 일정");
    await act(async () => { refreshCalendar.resolve({ events: [event("이전 실제 일정")] }); });
    expect(screen.queryByText("이전 실제 일정")).toBeNull();
    expect(screen.getByText("새 샘플 일정")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Google Drive에 저장" }).disabled).toBe(true);
  });

  it("이전 프로젝트 비동기 작업의 성공 알림을 새 프로젝트에 표시하지 않는다", async () => {
    const pendingDraft = deferred<unknown>();
    api.capabilities.mockResolvedValue(capabilities({ email: { googleConnected: true, gmailApiConfigured: true } }));
    api.gmail.mockReturnValueOnce(pendingDraft.promise);
    const mounted = render(view(realProject));
    await screen.findByText("일정 · Google Calendar");
    fireEvent.change(screen.getByLabelText("받는 사람"), { target: { value: "synthetic@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Gmail 초안 만들기" }));
    mounted.rerender(view(aggregate, true));
    await screen.findByText("일정 · Google Calendar");
    await act(async () => { pendingDraft.resolve({}); });
    expect(screen.queryByText("Gmail 초안을 만들었습니다.")).toBeNull();
    expect(api.gmail).toHaveBeenCalledTimes(1);
    expect(api.gmail.mock.calls[0]?.[0]).toBe(realProject.projectId);
  });

  it("같은 sample-project 식별자라도 명시적 샘플 모드가 바뀌면 입력을 초기화한다", async () => {
    const mounted = render(view(aggregate, true));
    await screen.findByText("일정 · Google Calendar");
    fireEvent.change(screen.getByLabelText("받는 사람"), { target: { value: "prior@example.test" } });
    mounted.rerender(view(aggregate, false));
    await screen.findByText("일정 · Google Calendar");
    expect(field("받는 사람")).toBe("");
  });

  it("실제 프로젝트에 isDemo가 잘못 전달돼도 같은 프로젝트 입력을 버리지 않는다", async () => {
    const mounted = render(view(realProject, false));
    await screen.findByText("일정 · Google Calendar");
    fireEvent.change(screen.getByLabelText("받는 사람"), { target: { value: "preserved@example.test" } });
    mounted.rerender(view(realProject, true));
    expect(field("받는 사람")).toBe("preserved@example.test");
    expect(api.capabilities).toHaveBeenCalledTimes(1);
  });
});

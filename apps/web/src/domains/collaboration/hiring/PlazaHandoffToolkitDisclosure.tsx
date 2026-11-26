import {
  CheckCircle2,
  Download,
  FileSearch,
  GraduationCap,
  Palette,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  studioEcosystemClient,
  type AcademyClassroomView,
  type ManuscriptColorProfileView,
  type PartyStarterKitView,
  type PlazaPreflightResultView,
} from "@/platform/studio-ecosystem-client";

import { HandoffProofGuestDiffPanel } from "./HandoffProofGuestDiffPanel";

const DEFAULT_STARTER_KIT: PartyStarterKitView = {
  partyId: "party-gate-01",
  workTitle: "헌터 액션 주간연재 · 게이트 브레이커",
  canvasWidthPx: 1440,
  dpi: 300,
  colorProfile: "sRGB",
  brushSpecKo: "주선 G펜 7px · 필압 최소 35% · 안티에일리어싱 중간 고정",
  perspectiveGuideKo: "실내 2점 투시 기준 · 아이레벨 세로 42% 유지",
  colorChips: [
    { roleKo: "주인공 눈동자", hex: "#2B5B84" },
    { roleKo: "기본 피부 베이스", hex: "#F6DFD0" },
    { roleKo: "마력 각성 이펙트", hex: "#38BDF8" },
  ],
  updatedAt: "2026-11-26T06:00:00.000Z",
};

const DEFAULT_CLASSROOMS: readonly AcademyClassroomView[] = [
  {
    classroomId: "acad-seed-01",
    institutionName: "서울 웹툰창작 아카데미",
    courseTitle: "주간연재 콘티·선화 실전 합평반",
    instructorName: "강현우 지도강사",
    cohortSize: 24,
    inviteCode: "ACAD-SEOUL26",
    feeKrw: 0,
    targetWidthPx: 1440,
    targetDpi: 300,
    submissions: [
      {
        submissionId: "sub-seed-1",
        studentName: "수강생_정하린",
        episodeCutLabel: "3주차 과제 · 1화 08~12컷",
        unresolvedPinCount: 0,
        passedSpecPreflight: true,
        approvalLocked: false,
      },
    ],
  },
];

function evaluateLocalPreflightFallback(
  kit: PartyStarterKitView,
  input: {
    fileName: string;
    widthPx: number;
    dpi: number;
    colorProfile: ManuscriptColorProfileView;
    changedLayersCount: number;
    unresolvedPins: number;
  },
): PlazaPreflightResultView {
  const issues: {
    code: string;
    severity: "blocker" | "warning";
    messageKo: string;
  }[] = [];
  if (input.widthPx !== kit.canvasWidthPx) {
    issues.push({
      code: "width_mismatch",
      severity: "blocker",
      messageKo: `가로 폭 불일치: 파티 기준 ${kit.canvasWidthPx}px ↔ 제출 파일 ${input.widthPx}px`,
    });
  }
  if (input.dpi !== kit.dpi) {
    issues.push({
      code: "dpi_mismatch",
      severity: "warning",
      messageKo: `해상도(DPI) 차이: 파티 기준 ${kit.dpi}dpi ↔ 제출 파일 ${input.dpi}dpi`,
    });
  }
  if (input.colorProfile !== kit.colorProfile) {
    issues.push({
      code: "color_profile_mismatch",
      severity: "blocker",
      messageKo: `컬러 모드 이탈: 파티 기준 ${kit.colorProfile} ↔ 제출 파일 ${input.colorProfile}`,
    });
  }
  if (input.changedLayersCount === 0) {
    issues.push({
      code: "no_changed_layers",
      severity: "warning",
      messageKo: "이전 버전 대비 변경된 수정 레이어 목록이 감지되지 않았습니다.",
    });
  }
  if (input.unresolvedPins > 0) {
    issues.push({
      code: "unresolved_mandatory_pins",
      severity: "blocker",
      messageKo: `미해결 필수 수정 핀 ${input.unresolvedPins}건이 남아 최종 승인이 잠깁니다.`,
    });
  }
  const hasBlocker = issues.some((i) => i.severity === "blocker");
  return {
    passed: !hasBlocker,
    parsedFromBinary: false,
    fileName: input.fileName,
    expectedWidthPx: kit.canvasWidthPx,
    expectedDpi: kit.dpi,
    expectedColorProfile: kit.colorProfile,
    detectedWidthPx: input.widthPx,
    detectedDpi: input.dpi,
    detectedColorProfile: input.colorProfile,
    changedLayerCount: input.changedLayersCount,
    unresolvedMandatoryPinCount: input.unresolvedPins,
    issues,
    summaryKo: !hasBlocker
      ? "원고 규격·컬러 모드·필수 수정 핀 검사를 모두 통과했습니다."
      : `승인 보류: 필수 규격·수정 핀 미충족 ${issues.filter((i) => i.severity === "blocker").length}건`,
  };
}

export function PlazaHandoffToolkitDisclosure({
  partyId,
}: {
  readonly partyId: string;
}) {
  const [tab, setTab] = useState<"starter-kit" | "preflight" | "academy">(
    "starter-kit",
  );
  const [kit, setKit] = useState<PartyStarterKitView>(DEFAULT_STARTER_KIT);
  const [kitStatus, setKitStatus] = useState<string>("");

  const [testFileName, setTestFileName] = useState("ep48_cut08_rev2.psd");
  const [testWidth, setTestWidth] = useState(1440);
  const testDpi = 300;
  const [testProfile, setTestProfile] =
    useState<ManuscriptColorProfileView>("sRGB");
  const [testUnresolvedPins, setTestUnresolvedPins] = useState(0);
  const [preflightRes, setPreflightRes] =
    useState<PlazaPreflightResultView | null>(null);

  const [classrooms, setClassrooms] =
    useState<readonly AcademyClassroomView[]>(DEFAULT_CLASSROOMS);
  const [instName, setInstName] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [academyNotice, setAcademyNotice] = useState("");

  useEffect(() => {
    let active = true;
    void studioEcosystemClient
      .getPartyStarterKit(partyId)
      .then((res) => {
        if (active && res?.partyId) setKit(res);
      })
      .catch(() => {});
    void studioEcosystemClient
      .listAcademyClassrooms()
      .then((res) => {
        if (active && Array.isArray(res?.items) && res.items.length > 0) {
          setClassrooms(res.items);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [partyId]);

  const handleDownloadStarterKit = () => {
    const json = JSON.stringify(kit, null, 2);
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      try {
        const blob = new Blob([json], { type: "application/json;charset=utf-8" });
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = `toonstudio-starter-kit-${kit.partyId}.json`;
        a.click();
        URL.revokeObjectURL(href);
      } catch {
        // 테스트·제한 환경에서는 다운로드 알림만 갱신한다.
      }
    }
    setKitStatus(
      `[${kit.workTitle}] 컬러칩(${kit.colorChips.length}색)·브러시·해상도 인계 팩을 내려받았습니다.`,
    );
  };

  const handleRunPreflight = async () => {
    const cleanFile = testFileName.trim() || "manuscript.clip";
    try {
      const res = await studioEcosystemClient.inspectManuscriptPreflight({
        partyId,
        fileName: cleanFile,
        reportedWidthPx: testWidth,
        reportedDpi: testDpi,
        reportedColorProfile: testProfile,
        changedLayerNames: ["선화_수정_08컷"],
        unresolvedMandatoryPinCount: testUnresolvedPins,
      });
      setPreflightRes(res);
    } catch {
      setPreflightRes(
        evaluateLocalPreflightFallback(kit, {
          fileName: cleanFile,
          widthPx: testWidth,
          dpi: testDpi,
          colorProfile: testProfile,
          changedLayersCount: 1,
          unresolvedPins: testUnresolvedPins,
        }),
      );
    }
  };

  const handleCreateClassroom = async () => {
    const inst = instName.trim();
    const course = courseTitle.trim();
    if (inst.length < 2 || course.length < 2) return;
    try {
      const created = await studioEcosystemClient.createAcademyClassroom({
        institutionName: inst,
        courseTitle: course,
        instructorName: "담당 교수·강사",
        cohortSize: 25,
      });
      setClassrooms((prev) => [created, ...prev]);
      setAcademyNotice(
        `무상 합평 보드 [${created.courseTitle}] 개설 완료 · 초대 코드 ${created.inviteCode}`,
      );
    } catch {
      const fallbackCode = `ACAD-${Date.now().toString(36).slice(-5).toUpperCase()}`;
      const localCreated: AcademyClassroomView = {
        classroomId: `local-${Date.now().toString(36)}`,
        institutionName: inst,
        courseTitle: course,
        instructorName: "담당 교수·강사",
        cohortSize: 25,
        inviteCode: fallbackCode,
        feeKrw: 0,
        targetWidthPx: 1440,
        targetDpi: 300,
        submissions: [],
      };
      setClassrooms((prev) => [localCreated, ...prev]);
      setAcademyNotice(
        `무상 합평 보드 [${localCreated.courseTitle}] 개설 완료 · 초대 코드 ${localCreated.inviteCode}`,
      );
    }
    setInstName("");
    setCourseTitle("");
  };

  return (
    <details
      data-testid="plaza-handoff-toolkit-disclosure"
      className="group rounded-xl border border-line bg-card p-3.5 sm:p-4"
    >
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-xs font-semibold text-fg">
        <span>
          대타 스타일시트 인계 팩 · `.clip/.psd` 규격 자동 점검 · 학원/대학 무상 합평 보드
        </span>
        <span className="rounded-md border border-accent/35 bg-accent-soft px-2 py-0.5 text-[11px] font-medium tabular-nums text-accent">
          기준 {kit.canvasWidthPx}px · {kit.dpi}dpi · 합평반 {classrooms.length}개
        </span>
      </summary>

      <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="인계 보조 도구 선택"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "starter-kit"}
            onClick={() => setTab("starter-kit")}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs sm:min-h-8 ${
              tab === "starter-kit"
                ? "border-accent bg-accent-soft font-semibold text-accent"
                : "border-line bg-panel text-fg-2"
            }`}
          >
            <Palette className="size-3.5" aria-hidden="true" />
            작품 스타일시트·컬러칩 팩
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "preflight"}
            onClick={() => setTab("preflight")}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs sm:min-h-8 ${
              tab === "preflight"
                ? "border-accent bg-accent-soft font-semibold text-accent"
                : "border-line bg-panel text-fg-2"
            }`}
          >
            <FileSearch className="size-3.5" aria-hidden="true" />
            `.clip/.psd` 규격 자동 점검
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "academy"}
            onClick={() => setTab("academy")}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs sm:min-h-8 ${
              tab === "academy"
                ? "border-accent bg-accent-soft font-semibold text-accent"
                : "border-line bg-panel text-fg-2"
            }`}
          >
            <GraduationCap className="size-3.5" aria-hidden="true" />
            웹툰 학원·대학 무상 합평 보드
          </button>
        </div>

        {tab === "starter-kit" ? (
          <div className="rounded-lg border border-line bg-panel p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-fg">{kit.workTitle}</p>
                <p className="mt-0.5 tabular-nums text-fg-3">
                  가로 {kit.canvasWidthPx}px · {kit.dpi}dpi · {kit.colorProfile} ·{" "}
                  {kit.brushSpecKo}
                </p>
              </div>
              <button
                type="button"
                data-testid="download-starter-kit-btn"
                onClick={handleDownloadStarterKit}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-on-accent transition-opacity duration-150 hover:opacity-90 sm:min-h-8"
              >
                <Download className="size-3.5" aria-hidden="true" />
                1클릭 인계 팩 내려받기
              </button>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {kit.colorChips.map((chip) => (
                <span
                  key={`${chip.roleKo}-${chip.hex}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-1 text-[11px] tabular-nums text-fg-2"
                >
                  <span
                    className="size-3 rounded-sm outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                    style={{ backgroundColor: chip.hex }}
                    aria-hidden="true"
                  />
                  {chip.roleKo} ({chip.hex})
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-fg-3">{kit.perspectiveGuideKo}</p>
            {kitStatus ? (
              <p role="status" className="mt-2 text-xs font-medium text-good">
                {kitStatus}
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === "preflight" ? (
          <div className="rounded-lg border border-line bg-panel p-3 text-xs">
            <div className="grid gap-2 sm:grid-cols-4">
              <input
                type="text"
                value={testFileName}
                onChange={(e) => setTestFileName(e.target.value)}
                aria-label="점검할 원고 파일명"
                className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs text-fg sm:min-h-9"
              />
              <input
                type="number"
                value={testWidth}
                onChange={(e) => setTestWidth(Number(e.target.value) || 0)}
                aria-label="제출 가로 폭(px)"
                className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs tabular-nums text-fg sm:min-h-9"
              />
              <select
                aria-label="제출 컬러 모드"
                value={testProfile}
                onChange={(e) =>
                  setTestProfile(e.target.value as ManuscriptColorProfileView)
                }
                className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs text-fg sm:min-h-9"
              >
                <option value="sRGB">sRGB (웹 연재 표준)</option>
                <option value="CMYK">CMYK (인쇄용 · 이탈 확인)</option>
                <option value="Display-P3">Display-P3</option>
              </select>
              <select
                aria-label="미해결 필수 수정 핀 수"
                value={testUnresolvedPins}
                onChange={(e) => setTestUnresolvedPins(Number(e.target.value))}
                className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs tabular-nums text-fg sm:min-h-9"
              >
                <option value={0}>미해결 필수 핀 0건</option>
                <option value={1}>미해결 필수 핀 1건</option>
                <option value={2}>미해결 필수 핀 2건</option>
              </select>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] tabular-nums text-fg-3">
                파티 기준: 가로 {kit.canvasWidthPx}px · {kit.dpi}dpi · {kit.colorProfile}
              </span>
              <button
                type="button"
                data-testid="run-manuscript-preflight-btn"
                onClick={() => void handleRunPreflight()}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-on-accent transition-opacity duration-150 hover:opacity-90 sm:min-h-8"
              >
                원고 규격·승인 잠금 자동 대조
              </button>
            </div>
            {preflightRes ? (
              <div
                data-testid="preflight-result-banner"
                className={`mt-2.5 rounded-lg border p-2.5 ${
                  preflightRes.passed
                    ? "border-good/40 bg-good/10 text-good"
                    : "border-bad/40 bg-bad/10 text-bad"
                }`}
              >
                <p className="flex items-center gap-1.5 font-semibold">
                  {preflightRes.passed ? (
                    <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <XCircle className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  {preflightRes.summaryKo}
                </p>
                {preflightRes.issues.length > 0 ? (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px]">
                    {preflightRes.issues.map((iss) => (
                      <li key={iss.code}>{iss.messageKo}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "academy" ? (
          <div className="rounded-lg border border-line bg-panel p-3 text-xs">
            <p className="text-[11px] leading-[1.5] text-fg-3 [word-break:keep-all]">
              웹툰 학원·대학 만화창작과 합평 수업에 필수 수정 핀·재제출 승인 잠금 보드를 무료(이용료 0원)로 개방해, 졸업 후 현업으로 진출하는 신인 작가·어시스턴트 풀이 자연스럽게 정착하도록 지원합니다.
            </p>
            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={instName}
                onChange={(e) => setInstName(e.target.value)}
                aria-label="교육기관·학과명"
                placeholder="교육기관·학과명 (예: 한국만화대 웹툰과)"
                className="min-h-11 flex-1 rounded-lg border border-line bg-card px-2.5 text-xs text-fg sm:min-h-9"
              />
              <input
                type="text"
                value={courseTitle}
                onChange={(e) => setCourseTitle(e.target.value)}
                aria-label="합평 수업·기수명"
                placeholder="수업명 (예: 2학기 창작실습 합평반)"
                className="min-h-11 flex-1 rounded-lg border border-line bg-card px-2.5 text-xs text-fg sm:min-h-9"
              />
              <button
                type="button"
                disabled={instName.trim().length < 2 || courseTitle.trim().length < 2}
                data-testid="create-academy-classroom-btn"
                onClick={() => void handleCreateClassroom()}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-3 text-xs font-medium text-on-accent transition-opacity duration-150 hover:opacity-90 disabled:opacity-45 sm:min-h-9"
              >
                무상 합평반 개설
              </button>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {classrooms.slice(0, 3).map((cls) => (
                <li
                  key={cls.classroomId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-card px-2.5 py-2"
                >
                  <span>
                    <strong className="font-semibold text-fg">
                      {cls.institutionName}
                    </strong>{" "}
                    · {cls.courseTitle} ({cls.cohortSize}명 · 무상 0원)
                  </span>
                  <span className="rounded bg-accent-soft px-2 py-0.5 text-[11px] font-semibold tabular-nums text-accent">
                    초대코드 {cls.inviteCode}
                  </span>
                </li>
              ))}
            </ul>
            {academyNotice ? (
              <p role="status" className="mt-2 text-xs font-medium text-good">
                {academyNotice}
              </p>
            ) : null}
          </div>
        ) : null}

        <HandoffProofGuestDiffPanel workTitle={kit.workTitle} />
      </div>
    </details>
  );
}

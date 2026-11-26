import { describe, expect, it } from "vitest";

import { StudioEcosystemEventsService } from "./studio-ecosystem-events.service";
import {
  PlazaHandoffOpsService,
  parsePsdHeaderBase64,
} from "./plaza-handoff-ops.service";

function buildPsdHeaderBase64(opts: {
  width: number;
  height: number;
  colorMode: 1 | 3 | 4;
}): string {
  const buf = Buffer.alloc(26);
  buf.write("8BPS", 0, "ascii");
  buf.writeUInt16BE(1, 4); // PSD v1
  buf.writeUInt16BE(4, 12); // channels
  buf.writeUInt32BE(opts.height, 14);
  buf.writeUInt32BE(opts.width, 18);
  buf.writeUInt16BE(8, 22); // 8-bit
  buf.writeUInt16BE(opts.colorMode, 24);
  return buf.toString("base64");
}

describe("PlazaHandoffOpsService (5대 확장 기능: 신뢰 배지·인계 팩·PSD 규격 점검·합평 보드)", () => {
  it("주관적 별점 대신 승인 잠금 1회 통과율·정시 마감률 기반 객관 배지를 산출한다", () => {
    const events = new StudioEcosystemEventsService();
    const service = new PlazaHandoffOpsService(events);

    const seeded = service.listTrustBadges().items.find((x) => x.avatarId === "av-1");
    expect(seeded?.badgeTier).toBe("studio-anchor");
    expect(seeded?.onTimeDeliveryRatePct).toBeGreaterThanOrEqual(95);

    let latest = service.recordVerifiedHandoff({
      avatarId: "av-new",
      nickname: "신규선화_민서",
      deliveredOnTime: true,
      passedFirstLock: true,
      responseMinutes: 8,
    });
    expect(latest.badgeTier).toBe("unverified");

    service.recordVerifiedHandoff({
      avatarId: "av-new",
      deliveredOnTime: true,
      passedFirstLock: true,
      responseMinutes: 7,
    });
    latest = service.recordVerifiedHandoff({
      avatarId: "av-new",
      deliveredOnTime: true,
      passedFirstLock: true,
      responseMinutes: 9,
    });
    expect(latest.verifiedHandoffCount).toBe(3);
    expect(latest.badgeTier).toBe("verified-handoff");
  });

  it("파티별 스타일시트·컬러칩·브러시 인계 팩을 저장하고 PSD(8BPS) 바이너리 헤더 및 필수 핀 잠금을 대조한다", () => {
    const service = new PlazaHandoffOpsService();

    const savedKit = service.saveStarterKit("party-rofan-01", {
      workTitle: "황녀의 시간 시계탑",
      canvasWidthPx: 1440,
      dpi: 300,
      colorProfile: "sRGB",
      brushSpecKo: "주선 G펜 6px · 필압 40%",
      perspectiveGuideKo: "실내 1점 투시",
      colorChips: [{ roleKo: "여주 눈동자", hex: "#7c3aed" }],
    });
    expect(savedKit.colorChips[0]?.hex).toBe("#7C3AED");

    const okHeader = buildPsdHeaderBase64({
      width: 1440,
      height: 8000,
      colorMode: 3, // RGB
    });
    expect(parsePsdHeaderBase64(okHeader)).toEqual({
      widthPx: 1440,
      heightPx: 8000,
      colorProfile: "sRGB",
    });

    const passRes = service.inspectManuscriptPreflight({
      partyId: "party-rofan-01",
      fileName: "ep01_cut03.psd",
      headerBase64: okHeader,
      reportedDpi: 300,
      changedLayerNames: ["선화_여주_수정"],
      unresolvedMandatoryPinCount: 0,
    });
    expect(passRes.passed).toBe(true);
    expect(passRes.parsedFromBinary).toBe(true);
    expect(passRes.issues).toHaveLength(0);

    const badCmykHeader = buildPsdHeaderBase64({
      width: 1200,
      height: 8000,
      colorMode: 4, // CMYK
    });
    const blockRes = service.inspectManuscriptPreflight({
      partyId: "party-rofan-01",
      fileName: "ep01_cut03_wrong.psd",
      headerBase64: badCmykHeader,
      reportedDpi: 72,
      changedLayerNames: [],
      unresolvedMandatoryPinCount: 2,
    });
    expect(blockRes.passed).toBe(false);
    expect(blockRes.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        "width_mismatch",
        "dpi_mismatch",
        "color_profile_mismatch",
        "no_changed_layers",
        "unresolved_mandatory_pins",
      ]),
    );
  });

  it("웹툰 학원·대학 만화창작과 무상 합평 클래스룸(0원)을 개설하고 미해결 핀 과제 승인을 잠근다", () => {
    const service = new PlazaHandoffOpsService();

    const room = service.createAcademyClassroom({
      institutionName: "한국웹툰대학교 만화창작과",
      courseTitle: "2학기 디지털 웹툰 제작실습",
      instructorName: "박지훈 교수",
      cohortSize: 32,
    });
    expect(room.feeKrw).toBe(0);
    expect(room.inviteCode).toMatch(/^ACAD-/u);

    const lockedSub = service.submitClassroomCut(room.classroomId, {
      studentName: "학부생_김서윤",
      episodeCutLabel: "중간과제 1화 1~10컷",
      unresolvedPinCount: 1,
      passedSpecPreflight: true,
    });
    expect(lockedSub.approvalLocked).toBe(true);

    const unlockedSub = service.submitClassroomCut(room.classroomId, {
      studentName: "학부생_김서윤",
      episodeCutLabel: "중간과제 1화 재제출본",
      unresolvedPinCount: 0,
      passedSpecPreflight: true,
    });
    expect(unlockedSub.approvalLocked).toBe(false);
  });
});

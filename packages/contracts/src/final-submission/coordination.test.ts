import { describe, expect, it } from "vitest";

import {
  coordinationMissing, coordinationStatus, coordinationWarnings, createCoordinationItem, createEmptyFinalSubmissionBoard,
  importFinalSubmissionBoard, parseCoordinationItems, parseFinalSubmissionBoard, reconcileFinalSubmissionBoard,
} from "./index";

const proof = {label: "대조 기록", url: "https://example.test/proof"};
const hash = "a".repeat(64);
function confirmed() {
  return {...createCoordinationItem("CO-1","조정 기록"), latestVerified: true, refs: [proof], evidenceAt: "2026-01-01",
    checkedAt: "2026-01-02", owner: "검토자", status: "최종 확인" as const};
}

describe("제출 전 조정 원장", () => {
  it("기준 링크만 있으면 미확인이며 실측 근거와 확인 시점으로 완료를 판정한다", () => {
    const row = confirmed();
    expect(coordinationStatus(row)).toBe("최종 확인");
    expect(coordinationStatus({...row, refs: [], basisRefs: [proof]})).toBe("미확인");
    expect(coordinationStatus({...row, action: "실제 제출"})).toBe("승인 대기");
    expect(coordinationStatus({...row, latestVerified: false, status: "진행 중"})).toBe("미확인");
    expect(coordinationMissing({...row,required:["mentor","platform"]})).toEqual(["멘토 반영 여부","플랫폼 제출 상태"]);
  });
  it("후보 파일과 변경만 중복 비교하며 다른 종류의 버전은 순서를 추측하지 않는다", () => {
    const row = {...confirmed(),candidate:true,file:"제출.zip",digest:hash,version:"r5",approvedVersion:"r6",repo:"ini/board",pr:"#21",merge:"병합 완료"};
    const other = {...row,id:"CO-2",title:"다른 후보",pr:"https://github.com/ini/board/pull/21"};
    const messages = coordinationWarnings(row,[row,other]).join(" ");
    expect(messages).toMatch(/중복 제출 후보/); expect(messages).toMatch(/동일 PR/); expect(messages).toMatch(/구버전/);
    expect(coordinationWarnings({...row, candidate:false, version:"정본"}).join(" ")).not.toMatch(/중복|구버전/);
    expect(coordinationStatus(row,[row,other])).toBe("검토 필요");
  });
  it("이름이 같은 후보의 서로 다른 해시와 사본을 묶고 선택한 버전의 증빙을 검증한다", () => {
    const entry = {label:"원본",file:"같은.zip",version:"2026-01-01",sha:hash,note:""};
    const row = {...confirmed(),comparisons:[entry,{...entry,label:"사본"},{...entry,label:"다른 후보",sha:"b".repeat(64)}]};
    expect(coordinationWarnings(row)).toHaveLength(2);
    expect(coordinationStatus(row)).toBe("검토 필요");
    expect(coordinationStatus({...row,digest:hash})).toBe("최종 확인");
  });
  it("배포에는 같은 40자리 SHA·CI·스모크가 필요하고 미병합은 검토 대상으로 남는다", () => {
    const sha="a".repeat(40);
    const row={...confirmed(),deployment:"배포 완료",ci:"통과",smoke:"통과",commit:sha,ciCommit:sha,deployCommit:sha};
    expect(coordinationStatus(row)).toBe("최종 확인");
    expect(coordinationStatus({...row,deployCommit:sha.slice(0,8)})).toBe("미확인");
    expect(coordinationStatus({...row,deployCommit:"b".repeat(40)})).toBe("검토 필요");
    expect(coordinationWarnings({...row,merge:"미병합"})).toContain("미병합 변경");
  });
  it("과거 클라이언트·백업에서 빠진 원장을 보존하고 잘못된 링크, 해시, 중복 ID를 차단한다", () => {
    const board = createEmptyFinalSubmissionBoard();
    const row = confirmed();
    const previous = {...board,coordination:[row]};
    expect(importFinalSubmissionBoard(board,0,previous)).toEqual({ok:true,value:previous});
    expect(parseFinalSubmissionBoard(board,previous)).toEqual({ok:true,value:previous});
    expect(parseCoordinationItems([row,row])).toBeNull();
    expect(parseCoordinationItems([{...row,refs:[{label:"검증",url:"javascript:alert(1)"}]}])).toBeNull();
    expect(parseCoordinationItems([{...row,digest:"abc"}])).toBeNull();
    expect(parseCoordinationItems([{...row,required:["randomField"]}])).toBeNull();
  });
  it("기준·연결 문서가 변경되면 재확인하며 승인 대기 작업은 보존한다", () => {
    const row = {...confirmed(),sourceTaskId:"DOC-01"};
    const previous = {...createEmptyFinalSubmissionBoard(),coordination:[row]};
    const altered = {...previous,coordination:[{...row,file:"변경.docx"}]};
    expect(parseFinalSubmissionBoard(altered,previous).ok).toBe(false);
    const reconciled = reconcileFinalSubmissionBoard(altered,previous);
    expect(reconciled.coordination?.[0].latestVerified).toBe(false);
    expect(parseFinalSubmissionBoard(reconciled,previous).ok).toBe(true);
    const changedDoc = {...previous,documents:previous.documents.map(doc=>doc.id==="report" ? {...doc,notes:"새 관측"} : doc)};
    expect(reconcileFinalSubmissionBoard(changedDoc,previous).coordination?.[0].checkedAt).toBe("");
    expect(parseFinalSubmissionBoard({...previous,coordination:[]},{...previous,coordination:[{...row,action:"배포",status:"승인 대기"}]}).ok).toBe(false);
  });
});

import { assert, test } from "vitest";

import {
  emptyData,validateData,createRecord,updateRecord,transitionRecord,allowedTransitions,freshness,verificationIssues,
  productionChangeCreateSchema,productionChangeSaveSchema,productionChangeTransitionSchema,
  productionChangeListResponseSchema,productionChangeResponseSchema,requestRecordSchema,
  PRODUCTION_CHANGE_RECORD_MAX_BYTES,localDateTime,fromLocalDateTime,
  type Actor,type RequestData,type RequestRecord,type Status,
} from "@toonstudio/contracts/admin-production-change";

const actor: Actor = {userId:"user-test",displayName:"검증 사용자"};
const now = "2026-11-19T10:00:00.000Z";
const later = "2026-11-19T11:00:00.000Z";
function data(): RequestData {
  const value = emptyData();
  Object.assign(value,{title:"에셋 색상 변경",description:"톤 일치",nextAction:"범위 검토",impact:"medium",conflictState:"none",baseRevision:"rev-1"});
  value.conflict.publishingImpact="none";
  value.conflict.impactScope="대상 에셋 1개";
  return value;
}
function move(record:RequestRecord,status:Status,at=now,note="검토 결정") {return transitionRecord(record,{status,note},actor,at);}
function approved() {
  let record = createRecord(data(),actor,now);
  for (const status of ["submitted","analysis","review","approved"] as Status[]) record=move(record,status);
  return record;
}
function applied() {
  let record=approved();
  const value=structuredClone(record.data);
  Object.assign(value.application,{appliedAt:"2026-11-19T10:20:00.000Z",appliedBy:actor.displayName,resultRevision:"rev-2",evidenceUrl:"https://example.test/application"});
  record=updateRecord(record,value,actor,later);
  return move(record,"applied",later);
}
function withVerification(record:RequestRecord) {
  const value=structuredClone(record.data);
  Object.assign(value.verification,{
    beforeCaptureUrl:"https://example.test/before.png",beforeCapturedAt:"2026-11-19T10:10:00.000Z",beforeRevision:"rev-1",
    afterCaptureUrl:"https://example.test/after.png",afterCapturedAt:"2026-11-19T10:30:00.000Z",afterRevision:"rev-2",
    tests:[{id:"test-1",name:"제작 회귀",result:"pass",url:"https://example.test/test",ranAt:"2026-11-19T10:40:00.000Z",revision:"rev-2",required:true}],
    result:"pass",regression:"none",verifiedBy:actor.displayName,verifiedAt:"2026-11-19T10:50:00.000Z",targetRevision:"rev-2",summary:"대상 확인 완료",unknowns:"",unknownsReviewed:true,
  });
  return updateRecord(record,value,actor,later);
}

test("초안은 미확인으로 시작하며 승인 단계를 건너뛸 수 없다",()=>{
  const record=createRecord(emptyData(),actor,now);
  assert.strictEqual(record.status,"draft");
  assert.strictEqual(record.data.impact,"unknown");
  assert.deepEqual(allowedTransitions(record),["submitted"]);
  assert.throws(()=>move(record,"applied"),/이동할 수 없습니다/);
  assert.throws(()=>move(record,"submitted"),/제목/);
});

test("입력 계약은 추가 속성·위험한 URL·잘못된 날짜·미래 관측을 거부한다",()=>{
  assert.throws(()=>validateData({...data(),status:"approved"},now),/입력 내용/);
  const syntheticCredentialUrl=["https://","synthetic-user",":","synthetic-password","@example.test/x"].join("");
  for(const unsafe of ["javascript:alert(1)","data:text/html,x","//example.test/x",syntheticCredentialUrl,"https://example.test/\\x","/api/admin/production-changes/captures/not-a-uuid"]) {
    const value=data();value.links=[{id:"1",title:"근거",url:unsafe,observedAt:""}];
    assert.throws(()=>validateData(value,now),/링크|입력/);
  }
  const good=data();good.links=[{id:"1",title:"업로드",url:"/api/admin/production-changes/captures/12345678-1234-1234-1234-123456789012",observedAt:now}];
  assert.strictEqual(validateData(good,now).links.length,1);
  good.links[0].observedAt="2026-02-30T10:00:00.000Z";assert.throws(()=>validateData(good,now),/시각|입력/);
  good.links[0].observedAt="2026-11-19T10:00:00+99:99";assert.throws(()=>validateData(good,now),/시간대|입력/);
  good.links[0].observedAt=later;assert.throws(()=>validateData(good,now),/미래/);
  good.links[0].observedAt="";good.verification.freshnessHours=721;assert.throws(()=>validateData(good,now));
});

test("승인에는 확인된 영향도·충돌·퍼블리싱 영향과 결정 메모가 필요하다",()=>{
  let record=createRecord(data(),actor,now);
  for(const status of ["submitted","analysis","review"] as Status[])record=move(record,status);
  assert.throws(()=>move(record,"approved",now,""),/메모/);
  const value=structuredClone(record.data);value.impact="unknown";record=updateRecord(record,value,actor,now);
  assert.throws(()=>move(record,"approved"),/영향도/);
  assert.throws(()=>move(record,"rejected",now,""),/반려 사유/);
  record=move(record,"rejected",now,"영향 확인 필요");
  assert.strictEqual(record.history.at(-1)?.note,"영향 확인 필요");
  assert.strictEqual(move(record,"draft").status,"draft");
});

test("범위 변경은 승인을 무효화하고 메모는 기존 승인과 불변 이력을 유지한다",()=>{
  const original=approved();
  const snapshot=structuredClone(original);
  const notes=structuredClone(original.data);notes.notes="일반 메모";
  const saved=updateRecord(original,notes,actor,later);
  assert.strictEqual(saved.approval?.valid,true);assert.strictEqual(saved.scopeVersion,original.scopeVersion);
  const changed=structuredClone(saved.data);changed.description="다른 범위";
  const updated=updateRecord(saved,changed,actor,later);
  assert.strictEqual(updated.status,"review");assert.strictEqual(updated.approval?.valid,false);assert.strictEqual(updated.scopeVersion,original.scopeVersion+1);
  assert.throws(()=>move(updated,"applied",later),/이동/);
  assert.deepEqual(original,snapshot);
  const reapproved=move(updated,"approved",later);
  assert.strictEqual(reapproved.approval?.scopeVersion,reapproved.scopeVersion);
  assert.strictEqual(reapproved.approval?.userId,actor.userId);
});

test("예약에는 미래 시각과 현재 범위에 대한 유효한 승인이 필요하다",()=>{
  const record=approved();
  assert.throws(()=>move(record,"scheduled"),/未来|미래/);
  const value=structuredClone(record.data);value.application.scheduledAt=later;
  const saved=updateRecord(record,value,actor,now);
  assert.strictEqual(move(saved,"scheduled").status,"scheduled");
  const forged={...saved,approval:{...saved.approval!,valid:false}};
  assert.throws(()=>move(forged,"scheduled"),/유효한 승인/);
});

test("적용은 충돌 해결 Revision과 일치하는 결과와 근거를 요구한다",()=>{
  let record=approved();
  const value=structuredClone(record.data);
  value.conflictState="resolved";
  Object.assign(value.conflict,{method:"merge",resolutionNotes:"두 변경 결합",resolvedBy:"확인자",resolvedAt:now,resolutionEvidence:"https://example.test/conflict",resultRevision:"rev-resolved"});
  record=updateRecord(record,value,actor,"2026-11-19T10:10:00.000Z");
  record=move(record,"approved","2026-11-19T10:10:00.000Z");
  const appliedValue=structuredClone(record.data);
  Object.assign(appliedValue.application,{appliedAt:"2026-11-19T10:30:00.000Z",appliedBy:"적용자",resultRevision:"rev-wrong",evidenceUrl:"https://example.test/applied"});
  record=updateRecord(record,appliedValue,actor,later);
  assert.throws(()=>move(record,"applied",later),/일치/);
});

test("실제 적용은 승인 이후여야 하며 적용 스냅샷은 변경할 수 없다",()=>{
  let record=approved();const value=structuredClone(record.data);
  Object.assign(value.application,{appliedAt:"2026-11-19T09:00:00.000Z",appliedBy:"적용자",resultRevision:"rev-2",evidenceUrl:"https://example.test/applied"});
  record=updateRecord(record,value,actor,now);assert.throws(()=>move(record,"applied"),/승인 시각/);
  record=applied();const locked=structuredClone(record.data);locked.application.resultRevision="rev-3";
  assert.throws(()=>updateRecord(record,locked,actor,later),/스냅샷/);
  locked.application=structuredClone(record.data.application);locked.project="다른 프로젝트";
  assert.throws(()=>updateRecord(record,locked,actor,later),/변경 범위/);
});

test("검증 완료는 누락·미확인·실패·만료된 증빙을 거부한다",()=>{
  const record=applied();assert.throws(()=>move(record,"verified",later),/캡처/);
  const good=withVerification(record);assert.deepEqual(verificationIssues(good,later),[]);
  const unknown=structuredClone(good.data);unknown.verification.unknowns="텍스처 미확인";
  const pending=updateRecord(good,unknown,actor,later);assert.throws(()=>move(pending,"verified",later),/미확인/);
  const failing=structuredClone(good.data);failing.verification.tests[0].result="fail";
  assert.throws(()=>move(updateRecord(good,failing,actor,later),"verified",later),/필수 테스트/);
  assert.strictEqual(freshness(good,"2026-11-23T11:00:00.000Z").key,"stale");
  assert.throws(()=>move(good,"verified","2026-11-23T11:00:00.000Z"),/유효기간/);
});

test("메모는 증빙을 갱신하지 않으며 Revision 불일치는 재검증이 필요하다",()=>{
  const good=withVerification(applied());const original=freshness(good,later).latestAt;
  const value=structuredClone(good.data);value.notes="나중에 메모";
  const saved=updateRecord(good,value,actor,"2026-11-23T11:00:00.000Z");
  assert.strictEqual(freshness(saved,"2026-11-23T11:00:00.000Z").latestAt,original);
  assert.strictEqual(freshness(saved,"2026-11-23T11:00:00.000Z").key,"stale");
  const mismatch=structuredClone(good.data);mismatch.verification.targetRevision="rev-other";
  assert.strictEqual(freshness(updateRecord(good,mismatch,actor,later),later).key,"changed");
});

test("검증 무효화는 적용 상태로 돌아가고 정상 종료는 감사 이력을 보존한다",()=>{
  const good=withVerification(applied());const verified=move(good,"verified",later);
  assert.strictEqual(verified.status,"verified");
  const value=structuredClone(verified.data);value.verification.tests[0].result="unknown";
  const reopened=updateRecord(verified,value,actor,later);
  assert.strictEqual(reopened.status,"applied");assert.strictEqual(verified.status,"verified");
  const closed=move(verified,"closed",later,"사후 검증 확인 후 종료");
  assert.strictEqual(closed.status,"closed");assert.deepEqual(allowedTransitions(closed),[]);
  assert.strictEqual(closed.history.at(-1)?.version,closed.version);
});

test("제출 후 필수 내용을 지워도 승인 조건을 우회할 수 없다",()=>{
  let record=createRecord(data(),actor,now);
  for(const status of ["submitted","analysis","review"] as Status[])record=move(record,status);
  for (const field of ["title","description","nextAction"] as const) {
    const value=structuredClone(record.data);value[field]="";
    assert.throws(()=>move(updateRecord(record,value,actor,now),"approved"),/제목|변경 목적|다음 조치/);
  }
  const value=structuredClone(record.data);value.conflict.impactScope="";
  assert.throws(()=>move(updateRecord(record,value,actor,now),"approved"),/영향 범위/);
});

test("실질적인 검증 근거가 없으면 최신성은 미확인이다",()=>{
  const record=applied();const value=structuredClone(record.data);
  Object.assign(value.verification,{targetRevision:"rev-2",verifiedAt:later,afterCapturedAt:later,afterRevision:"rev-2"});
  const saved=updateRecord(record,value,actor,later);
  assert.strictEqual(freshness(saved,later).key,"unknown");
  const good=withVerification(record);const missing=structuredClone(good.data);missing.verification.tests[0].url="";
  assert.strictEqual(freshness(updateRecord(good,missing,actor,later),later).key,"unknown");
});

test("새 선택 테스트로 오래된 검증·캡처 증빙을 갱신할 수 없다",()=>{
  const good=withVerification(applied());
  const value=structuredClone(good.data);
  value.verification.tests=value.verification.tests.map(row=>({...row,ranAt:"2026-11-23T10:00:00.000Z"}));
  value.verification.tests.push({id:"optional",name:"추가 검사",result:"pass",url:"https://example.test/optional",ranAt:"2026-11-23T10:30:00.000Z",revision:"rev-2",required:false});
  const saved=updateRecord(good,value,actor,"2026-11-23T11:00:00.000Z");
  assert.strictEqual(freshness(saved,"2026-11-23T11:00:00.000Z").key,"stale");
});

test("선택 테스트의 실패·미확인 결과를 필수 테스트 통과로 숨길 수 없다",()=>{
  const good=withVerification(applied());
  for (const result of ["fail","unknown","partial"] as const) {
    const value=structuredClone(good.data);
    value.verification.tests.push({id:"optional",name:"선택 검사",result,url:"https://example.test/optional",ranAt:"2026-11-19T10:40:00.000Z",revision:"rev-2",required:false});
    assert.throws(()=>move(updateRecord(good,value,actor,later),"verified",later),/선택 테스트/);
  }
});

test("공개 저장 DTO는 서버 승인·이력·기록자 위조와 버전 누락을 거부한다",()=>{
  const mutationId=crypto.randomUUID();
  const create={data:data(),mutationId};
  assert.isTrue(productionChangeCreateSchema.safeParse(create).success);
  for(const field of ["status","approval","history","actor","createdAt"]) {
    assert.isFalse(productionChangeCreateSchema.safeParse({...create,[field]:"위조"}).success);
  }
  assert.isFalse(productionChangeCreateSchema.safeParse({...create,data:{...data(),execute:true}}).success);
  assert.isTrue(productionChangeSaveSchema.safeParse({...create,expectedVersion:1}).success);
  for(const expectedVersion of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1]) {
    assert.isFalse(productionChangeSaveSchema.safeParse({...create,expectedVersion}).success);
  }
  assert.isFalse(productionChangeSaveSchema.safeParse(create).success);
  const transition={status:"approved",note:"검토 완료",expectedVersion:1,mutationId};
  assert.isTrue(productionChangeTransitionSchema.safeParse(transition).success);
  assert.isFalse(productionChangeTransitionSchema.safeParse({...transition,approval:{by:"다른 사용자"}}).success);
  assert.isFalse(productionChangeTransitionSchema.safeParse({...transition,data:data()}).success);
});

test("현재 API의 캡처 경로만 허용하고 이전 Sites 상대 경로를 완료된 이전으로 취급하지 않는다",()=>{
  const value=data();const captureId=crypto.randomUUID();
  value.conflict.local.captureUrl=`/api/admin/production-changes/captures/${captureId}`;
  assert.strictEqual(validateData(value,now).conflict.local.captureUrl,value.conflict.local.captureUrl);
  for(const path of [`/api/captures/${captureId}`,`/api/admin/production-changes/captures/${captureId}/extra`,`/api/admin/production-changes/captures/${captureId}?other=1`]) {
    value.conflict.local.captureUrl=path;assert.throws(()=>validateData(value,now),/링크|경로/);
  }
});

test("응답은 서버 이력과 버전 일관성을 검사하며 오래된 검증 기록도 조회할 수 있다",()=>{
  const record=move(withVerification(applied()),"verified",later);
  assert.isTrue(productionChangeResponseSchema.safeParse({request:record}).success);
  assert.isTrue(productionChangeListResponseSchema.safeParse({requests:[record]}).success);
  assert.strictEqual(freshness(record,"2027-01-01T00:00:00.000Z").key,"stale");
  assert.isTrue(requestRecordSchema.safeParse(record).success);
  assert.isFalse(productionChangeListResponseSchema.safeParse({requests:[record,record]}).success);
  assert.isFalse(requestRecordSchema.safeParse({...record,version:record.version+1}).success);
  assert.isFalse(requestRecordSchema.safeParse({...record,history:[]}).success);
  assert.isFalse(requestRecordSchema.safeParse({...record,approval:{...record.approval!,scopeVersion:record.scopeVersion+1}}).success);
});

test("전체 요청 목록은 5,000건을 넘어도 누락 없이 조회할 수 있다",()=>{
  const record=createRecord(emptyData(),actor,now);
  const requests=Array.from({length:5001},(_,index)=>({
    ...record,id:`00000000-0000-4000-8000-${String(index).padStart(12,"0")}`,
  }));
  const response=productionChangeListResponseSchema.parse({requests});
  assert.strictEqual(response.requests.length,5001);
  assert.deepEqual(response.requests.map((request)=>request.id),requests.map((request)=>request.id));
});

test("UTF-8 요청과 감사 이력의 합계는 DB와 같은 2MiB 상한을 적용한다",()=>{
  const record=createRecord(emptyData(),actor,now);
  const history=Array.from({length:400},(_,index)=>({
    ...record.history[0]!,id:crypto.randomUUID(),version:index+1,note:"한".repeat(2000),
  }));
  const large={...record,version:history.length,history};
  assert.isAbove(new TextEncoder().encode(JSON.stringify(large)).byteLength,PRODUCTION_CHANGE_RECORD_MAX_BYTES);
  const parsed=requestRecordSchema.safeParse(large);
  assert.isFalse(parsed.success);
  if (!parsed.success) assert.match(parsed.error.message,/2MiB/);
});

test("한국 시각 입력과 표시 왕복에서 승인·적용의 초 단위를 보존한다",()=>{
  const exact="2026-11-19T10:00:37.000Z";
  assert.strictEqual(localDateTime(exact),"2026-11-19T19:00:37");
  assert.strictEqual(fromLocalDateTime(localDateTime(exact)),exact);
  assert.strictEqual(fromLocalDateTime("2026-11-19T19:00"),"2026-11-19T10:00:00.000Z");
});

test("PostgreSQL JSONB에 저장할 수 없는 널 문자와 고립 surrogate를 입력에서 거부한다",()=>{
  for (const invalid of ["a\u0000b", "a\ud800b", "a\udc00b", "\ud83d", "\ud83d\ud83d"]) {
    const value=data();value.title=invalid;
    assert.isFalse(productionChangeCreateSchema.safeParse({data:value,mutationId:crypto.randomUUID()}).success);
    assert.throws(()=>validateData(value,now),/문자/);
  }
  const unicode=data();unicode.notes="한글과 이모지 🎨, 결합 문자 e\u0301, 줄바꿈\n모두 보존합니다.";
  assert.strictEqual(validateData(unicode,now).notes,unicode.notes);
  const value=data();value.verification.summary="검증\u0000결과";
  assert.isFalse(productionChangeSaveSchema.safeParse({data:value,expectedVersion:1,mutationId:crypto.randomUUID()}).success);
  assert.isFalse(productionChangeTransitionSchema.safeParse({status:"approved",note:"결정\ud800",expectedVersion:1,mutationId:crypto.randomUUID()}).success);
});

test("회귀 해결 근거는 정상 URL의 한국어 문장·구두점·Markdown과 캡처 경로를 허용한다",()=>{
  const capture=`/api/admin/production-changes/captures/${crypto.randomUUID()}`;
  for (const summary of [
    "회귀 해결을 확인했습니다. https://example.test/fix/42",
    "수정 기록(https://example.test/fix/42), 재검증 완료.",
    "[해결 근거](http://example.test/fix/42?case=한글), 결과를 확인했습니다.",
    `캡처 근거: ${capture}. 회귀가 재현되지 않았습니다.`,
    "근거: `https://example.test/검증결과`. 재검증 완료.",
  ]) {
    const record=withVerification(applied());const value=structuredClone(record.data);
    value.verification.regression="resolved";value.verification.summary=summary;
    const saved=updateRecord(record,value,actor,later);
    assert.deepEqual(verificationIssues(saved,later),[]);
    assert.strictEqual(move(saved,"verified",later).status,"verified");
  }
});

test("회귀 해결에서 잘못된 호스트·자격증명 URL·가짜 캡처 주소로 증빙을 대신할 수 없다",()=>{
  const capture=`/api/admin/production-changes/captures/${crypto.randomUUID()}`;
  const syntheticCredentialUrl=["https://","synthetic-user",":","synthetic-password","@example.test/fix"].join("");
  for (const invalid of [
    "https://?", "https://", "https://[invalid-host]", "https://example.test:invalid-port/fix",
    syntheticCredentialUrl, "http://synthetic-user@example.test/fix",
    "/api/admin/production-changes/captures/not-a-uuid", `${capture}/missing`, `${capture}?not=stored`,
    `/other${capture}`, "javascript:alert(1)",
  ]) {
    const record=withVerification(applied());const value=structuredClone(record.data);
    value.verification.regression="resolved";value.verification.summary=`회귀 해결 근거 ${invalid}`;
    const saved=updateRecord(record,value,actor,later);
    assert.isTrue(verificationIssues(saved,later).some(issue=>issue.includes("해결 근거 링크")),invalid);
    assert.throws(()=>move(saved,"verified",later),/해결 근거 링크/);
  }
});

test("회귀 해결 근거 파서는 반복 구두점 입력에서도 선형 시간으로 종료한다",()=>{
  const record=withVerification(applied());
  const repeatedBangUrl=`https://example.test/fix/${"!".repeat(7_500)}a`;
  const trailingBangUrl=`https://example.test/fix/42${"!".repeat(7_500)}`;

  const startedAt=performance.now();
  for (const [summary, shouldPass] of [[repeatedBangUrl, true], [trailingBangUrl, true], [`https://${"!".repeat(7_500)}`, false]] as const) {
    const value=structuredClone(record.data);
    value.verification.regression="resolved";
    value.verification.summary=summary;
    const saved=updateRecord(record,value,actor,later);
    const hasLinkIssue=verificationIssues(saved,later).some(issue=>issue.includes("해결 근거 링크"));
    assert.strictEqual(hasLinkIssue,!shouldPass,summary.slice(0,32));
  }
  assert.isBelow(performance.now()-startedAt,500);
});

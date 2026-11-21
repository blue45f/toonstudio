import { z } from "zod";

/** 제작 변경 요청의 공유 계약. 외부 실행이나 저장소 접근은 포함하지 않는다. */
export const PRODUCTION_CHANGE_API_BASE = "/api/admin/production-changes";
export const PRODUCTION_CHANGE_RECORD_MAX_BYTES = 2 * 1024 * 1024;
export const STATUSES = ["draft","submitted","analysis","review","approved","rejected","scheduled","applied","verified","closed"] as const;
export type Status = typeof STATUSES[number];
export const STATUS_LABEL: Record<Status,string> = {draft:"초안",submitted:"제출",analysis:"영향 분석",review:"검토",approved:"승인",rejected:"반려",scheduled:"예약",applied:"적용",verified:"검증 완료",closed:"종료"};
export const IMPACT_LABEL = {unknown:"미확인",low:"낮음",medium:"보통",high:"높음",critical:"매우 높음"};
export const CONFLICT_LABEL = {unknown:"미확인",none:"충돌 없음",open:"충돌 있음",resolved:"해결 기록됨"};
export const RESULT_LABEL = {unknown:"미확인",pass:"통과",fail:"실패",partial:"일부 확인"};
export type Impact = keyof typeof IMPACT_LABEL;
export type ConflictState = keyof typeof CONFLICT_LABEL;
export type Result = keyof typeof RESULT_LABEL;
export type Link = {id:string;title:string;url:string;observedAt:string};
export type Side = {baseRevision:string;revision:string;author:string;observedAt:string;summary:string;captureUrl:string};
export type StructureRow = {id:string;path:string;local:string;remote:string;note:string};
export type TestRecord = {id:string;name:string;result:Result;url:string;ranAt:string;revision:string;required:boolean};
export type RequestData = {
  title:string; description:string; project:string; episode:string; assets:string; baseRevision:string;
  owner:string; impact:Impact; nextAction:string; notes:string; links:Link[];
  requestedActions:{code:boolean;deploy:boolean;data:boolean};
  conflictState:ConflictState;
  conflict:{local:Side;remote:Side;visualDiff:string;structuralDiff:StructureRow[];impactScope:string;
    publishingImpact:"unknown"|"none"|"republish"|"review";cause:string;
    method:"unknown"|"local"|"remote"|"manual"|"merge";resolutionNotes:string;resolvedBy:string;resolvedAt:string;resolutionEvidence:string;resultRevision:string};
  application:{scheduledAt:string;scheduleNote:string;appliedAt:string;appliedBy:string;resultRevision:string;evidenceUrl:string;notes:string};
  verification:{beforeCaptureUrl:string;beforeCapturedAt:string;beforeRevision:string;afterCaptureUrl:string;afterCapturedAt:string;afterRevision:string;
    tests:TestRecord[];result:Result;regression:"unknown"|"none"|"found"|"resolved";verifiedBy:string;verifiedAt:string;targetRevision:string;summary:string;unknowns:string;unknownsReviewed:boolean;freshnessHours:number};
};
export type Approval = {by:string;userId:string;at:string;scopeVersion:number;note:string;valid:boolean};
export type Audit = {id:string;at:string;actor:string;action:string;from:Status;to:Status;note:string;version:number};
export type RequestRecord = {id:string;code:string;status:Status;version:number;scopeVersion:number;createdAt:string;updatedAt:string;createdBy:string;data:RequestData;approval:Approval|null;history:Audit[]};
export type Actor = {userId:string;displayName:string};
export type TransitionPayload = {status:Status;note:string};
export type FreshnessKey="fresh"|"stale"|"changed"|"unknown";
export const FRESHNESS_LABEL:Record<FreshnessKey,string>={fresh:"최신",stale:"오래됨",changed:"재검증 필요",unknown:"미확인"};
export function emptySide():Side{return {baseRevision:"",revision:"",author:"",observedAt:"",summary:"",captureUrl:""};}
export function emptyData():RequestData{return {
  title:"",description:"",project:"",episode:"",assets:"",baseRevision:"",owner:"",impact:"unknown",nextAction:"",notes:"",links:[],requestedActions:{code:false,deploy:false,data:false},conflictState:"unknown",
  conflict:{local:emptySide(),remote:emptySide(),visualDiff:"",structuralDiff:[],impactScope:"",publishingImpact:"unknown",cause:"",method:"unknown",resolutionNotes:"",resolvedBy:"",resolvedAt:"",resolutionEvidence:"",resultRevision:""},
  application:{scheduledAt:"",scheduleNote:"",appliedAt:"",appliedBy:"",resultRevision:"",evidenceUrl:"",notes:""},
  verification:{beforeCaptureUrl:"",beforeCapturedAt:"",beforeRevision:"",afterCaptureUrl:"",afterCapturedAt:"",afterRevision:"",tests:[],result:"unknown",regression:"unknown",verifiedBy:"",verifiedAt:"",targetRevision:"",summary:"",unknowns:"",unknownsReviewed:false,freshnessHours:72}
};}
export function display(value:string|undefined|null){return value?.trim()||"미확인";}
export function dateLabel(value:string|undefined|null){if(!value||!Number.isFinite(Date.parse(value))) return "미확인";return new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value));}
export function localDateTime(value:string){if(!value||!Number.isFinite(Date.parse(value)))return "";return new Date(Date.parse(value)+9*3600000).toISOString().slice(0,19);}
export function fromLocalDateTime(value:string){if(!value)return "";const complete=value.length===16?value+":00":value;const time=new Date(complete+"+09:00");return Number.isFinite(time.getTime())?time.toISOString():"";}


type Now = string | number | Date;
const HOUR = 3_600_000;
const statusValues = STATUSES;
function wellFormedText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit === 0) return false;
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
const text = (max = 8000) => z.string().trim().max(max, `최대 ${max}자까지 입력할 수 있습니다.`)
  .refine(wellFormedText, "저장할 수 없는 문자가 있습니다. 복사한 내용을 확인해 주세요.");
const short = () => text(240);
const id = text(100).min(1, "항목 ID가 필요합니다.");
const capturePath = /^\/api\/admin\/production-changes\/captures\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function safeUrl(value: string) {
  if (!value) return true;
  if (capturePath.test(value)) return true;
  if (value.includes("\\") || Array.from(value).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}
const TRAILING_EVIDENCE_PUNCTUATION = new Set<string>([
  ")", "]", "}", ">", ".", ",", "!", "?", ";", ":", "…", "。", "、", "*", "`",
]);

/** 닫는 구두점을 정규식 역추적 없이 O(n) 후방 스캔으로 제거한다. */
function trimTrailingEvidencePunctuation(value: string): string {
  let end = value.length;
  while (end > 0 && TRAILING_EVIDENCE_PUNCTUATION.has(value[end - 1]!)) {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}

/** 설명 안의 근거도 URL과 같은 검증을 적용하고 문장·Markdown의 닫는 구두점만 제외한다. */
function hasResolutionEvidence(summary: string): boolean {
  for (const match of summary.matchAll(/https?:\/\/[^\s<>"']+|\/api\/admin\/production-changes\/captures\/[^\s<>"']+/giu)) {
    const index = match.index ?? 0;
    if (index > 0 && /[\p{L}\p{N}_/]/u.test(summary[index - 1]!)) continue;
    const candidate = trimTrailingEvidencePunctuation(match[0]);
    if (candidate && safeUrl(candidate)) return true;
  }
  return false;
}
const url = text(2048).refine(safeUrl, "http(s) 링크 또는 업로드한 캡처 경로만 사용할 수 있습니다.");
const date = z.union([z.literal(""), z.iso.datetime({offset:true, error:"시각은 유효한 날짜와 시간대로 입력해 주세요."}).max(40)])
  .refine(value => !value || Number.isFinite(Date.parse(value)), "실제로 존재하는 날짜와 시간대를 입력해 주세요.");
const side = z.object({baseRevision:short(),revision:short(),author:short(),observedAt:date,summary:text(),captureUrl:url}).strict();
const result = z.enum(["unknown","pass","fail","partial"]);
export const requestDataSchema = z.object({
  title:text(180),description:text(),project:short(),episode:short(),assets:text(4000),baseRevision:short(),
  owner:short(),impact:z.enum(["unknown","low","medium","high","critical"]),nextAction:text(4000),notes:text(16000),
  links:z.array(z.object({id,title:short(),url,observedAt:date}).strict()).max(100),
  requestedActions:z.object({code:z.boolean(),deploy:z.boolean(),data:z.boolean()}).strict(),
  conflictState:z.enum(["unknown","none","open","resolved"]),
  conflict:z.object({
    local:side,remote:side,visualDiff:text(),
    structuralDiff:z.array(z.object({id,path:short(),local:text(4000),remote:text(4000),note:text(4000)}).strict()).max(100),
    impactScope:text(),publishingImpact:z.enum(["unknown","none","republish","review"]),cause:text(),
    method:z.enum(["unknown","local","remote","manual","merge"]),resolutionNotes:text(),resolvedBy:short(),resolvedAt:date,
    resolutionEvidence:url,resultRevision:short(),
  }).strict(),
  application:z.object({scheduledAt:date,scheduleNote:text(4000),appliedAt:date,appliedBy:short(),resultRevision:short(),evidenceUrl:url,notes:text()}).strict(),
  verification:z.object({
    beforeCaptureUrl:url,beforeCapturedAt:date,beforeRevision:short(),afterCaptureUrl:url,afterCapturedAt:date,afterRevision:short(),
    tests:z.array(z.object({id,name:short(),result,url,ranAt:date,revision:short(),required:z.boolean()}).strict()).max(100),
    result,regression:z.enum(["unknown","none","found","resolved"]),verifiedBy:short(),verifiedAt:date,targetRevision:short(),
    summary:text(),unknowns:text(),unknownsReviewed:z.boolean(),freshnessHours:z.number().int().min(1).max(720),
  }).strict(),
}).strict();

const serverTime = z.iso.datetime({ offset: true }).max(40)
  .refine((value) => Number.isFinite(Date.parse(value)), "서버 기록 시각이 올바르지 않습니다.");
const positiveVersion = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const serverActor = short().min(1, "기록자 정보가 필요합니다.");
const approvalSchema = z.object({
  by: serverActor, userId: serverActor, at: serverTime, scopeVersion: positiveVersion,
  note: text(4000).min(1), valid: z.boolean(),
}).strict();
const auditSchema = z.object({
  id: z.uuid(), at: serverTime, actor: serverActor, action: short().min(1),
  from: z.enum(STATUSES), to: z.enum(STATUSES), note: text(4000), version: positiveVersion,
}).strict();

/** 보관된 증빙의 만료는 조회 오류가 아니라 freshness 결과로 알린다. */
export const requestRecordSchema = z.object({
  id: z.uuid(), code: short().min(1), status: z.enum(STATUSES),
  version: positiveVersion, scopeVersion: positiveVersion,
  createdAt: serverTime, updatedAt: serverTime, createdBy: serverActor,
  data: requestDataSchema, approval: approvalSchema.nullable(),
  history: z.array(auditSchema).min(1).max(10000),
}).strict().superRefine((record, context) => {
  if (new TextEncoder().encode(JSON.stringify(record)).byteLength > PRODUCTION_CHANGE_RECORD_MAX_BYTES) {
    context.addIssue({ code: "custom", message: "변경 요청과 이력은 합계 2MiB 이하여야 합니다." });
  }
  const first = record.history[0];
  const last = record.history.at(-1);
  if (!first || !last) return;
  if (record.scopeVersion > record.version || record.history.length !== record.version
    || last?.version !== record.version || last.to !== record.status
    || record.history.some((entry, index) => entry.version !== index + 1)
    || new Set(record.history.map((entry) => entry.id)).size !== record.history.length) {
    context.addIssue({ code: "custom", message: "변경 요청의 버전과 감사 이력이 일치하지 않습니다." });
  }
  if (Date.parse(record.createdAt) > Date.parse(record.updatedAt)
    || Date.parse(record.createdAt) !== Date.parse(first.at)
    || Date.parse(record.updatedAt) !== Date.parse(last?.at ?? "")
    || record.history.some((entry, index) => index > 0 && Date.parse(entry.at) < Date.parse(record.history[index - 1]!.at))) {
    context.addIssue({ code: "custom", message: "변경 요청의 서버 기록 시각을 확인해 주세요." });
  }
  if ((record.approval?.valid && record.approval.scopeVersion !== record.scopeVersion)
    || (["approved", "scheduled", "applied", "verified"].includes(record.status) && !record.approval?.valid)) {
    context.addIssue({ code: "custom", message: "현재 상태와 승인한 변경 범위가 일치하지 않습니다." });
  }
});

const submittedDataSchema = requestDataSchema.superRefine((data, context) => {
  try { validateData(data); }
  catch (error) { context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "요청 내용을 확인해 주세요." }); }
});

/** 상태·승인·감사·기록자·서버 시각은 외부 저장 DTO로 받지 않는다. */
export const productionChangeCreateSchema = z.object({ data: submittedDataSchema, mutationId: z.uuid() }).strict();
export const productionChangeSaveSchema = z.object({
  data: submittedDataSchema, expectedVersion: positiveVersion, mutationId: z.uuid(),
}).strict();
export const productionChangeTransitionSchema = z.object({
  status: z.enum(STATUSES), note: text(4000), expectedVersion: positiveVersion, mutationId: z.uuid(),
}).strict();
export const productionChangeListResponseSchema = z.object({ requests: z.array(requestRecordSchema) }).strict()
  .superRefine((response, context) => {
    if (new Set(response.requests.map((request) => request.id)).size !== response.requests.length) {
      context.addIssue({ code: "custom", message: "변경 요청 ID가 중복되었습니다." });
    }
  });
export const productionChangeResponseSchema = z.object({ request: requestRecordSchema }).strict();
export type ProductionChangeCreate = z.infer<typeof productionChangeCreateSchema>;
export type ProductionChangeSave = z.infer<typeof productionChangeSaveSchema>;
export type ProductionChangeTransition = z.infer<typeof productionChangeTransitionSchema>;
export type ProductionChangeListResponse = z.infer<typeof productionChangeListResponseSchema>;
export type ProductionChangeResponse = z.infer<typeof productionChangeResponseSchema>;

function clock(now?: Now): number {
  const value = now === undefined ? Date.now() : new Date(now).getTime();
  if (!Number.isFinite(value)) throw new Error("기준 시각이 올바르지 않습니다.");
  return value;
}
function timestamp(now?: Now) { return new Date(clock(now)).toISOString(); }
function actorName(actor: Actor) {
  if (!actor?.userId?.trim() || !actor?.displayName?.trim()) throw new Error("로그인한 기록자의 정보가 필요합니다.");
  return actor.displayName.trim();
}
function same(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
function has(value: string) { return !!value.trim(); }
function before(a: string, b: string) { return !!a && !!b && Date.parse(a) < Date.parse(b); }
function duplicateIds(rows: {id:string}[]) { return new Set(rows.map(row => row.id)).size !== rows.length; }

export function validateData(input: unknown, now?: Now): RequestData {
  const parsed = requestDataSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`입력 내용을 확인해 주세요 (${issue.path.join(".") || "요청"}): ${issue.message}`);
  }
  const data = parsed.data;
  const limit = clock(now);
  const observations: [string,string][] = [
    ["로컬 확인",data.conflict.local.observedAt],["원격 확인",data.conflict.remote.observedAt],
    ["충돌 해결",data.conflict.resolvedAt],["실제 적용",data.application.appliedAt],
    ["변경 전 캡처",data.verification.beforeCapturedAt],["변경 후 캡처",data.verification.afterCapturedAt],
    ["검증 확인",data.verification.verifiedAt],
    ...data.links.map(row => ["근거 확인",row.observedAt] as [string,string]),
    ...data.verification.tests.map(row => ["테스트 실행",row.ranAt] as [string,string]),
  ];
  for (const [label,value] of observations) {
    if (value && Date.parse(value) > limit) throw new Error(`${label} 시각은 미래일 수 없습니다.`);
  }
  if (duplicateIds(data.links) || duplicateIds(data.conflict.structuralDiff) || duplicateIds(data.verification.tests)) {
    throw new Error("같은 목록 안에서 항목 ID가 중복될 수 없습니다.");
  }
  return data;
}

function scope(data: RequestData) {
  const {notes: _notes,nextAction: _nextAction,links: _links,application: _application,verification: _verification,...rest} = data;
  return rest;
}
function append(record: RequestRecord, actor: Actor, action: string, from: Status, note: string, at: string): RequestRecord {
  const audit: Audit = {id:crypto.randomUUID(),at,actor:actorName(actor),action,from,to:record.status,note,version:record.version};
  const parsed = requestRecordSchema.safeParse({...record,updatedAt:at,history:[...record.history,audit]});
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "변경 요청 기록을 확인해 주세요.");
  return parsed.data;
}
export function createRecord(input: unknown, actor: Actor, now?: Now): RequestRecord {
  const at = timestamp(now);
  const name = actorName(actor);
  const data = validateData(input, at);
  const recordId = crypto.randomUUID();
  const record: RequestRecord = {id:recordId,code:`CR-${recordId.slice(0,8).toUpperCase()}`,status:"draft",version:1,scopeVersion:1,
    createdAt:at,updatedAt:at,createdBy:name,data,approval:null,history:[]};
  return append(record,actor,"요청 생성","draft","초안으로 생성",at);
}

export function updateRecord(record: RequestRecord, input: unknown, actor: Actor, now?: Now): RequestRecord {
  const at = timestamp(now);
  actorName(actor);
  const data = validateData(input,at);
  const scopeChanged = !same(scope(record.data),scope(data));
  if (scopeChanged && ["applied","verified","closed"].includes(record.status)) {
    throw new Error("적용 또는 종료된 요청의 변경 범위는 수정할 수 없습니다. 후속 요청을 만들어 주세요.");
  }
  if (["applied","verified","closed"].includes(record.status) && !same(record.data.application,data.application)) {
    throw new Error("이미 적용된 결과 스냅샷은 수정할 수 없습니다. 추가 내용은 메모에 남겨 주세요.");
  }
  if (same(record.data,data)) return structuredClone(record);
  const updated: RequestRecord = {...structuredClone(record),data,version:record.version+1,scopeVersion:record.scopeVersion+(scopeChanged?1:0)};
  let action = "요청 수정";
  let note = "입력 내용 저장";
  if (scopeChanged && updated.approval) {
    updated.approval = {...updated.approval,valid:false};
    if (record.status === "approved" || record.status === "scheduled") updated.status = "review";
    action = "승인 범위 변경";
    note = "변경 범위가 수정되어 이전 승인을 무효화했습니다. 재검토가 필요합니다.";
  }
  if (record.status === "verified" && verificationIssues(updated,at).length) {
    updated.status = "applied";
    action = "재검증 필요";
    note = "검증 근거 또는 확인 상태가 변경되어 적용 상태로 되돌렸습니다.";
  }
  if (record.status === "closed" && !same(record.data.verification,data.verification) && verificationIssues(updated,at).length) {
    throw new Error("종료된 요청의 검증 근거를 무효화할 수 없습니다. 후속 요청에 재검증 내용을 남겨 주세요.");
  }
  return append(updated,actor,action,record.status,note,at);
}

const nextStates: Record<Status,Status[]> = {
  draft:["submitted"],submitted:["analysis","draft"],analysis:["review","draft"],review:["approved","rejected","analysis"],
  approved:["scheduled","applied","review"],rejected:["draft","closed"],scheduled:["applied","review"],
  applied:["verified"],verified:["closed","applied"],closed:[],
};
export function allowedTransitions(record: RequestRecord): Status[] { return [...(nextStates[record.status] || [])]; }

function requireApproval(record: RequestRecord) {
  if (!record.approval?.valid || record.approval.scopeVersion !== record.scopeVersion) {
    throw new Error("현재 변경 범위에 대한 유효한 승인이 필요합니다.");
  }
}
function applicationIssues(record: RequestRecord): string[] {
  const {application:a,conflict:c,conflictState} = record.data;
  const issues: string[] = [];
  if (conflictState === "unknown" || conflictState === "open") issues.push("충돌 여부를 확인하고 충돌을 해결한 기록이 필요합니다.");
  if (conflictState === "resolved") {
    if (!c.resultRevision || !c.resolutionNotes || !c.resolutionEvidence || !c.resolvedBy || !c.resolvedAt || c.method === "unknown") {
      issues.push("충돌 해결 방법·설명·근거·담당자·시각·결과 Revision을 모두 기록해 주세요.");
    }
    if (c.resultRevision !== a.resultRevision) issues.push("충돌 해결 Revision과 실제 적용 Revision이 일치해야 합니다.");
  }
  if (!a.appliedAt || !a.appliedBy || !a.resultRevision || !a.evidenceUrl) issues.push("실제 적용 시각·적용자·결과 Revision·근거 링크가 필요합니다.");
  if (record.approval && before(a.appliedAt,record.approval.at)) issues.push("실제 적용 시각은 승인 시각보다 빠를 수 없습니다.");
  if (c.resolvedAt && before(a.appliedAt,c.resolvedAt)) issues.push("실제 적용 시각은 충돌 해결 시각보다 빠를 수 없습니다.");
  return issues;
}

export function transitionRecord(record: RequestRecord, payload: TransitionPayload, actor: Actor, now?: Now): RequestRecord {
  const parsed = z.object({status:z.enum(statusValues),note:text(4000)}).strict().safeParse(payload);
  if (!parsed.success) throw new Error("변경할 상태와 결정 메모를 확인해 주세요.");
  const {status,note} = parsed.data;
  const at = timestamp(now);
  const name = actorName(actor);
  validateData(record.data,at);
  if (!allowedTransitions(record).includes(status)) throw new Error("현재 상태에서 선택한 상태로 이동할 수 없습니다.");
  const {data} = record;
  if (status === "submitted" && (!data.title || !data.description || !data.nextAction)) {
    throw new Error("제출하려면 제목·변경 목적·다음 조치를 입력해 주세요.");
  }
  if (status === "approved") {
    if (!data.title || !data.description || !data.nextAction || !data.conflict.impactScope) {
      throw new Error("승인하려면 제목·변경 목적·다음 조치·영향 범위를 입력해 주세요.");
    }
    if (data.impact === "unknown" || data.conflictState === "unknown" || data.conflict.publishingImpact === "unknown") {
      throw new Error("영향도·충돌 여부·퍼블리싱 영향을 확인한 뒤 승인해 주세요.");
    }
    if (!note) throw new Error("승인 결정 메모를 입력해 주세요.");
  }
  if (status === "rejected" && !note) throw new Error("반려 사유를 입력해 주세요.");
  if (status === "scheduled") {
    requireApproval(record);
    if (!data.application.scheduledAt || Date.parse(data.application.scheduledAt) <= clock(at)) throw new Error("예약 시각은 현재보다 미래로 지정해 주세요.");
  }
  if (status === "applied" && record.status !== "verified") {
    requireApproval(record);
    const issues = applicationIssues(record);
    if (issues.length) throw new Error(issues.join(" "));
  }
  if (status === "verified" || (status === "closed" && record.status === "verified")) {
    requireApproval(record);
    const issues = verificationIssues(record,at);
    if (issues.length) throw new Error(issues.join(" "));
  }
  if (status === "closed" && !note) throw new Error("종료 이유를 입력해 주세요.");
  const updated: RequestRecord = {...structuredClone(record),status,version:record.version+1};
  if (status === "approved") updated.approval = {by:name,userId:actor.userId,at,scopeVersion:record.scopeVersion,note,valid:true};
  if ((status === "review" || status === "rejected" || status === "draft" || status === "analysis") && updated.approval) {
    updated.approval = {...updated.approval,valid:false};
  }
  return append(updated,actor,"상태 변경",record.status,note || "상태 변경 기록",at);
}

export function freshness(record: RequestRecord, now?: Now): {key:FreshnessKey;latestAt:string;reason:string} {
  const {verification:v,application:a} = record.data;
  const observations = [v.verifiedAt,v.afterCapturedAt,...v.tests.map(test => test.ranAt)].filter(value => value && Number.isFinite(Date.parse(value)));
  const latestAt = observations.length ? new Date(Math.max(...observations.map(Date.parse))).toISOString() : "";
  if (!a.resultRevision || !v.targetRevision || !latestAt) return {key:"unknown",latestAt,reason:"검증 대상 Revision 또는 확인 시각이 미확인입니다."};
  const currentTime = clock(now);
  if (observations.some(value => Date.parse(value) > currentTime)) return {key:"unknown",latestAt,reason:"미래의 증빙 시각은 확인 기록으로 사용할 수 없습니다."};
  if (v.targetRevision !== a.resultRevision || (v.afterRevision && v.afterRevision !== a.resultRevision) || v.tests.some(test => test.revision && test.revision !== a.resultRevision)) {
    return {key:"changed",latestAt,reason:"검증 증빙의 Revision이 실제 적용 Revision과 다릅니다."};
  }
  const required = v.tests.filter(test => test.required);
  if (!v.verifiedAt || !v.verifiedBy || !v.afterCaptureUrl || !v.afterCapturedAt || !v.afterRevision || v.result === "unknown" || !required.length || required.some(test => !test.name || !test.url || !test.ranAt || !test.revision || test.result === "unknown")) {
    return {key:"unknown",latestAt,reason:"검증자·확인 시각·변경 후 캡처 또는 필수 테스트 근거가 미확인입니다."};
  }
  const limit = currentTime-v.freshnessHours*HOUR;
  const requiredDates = [v.verifiedAt,v.afterCapturedAt,...required.map(test => test.ranAt)];
  if (Date.parse(latestAt) < limit || requiredDates.some(value => Date.parse(value) < limit)) {
    return {key:"stale",latestAt,reason:`최신 증빙 또는 필수 테스트가 ${v.freshnessHours}시간의 유효기간을 지났습니다.`};
  }
  return {key:"fresh",latestAt,reason:`적용 Revision 기준 ${v.freshnessHours}시간 이내의 확인 기록입니다.`};
}

export function verificationIssues(record: RequestRecord, now?: Now): string[] {
  try { validateData(record.data,now); } catch (error) { return [error instanceof Error ? error.message : "검증 입력 내용을 확인해 주세요."]; }
  const {verification:v,application:a,baseRevision} = record.data;
  const issues = applicationIssues(record);
  if (!v.beforeCaptureUrl || !v.beforeCapturedAt || !v.beforeRevision) issues.push("변경 전 캡처·촬영 시각·Revision이 필요합니다.");
  if (!v.afterCaptureUrl || !v.afterCapturedAt || !v.afterRevision) issues.push("변경 후 캡처·촬영 시각·Revision이 필요합니다.");
  if (baseRevision && v.beforeRevision && v.beforeRevision !== baseRevision) issues.push("변경 전 캡처 Revision은 요청의 기준 Revision과 일치해야 합니다.");
  if (a.appliedAt && v.beforeCapturedAt && before(a.appliedAt,v.beforeCapturedAt)) issues.push("변경 전 캡처 시각은 실제 적용 시각보다 늦을 수 없습니다.");
  if (before(v.afterCapturedAt,a.appliedAt)) issues.push("변경 후 캡처는 적용 이후에 확인해야 합니다.");
  if (!v.targetRevision || v.targetRevision !== a.resultRevision || v.afterRevision !== a.resultRevision) issues.push("검증 대상·변경 후 캡처·실제 적용 Revision이 일치해야 합니다.");
  const required = v.tests.filter(test => test.required);
  if (!required.length) issues.push("최소 1개의 필수 테스트가 필요합니다.");
  for (const test of required) {
    if (!test.name || test.result !== "pass" || !test.url || !test.ranAt || test.revision !== a.resultRevision) {
      issues.push(`필수 테스트 ‘${test.name || "이름 미확인"}’의 이름·통과 결과·근거·실행 시각·대상 Revision을 확인해 주세요.`);
    }
    if (before(test.ranAt,a.appliedAt)) issues.push(`필수 테스트 ‘${test.name || "이름 미확인"}’는 적용 이후에 실행해야 합니다.`);
  }
  for (const test of v.tests.filter(test => !test.required)) {
    if (test.result === "fail") issues.push(`선택 테스트 ‘${test.name || "이름 미확인"}’가 실패했습니다. 해결을 확인한 뒤 검증을 완료해 주세요.`);
    if (test.result === "unknown" || test.result === "partial") issues.push(`선택 테스트 ‘${test.name || "이름 미확인"}’의 미확인 결과가 남아 있습니다.`);
  }
  if (v.result !== "pass") issues.push("검증 결과가 통과여야 합니다.");
  if (v.regression !== "none" && v.regression !== "resolved") issues.push("회귀가 없거나 해결되었음을 확인해 주세요.");
  if (v.regression === "resolved" && !hasResolutionEvidence(v.summary)) {
    issues.push("회귀를 해결한 경우 검증 요약에 해결 근거 링크를 남겨 주세요.");
  }
  if (!v.verifiedBy || !v.verifiedAt || !v.summary) issues.push("검증자·확인 시각·검증 요약이 필요합니다.");
  if (before(v.verifiedAt,a.appliedAt)) issues.push("검증 확인 시각은 실제 적용 이후여야 합니다.");
  const evidenceTimes = [v.afterCapturedAt,...required.map(test => test.ranAt)];
  if (evidenceTimes.some(time => before(v.verifiedAt,time))) issues.push("검증 확인 시각은 변경 후 캡처와 필수 테스트 이후여야 합니다.");
  if (!v.unknownsReviewed || has(v.unknowns)) issues.push("남은 미확인 항목을 모두 확인하고 미확인 검토 완료를 체크해 주세요.");
  const current = freshness(record,now);
  if (current.key !== "fresh") issues.push(current.reason);
  return [...new Set(issues)];
}

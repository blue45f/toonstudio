export function receiptToolVersion(version) {
  return version?.split("\n")[0]?.trim().slice(0, 160) || "version-unavailable";
}

export function publicJob(record) {
  const job = JSON.parse(JSON.stringify(record.job));
  // 이전 완료 작업의 원본 영수증은 보존하고 공개 응답의 버전 표기만 맞춘다.
  if (typeof job.receipt?.toolVersion === "string") {
    job.receipt.toolVersion = receiptToolVersion(job.receipt.toolVersion);
  }
  return job;
}

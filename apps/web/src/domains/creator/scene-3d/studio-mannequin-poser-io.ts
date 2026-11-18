export function getErrorText(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  return fallback;
}

export function createWebcamPreflightError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

export function downloadTextBlob(content: string, filename: string, mimeType = "application/xml"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

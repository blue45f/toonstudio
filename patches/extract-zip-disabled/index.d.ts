declare function extract(zipPath: string, opts: { dir: string; defaultDirMode?: number; defaultFileMode?: number; onEntry?: (entry: unknown, zipfile: unknown) => void }): Promise<void>;
declare namespace extract {
  const disabledReason: string;
}
export = extract;

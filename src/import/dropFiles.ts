export interface PathedFile { file: File; path: string }

/** Minimal typings for the (widely supported, non-standard) FileSystem entry API. */
interface FsEntry { isFile: boolean; isDirectory: boolean; name: string; fullPath: string }
interface FsFileEntry extends FsEntry { file(cb: (f: File) => void, err?: (e: unknown) => void): void }
interface FsDirEntry extends FsEntry { createReader(): { readEntries(cb: (e: FsEntry[]) => void, err?: (e: unknown) => void): void } }

async function walk(entry: FsEntry, out: PathedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FsFileEntry).file(res, rej));
    out.push({ file, path: entry.fullPath.replace(/^\//, '') });
  } else if (entry.isDirectory) {
    const reader = (entry as FsDirEntry).createReader();
    // readEntries returns at most ~100 entries per call – loop until empty
    for (;;) {
      const batch = await new Promise<FsEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const child of batch) await walk(child, out);
    }
  }
}

/** Files and folders (recursively) from a drop event. */
export async function collectDropped(dt: DataTransfer): Promise<{ files: PathedFile[]; hadFolder: boolean }> {
  const out: PathedFile[] = [];
  let hadFolder = false;
  const entries = Array.from(dt.items ?? [])
    .map((i) => (i.kind === 'file' ? ((i as unknown as { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.() ?? null) : null));
  if (entries.some(Boolean)) {
    for (const e of entries) {
      if (!e) continue;
      if (e.isDirectory) hadFolder = true;
      await walk(e, out);
    }
  } else {
    for (const f of Array.from(dt.files)) out.push({ file: f, path: f.name });
  }
  return { files: out, hadFolder };
}

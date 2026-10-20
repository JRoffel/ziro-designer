// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * Generated output (plots, drill files, reports, netlists, exports) goes to the user's computer as
 * a download - KiCad writes it to a folder on disk, and the browser's downloads folder is that
 * folder here. It is not filed into the project.
 *
 * A run that writes several files (a Gerber per layer, drill + map + report) would otherwise be a
 * burst of downloads and the browser's "allow multiple downloads?" prompt, so the files of one run
 * are gathered and leave as one zip, keeping their folders; a run of one file downloads as itself.
 * Not KiCad's: a browser has no directory to write into.
 */
import { zipSync } from 'fflate';

export interface OUTPUT_FILE {
  /** The path the editor gave, relative, perhaps with a folder ("gerbers/board-F_Cu.gbr"). */
  path: string;
  bytes: Uint8Array;
  mime: string;
}

export interface OUTPUT_DOWNLOAD {
  name: string;
  bytes: Uint8Array;
  mime: string;
}

const clean = (aPath: string): string => aPath.replace(/\\/g, '/').replace(/^\/+/, '');

/**
 * What one run downloads: a lone file as itself (its base name), several as `<aZipBase>.zip` with
 * their paths kept - a later file at the same path replaces an earlier one, as on disk.
 */
export function bundleOutputs(
  aFiles: readonly OUTPUT_FILE[],
  aZipBase: string,
): OUTPUT_DOWNLOAD | null {
  const byPath = new Map<string, OUTPUT_FILE>();

  for (const f of aFiles) byPath.set(clean(f.path), f);

  if (byPath.size === 0) return null;

  if (byPath.size === 1) {
    const [path, f] = [...byPath][0]!;
    return {
      name: path.split('/').pop() || 'output',
      bytes: f.bytes,
      mime: f.mime || 'application/octet-stream',
    };
  }

  const entries: Record<string, Uint8Array> = {};

  for (const [path, f] of byPath) entries[path] = f.bytes;

  return { name: `${aZipBase || 'outputs'}.zip`, bytes: zipSync(entries), mime: 'application/zip' };
}

/** Hand \a aDownload to the browser's download flow. */
export function startDownload(aDownload: OUTPUT_DOWNLOAD): void {
  const blob = new Blob([aDownload.bytes.slice().buffer], { type: aDownload.mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = aDownload.name;
  a.click();
  // Revoked after the click has been handled, or a large file can be cut off.
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

/**
 * Gathers the files of one run - writes that arrive within \a aQuietMs of each other - and
 * downloads them with bundleOutputs once the run goes quiet.
 */
export class OUTPUT_DOWNLOADER {
  private m_pending: OUTPUT_FILE[] = [];
  private m_timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly m_zipBase: () => string,
    private readonly m_quietMs = 600,
    private readonly m_download: (aDownload: OUTPUT_DOWNLOAD) => void = startDownload,
  ) {}

  Add(aPath: string, aBytes: Uint8Array, aMime: string): void {
    this.m_pending.push({ path: aPath, bytes: aBytes, mime: aMime });

    if (this.m_timer) clearTimeout(this.m_timer);

    this.m_timer = setTimeout(() => this.Flush(), this.m_quietMs);
  }

  /** Download what is gathered now. */
  Flush(): void {
    if (this.m_timer) clearTimeout(this.m_timer);

    this.m_timer = null;

    const files = this.m_pending;
    this.m_pending = [];

    // The zip is named after the run's own folder when every file shares one ("gerbers"), else
    // after the project.
    const folders = new Set(files.map((f) => clean(f.path).split('/').slice(0, -1).join('/')));
    const [only] = [...folders];
    const base =
      folders.size === 1 && only
        ? `${this.m_zipBase()}-${only.replace(/\//g, '-')}`
        : this.m_zipBase();
    const download = bundleOutputs(files, base);

    if (download) this.m_download(download);
  }
}

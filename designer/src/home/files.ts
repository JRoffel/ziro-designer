// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/** Shared file value passed between the launcher, editors, and stores. */

/** A file picked from disk for a project open. `bytes` is the byte-exact source
 * of truth (persist/archive, like KiCad's byte-stream archiver); `text` is a
 * decoded view the editors parse, valid for text files, unused for binaries. */
export interface PickedHomeFile {
  name: string;
  text: string;
  bytes?: Uint8Array;
}

/**
 * Whether bytes are a binary file's, by git's own test (`buffer_is_binary`): a NUL among the first
 * 8000 bytes. No text file a project holds has one; archives, images, compressed objects and
 * KiCad's `.history` objects all do.
 */
export function isBinaryBytes(aBytes: Uint8Array): boolean {
  const n = Math.min(aBytes.length, 8000);

  for (let i = 0; i < n; i++) if (aBytes[i] === 0) return true;

  return false;
}

const projectDecoder = new TextDecoder();

/**
 * A project file's `text`: the decoded bytes, or '' for a binary file, whose text nothing reads.
 *
 * Decoding a binary is not merely useless, it is the most expensive thing in the app: each invalid
 * byte becomes U+FFFD, so a string twice the file's size lands in the V8 heap beside the bytes. A
 * project carrying its KiCad backups (69 MB of zips) and `.history` (117 MB) peaked a renderer at
 * 2.5 GB and crashed the tab (SIGILL, V8's out-of-memory trap) in every editor.
 */
export function projectFileText(aBytes: Uint8Array): string {
  return isBinaryBytes(aBytes) ? '' : projectDecoder.decode(aBytes);
}

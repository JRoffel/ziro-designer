// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `KIWAY::KiFACE( FACE_CVPCB )`'s answer, held apart from the footprint store that builds it so
 * the program's KIWAY (App.tsx, the entry chunk) can ask without pulling the PCB stack in.
 * footprint_lib_adapter_app.ts sets it once the store's index has loaded.
 */
import type { IFACE as CVPCB_IFACE } from '@ziroeda/cvpcb/cvpcb.js';

let s_cvpcb: CVPCB_IFACE | null = null;

/**
 * The cvpcb kiface over the program's footprint store, once its index has loaded
 * (`BlockUntilLoaded` is the caller's `await hostedFootprintLibs()`); null before then, as a
 * kiface that failed to load is.
 */
export function cvpcbKiface(): CVPCB_IFACE | null {
  return s_cvpcb;
}

export function setCvpcbKiface(aIface: CVPCB_IFACE): void {
  s_cvpcb ??= aIface;
}

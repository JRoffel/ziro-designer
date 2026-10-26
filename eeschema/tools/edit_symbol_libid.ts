// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Library id string helpers - the halves of an id, and the legality rules of `LIB_ID`
 * (common/lib_id.cpp) - for the record-model callers that still pass ids as strings (the
 * rescuer, CvPcb's association tool). The dialog that gave this file its name is
 * DIALOG_EDIT_SYMBOLS_LIBID in eeschema/dialogs/, on the live model.
 */

/**
 * The characters `LIB_ID::isLegalChar` (common/lib_id.cpp) answers false for:
 * `:`, tab, newline and carriage return outright, and `\`, `<`, `>`, `"`
 * because `illegal_filename_chars_allowed` is a `bool const … = false` beside
 * the `space_allowed = true` that lets a space through.
 *
 * One table, read by both {@link isValidLibId} and {@link libIdParseOffset}.
 * LIB_ID itself is `common/`, and both of these belong in `common` the day
 * it is ported; until then the point of the rule is served by there being a
 * single copy of the set rather than one per caller.
 */
const FORBIDDEN = '<>"\\:\t\n\r';

/** The item-name half of a library id ("Device:R" -> "R"). */
export function libItemName(libId: string): string {
  const i = libId.indexOf(':');
  return i === -1 ? libId : libId.slice(i + 1);
}

/** The nickname half ("Device:R" -> "Device"); '' when there is no nickname. */
export function libNickname(libId: string): string {
  const i = libId.indexOf(':');
  return i === -1 ? '' : libId.slice(0, i);
}

/**
 * `LIB_ID::HasIllegalChars`: **the offset of the first character a LIB_ID part
 * may not contain, or -1 when there is none.**
 *
 * The sign convention is upstream's and the rescuer reads it as a flag rather
 * than a position — `if( LIB_ID::HasIllegalChars( … ) == -1 )` guards the two
 * skips that would otherwise drop a symbol whose only fault is its name.
 */
export function libItemNameIllegalCharOffset(name: string): number {
  for (let i = 0; i < name.length; i++) if (FORBIDDEN.includes(name[i]!)) return i;
  return -1;
}

/**
 * `LIB_ID::Parse` followed by `IsValid`: a nickname and an item name, split by
 * the one colon they are allowed between them, and no forbidden characters in
 * either. This is why a colon is forbidden *inside* the parts — it is the
 * separator, so a second one is not a character, it is a parse error.
 */
export function isValidLibId(id: string): boolean {
  const at = id.indexOf(':');
  if (at <= 0 || at === id.length - 1) return false;
  const nickname = id.slice(0, at);
  const name = id.slice(at + 1);
  const clean = (s: string): boolean => ![...s].some((c) => FORBIDDEN.includes(c));
  return clean(nickname) && clean(name);
}

/**
 * `LIB_ID::Parse( aId, aFix = false )` on its own, without the `IsValid` that
 * {@link isValidLibId} folds in: **the offset of the first character that stops
 * the id being parseable, or -1 when it parses.**
 *
 * The odd return value is upstream's, and every call site tests its sign —
 * `if( fpid.Parse( data.GetText() ) >= 0 ) return 0;` in
 * `CVPCB_ASSOCIATION_TOOL::PasteAssoc`. Keeping the shape rather than returning
 * a boolean is what makes that line transcribable instead of re-derived.
 *
 * Two things it deliberately accepts that `isValidLibId` rejects, because
 * `Parse` and `IsValid` are separate questions upstream and the paste path asks
 * only the first:
 *
 *  - **no colon at all.** `Parse` leaves `partNdx` at 0 and the whole string is
 *    the item name, which is `IsLegacy()`, not invalid.
 *  - **the empty string**, for the same reason: `HasIllegalChars( "" )` returns
 *    -1, `SetLibItemName( "" )` cannot fail, so `Parse( "" )` succeeds and
 *    leaves an empty LIB_ID behind.
 *
 * Only the item name is checked, which is also upstream: the nickname goes
 * through `checkLibNickname`, and that is `aField.find_first_of( ":" )` alone —
 * a test the substring before the *first* colon can never fail.
 *
 * The offset counts UTF-16 code units where upstream counts UTF-8 bytes; the
 * two agree on -1, which is all any caller reads.
 */
export function libIdParseOffset(id: string): number {
  const at = id.indexOf(':');
  const name = at === -1 ? id : id.slice(at + 1);
  const chars = [...name];
  for (let i = 0; i < chars.length; i++) {
    if (FORBIDDEN.includes(chars[i]!)) return i;
  }
  return -1;
}

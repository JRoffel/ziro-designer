// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `LIB_FIELDS_EDITOR_GRID_DATA_MODEL` (eeschema/lib_fields_data_model.{h,cpp}): the grid table of
 * the symbol editor's Symbol Fields Table - one row per LIB_SYMBOL of a library (or a group of
 * them), one column per field, the edits held in a data store keyed by symbol UUID until
 * ApplyData writes them back, and derived-symbol creation.
 *
 * Not here: the bold font of a modified cell (wxGridCellAttr carries no font here, as in
 * FIELDS_GRID_TABLE); the trace logging.
 */
import { IsGeneratedField } from '@ziroeda/common/common.js';
import { newKiid } from '@ziroeda/common/kiid.js';
import { strNumCmp, wildCompareString } from '@ziroeda/common/string_utils.js';
import { FIELD_T, FieldNamesAreDuplicates } from '@ziroeda/common/template_fieldnames.js';
import { STRIPED_STRING_RENDERER } from '@ziroeda/common/widgets/grid_striped_renderer.js';
import { INDETERMINATE_STATE } from '@ziroeda/common/widgets/ui_common.js';
import { GROUP_TYPE, type WX_GRID, WX_GRID_TABLE_BASE } from '@ziroeda/common/widgets/wx_grid.js';
import { GetTextExtent } from '@ziroeda/wx/controls.js';
import {
  type wxAttrKind,
  wxGRID_VALUE_BOOL,
  wxGridCellAttr,
  type wxGridCellRenderer,
  wxGridTableRequest,
} from '@ziroeda/wx/grid.js';
import { LIB_SYMBOL } from './lib_symbol.js';
import { SCH_FIELD } from './sch_field.js';

/** `LIB_DATA_MODEL_ROW`. */
export class LIB_DATA_MODEL_ROW {
  m_ItemNumber = 0;
  m_Flag: GROUP_TYPE;
  m_Refs: LIB_SYMBOL[];

  constructor(aFirstReference: LIB_SYMBOL, aType: GROUP_TYPE) {
    this.m_Flag = aType;
    this.m_Refs = [aFirstReference];
  }
}

/** `LIB_DATA_MODEL_COL`. */
export interface LIB_DATA_MODEL_COL {
  m_fieldName: string;
  m_label: string;
  m_userAdded: boolean;
  m_show: boolean;
  m_group: boolean;
  m_isCheckbox: boolean;
}

/** `LIB_DATA_ELEMENT`. */
export class LIB_DATA_ELEMENT {
  m_originalData = '';
  m_currentData = '';
  m_originallyEmpty = false;
  m_currentlyEmpty = false;
  m_isModified = false;
  m_isStriped = false;
  m_createDerivedSymbol = false;
  m_derivedSymbolName = '';
}

/** GetAttr's fills (lib_fields_data_model.cpp). [data] */
const BLANK_MODIFIED = '#c0ffc0'; // [data] wxColour( 192, 255, 192 )
const STRIPED_ADDED_EMPTY = '#b4dcb4'; // [data] wxColour( 180, 220, 180 )
const STRIPED_REMOVED = '#dcb4b4'; // [data] wxColour( 220, 180, 180 )
const STRIPED_CLEARED = '#b4c8b4'; // [data] wxColour( 180, 200, 180 )
const STRIPED_CHANGED = '#c8b4b4'; // [data] wxColour( 200, 180, 180 )

/** std::sort with \a aLess as the less-than. */
function sortBy<T>(aRows: T[], aLess: (a: T, b: T) => boolean): void {
  aRows.sort((a, b) => (aLess(a, b) ? -1 : aLess(b, a) ? 1 : 0));
}

export class LIB_FIELDS_EDITOR_GRID_DATA_MODEL extends WX_GRID_TABLE_BASE {
  static readonly ITEM_NUMBER_VARIABLE = '${ITEM_NUMBER}';
  static readonly SYMBOL_NAME = 'Symbol Name';

  protected m_symbolsList: LIB_SYMBOL[] = [];
  protected m_edited = false;
  protected m_sortColumn = 0;
  protected m_sortAscending = false;
  protected m_filter = '';
  protected m_groupingEnabled = false;

  protected m_cols: LIB_DATA_MODEL_COL[] = [];
  protected m_rows: LIB_DATA_MODEL_ROW[] = [];

  /** The data model is fundamentally symbols X fieldNames: symbol UUID -> field -> element. */
  protected m_dataStore = new Map<string, Map<string, LIB_DATA_ELEMENT>>();

  /** Newly created derived symbols, with their library, for the library manager. */
  protected m_createdDerivedSymbols: [LIB_SYMBOL, string][] = [];

  private readonly m_stripedRenderers = new Map<string, wxGridCellRenderer>();

  /** `m_dataStore[aId]`: std::map's operator[], which inserts an empty map. */
  private fieldStore(aId: string): Map<string, LIB_DATA_ELEMENT> {
    let fieldStore = this.m_dataStore.get(aId);

    if (!fieldStore) {
      fieldStore = new Map();
      this.m_dataStore.set(aId, fieldStore);
    }

    return fieldStore;
  }

  /** `m_dataStore[aId][aField]`: inserting a default element as operator[] does. */
  private element(aId: string, aField: string): LIB_DATA_ELEMENT {
    const fieldStore = this.fieldStore(aId);
    let element = fieldStore.get(aField);

    if (!element) {
      element = new LIB_DATA_ELEMENT();
      fieldStore.set(aField, element);
    }

    return element;
  }

  AddColumn(aFieldName: string, aLabel: string, aAddedByUser: boolean, aIsCheckbox: boolean): void {
    // Don't add a field twice
    if (this.GetFieldNameCol(aFieldName) !== -1) return;

    this.m_cols.push({
      m_fieldName: aFieldName,
      m_label: aLabel,
      m_userAdded: aAddedByUser,
      m_show: false,
      m_group: false,
      m_isCheckbox: aIsCheckbox,
    });

    for (const symbol of this.m_symbolsList) this.updateDataStoreSymbolField(symbol, aFieldName);
  }

  private updateDataStoreSymbolField(aSymbol: LIB_SYMBOL, aFieldName: string): void {
    const col = this.GetFieldNameCol(aFieldName);
    const dataElement = this.element(aSymbol.m_Uuid, aFieldName);
    const field = aSymbol.GetField(aFieldName);

    const set = (aData: string, aEmpty: boolean): void => {
      dataElement.m_originalData = aData;
      dataElement.m_currentData = aData;
      dataElement.m_originallyEmpty = aEmpty;
      dataElement.m_currentlyEmpty = aEmpty;
      dataElement.m_isModified = false;
    };

    if (col !== -1 && this.ColIsCheck(col)) set(this.getAttributeValue(aSymbol, aFieldName), false);
    else if (field) set(field.GetText(), false);
    else if (aFieldName === 'Keywords') set(aSymbol.GetKeyWords(), false);
    else if (this.ColIsSymbolName(col)) set(aSymbol.GetName(), false);
    else set('', true);
  }

  RemoveColumn(aCol: number): void {
    const fieldName = this.m_cols[aCol]!.m_fieldName;

    for (const symbol of this.m_symbolsList) {
      const fieldStore = this.fieldStore(symbol.m_Uuid);
      const it = fieldStore.get(fieldName);

      if (it) {
        it.m_currentData = '';
        it.m_currentlyEmpty = true;
        it.m_isModified = true;
        fieldStore.delete(fieldName);
      }
    }

    this.m_cols.splice(aCol, 1);

    if (this.m_sortColumn === aCol) this.m_sortColumn = 0;
    else if (this.m_sortColumn > aCol) this.m_sortColumn--;

    this.m_colAttrs.delete(aCol);

    const newColAttrs = new Map<number, wxGridCellAttr | null>();

    for (const [col, attr] of this.m_colAttrs) newColAttrs.set(col > aCol ? col - 1 : col, attr);

    this.m_colAttrs = newColAttrs;

    this.GetView()?.ProcessTableMessage(
      wxGridTableRequest.wxGRIDTABLE_NOTIFY_COLS_DELETED,
      aCol,
      1,
    );

    this.m_edited = true;
  }

  RenameColumn(aCol: number, newName: string): void {
    const oldName = this.m_cols[aCol]!.m_fieldName;

    for (const symbol of this.m_symbolsList) {
      // Careful; field may have already been renamed from another sheet instance
      const fieldStore = this.fieldStore(symbol.m_Uuid);
      const node = fieldStore.get(oldName);

      if (node) {
        fieldStore.delete(oldName);
        node.m_isModified = true;

        // std::map::insert keeps an element already under the key
        if (!fieldStore.has(newName)) fieldStore.set(newName, node);
      }
    }

    this.m_cols[aCol]!.m_fieldName = newName;
    this.m_cols[aCol]!.m_label = newName;
    this.m_edited = true;
  }

  /** `MoveColumn( aCol, aNewPos )`: std::rotate either way is the column taken out and put back. */
  MoveColumn(aCol: number, aNewPos: number): void {
    if (aCol < 0 || aCol >= this.m_cols.length) return; // wxCHECK_RET

    if (aCol === aNewPos) return;

    const [col] = this.m_cols.splice(aCol, 1);
    this.m_cols.splice(aNewPos, 0, col!);
  }

  override GetNumberRows(): number {
    return this.m_rows.length;
  }

  override GetNumberCols(): number {
    return this.m_cols.length;
  }

  override SetColLabelValue(aCol: number, aLabel: string): void {
    if (aCol < 0 || aCol >= this.m_cols.length) return; // wxCHECK_RET

    this.m_cols[aCol]!.m_label = aLabel;
  }

  override GetColLabelValue(aCol: number): string {
    if (aCol < 0 || aCol >= this.m_cols.length) return ''; // wxCHECK

    return this.m_cols[aCol]!.m_label;
  }

  GetColFieldName(aCol: number): string {
    if (aCol < 0 || aCol >= this.m_cols.length) return ''; // wxCHECK

    return this.m_cols[aCol]!.m_fieldName;
  }

  GetFieldNameCol(aFieldName: string): number {
    for (let i = 0; i < this.m_cols.length; i++) {
      if (FieldNamesAreDuplicates(this.m_cols[i]!.m_fieldName, aFieldName)) return i;
    }

    return -1;
  }

  SetFieldsOrder(aNewOrder: readonly string[]): void {
    let foundCount = 0;

    for (const newField of aNewOrder) {
      for (let i = 0; i < this.m_cols.length && foundCount < this.m_cols.length; i++) {
        if (this.m_cols[i]!.m_fieldName === newField) {
          [this.m_cols[foundCount], this.m_cols[i]] = [this.m_cols[i]!, this.m_cols[foundCount]!];
          foundCount++;
          break;
        }
      }
    }
  }

  override IsEmptyCell(_aRow: number, _aCol: number): boolean {
    return false; // don't allow adjacent cell overflow, even if we are actually empty
  }

  override IsExpanderColumn(aCol: number): boolean {
    // Check if aCol is the first visible column
    for (let col = 0; col < aCol; ++col) {
      if (this.m_cols[col]!.m_show) return false;
    }

    return true;
  }

  override GetValue(aRow: number, aCol: number): string {
    this.GetView()?.SetReadOnly(aRow, aCol, this.IsExpanderColumn(aCol));
    return this.GetGroupValue(this.m_rows[aRow]!, aCol);
  }

  /** `GetValue( const LIB_DATA_MODEL_ROW& group, int aCol )`. */
  GetGroupValue(group: LIB_DATA_MODEL_ROW, aCol: number): string {
    const mixedValues = new Set<string>();
    const listMixedValues = this.ColIsSymbolName(aCol);
    let fieldValue = INDETERMINATE_STATE;

    if (aCol < 0 || aCol >= this.m_cols.length) return fieldValue; // wxCHECK

    const col = this.m_cols[aCol]!;

    for (const ref of group.m_Refs) {
      const fieldStore = this.m_dataStore.get(ref.m_Uuid);

      if (!fieldStore || !fieldStore.has(col.m_fieldName)) return INDETERMINATE_STATE;

      const refFieldValue = fieldStore.get(col.m_fieldName)!.m_currentData;

      if (listMixedValues) mixedValues.add(refFieldValue);
      else if (ref === group.m_Refs[0]) fieldValue = refFieldValue;
      else if (fieldValue !== refFieldValue) return INDETERMINATE_STATE;
    }

    if (listMixedValues) {
      fieldValue = '';

      // std::set iterates in key order
      for (const value of [...mixedValues].sort()) {
        if (value === '') continue;
        else if (fieldValue === '') fieldValue = value;
        else fieldValue += `,${value}`;
      }
    }

    return fieldValue;
  }

  override SetValue(aRow: number, aCol: number, aValue: string): void {
    if (aCol < 0 || aCol >= this.m_cols.length) return; // wxCHECK_RET

    if (this.ColIsSymbolName(aCol)) return;

    for (const ref of this.m_rows[aRow]!.m_Refs) {
      const dataElement = this.element(ref.m_Uuid, this.m_cols[aCol]!.m_fieldName);
      dataElement.m_currentData = aValue;
      dataElement.m_isModified = dataElement.m_currentData !== dataElement.m_originalData;
      dataElement.m_currentlyEmpty = false;
    }

    this.m_edited = true;
  }

  ColIsSymbolName(aCol: number): boolean {
    if (aCol < 0 || aCol >= this.m_cols.length) return false; // wxCHECK

    return this.m_cols[aCol]!.m_fieldName === LIB_FIELDS_EDITOR_GRID_DATA_MODEL.SYMBOL_NAME;
  }

  ColIsCheck(aCol: number): boolean {
    if (aCol < 0 || aCol >= this.m_cols.length) return false; // wxCHECK

    return this.m_cols[aCol]!.m_isCheckbox;
  }

  override GetAttr(aRow: number, aCol: number, aKind: wxAttrKind): wxGridCellAttr | null {
    let attr = super.GetAttr(aRow, aCol, aKind);

    // Check for column-specific attributes first
    const colAttr = this.m_colAttrs.get(aCol);

    if (colAttr) {
      if (attr) {
        // Merge with existing attributes
        const newAttr = colAttr.Clone();

        // Copy any existing attributes that aren't overridden
        if (attr.HasBackgroundColour() && !newAttr.HasBackgroundColour())
          newAttr.SetBackgroundColour(attr.GetBackgroundColour()!);

        attr = newAttr;
      } else {
        attr = colAttr.Clone();
      }
    } else if (!attr) {
      attr = new wxGridCellAttr();
    }

    let rowModified = false;
    let cellModified = false;
    let cellEmpty = true;
    let blankModified = false;

    const fieldName = this.m_cols[aCol]!.m_fieldName;

    for (const ref of this.m_rows[aRow]!.m_Refs) {
      const element = this.element(ref.m_Uuid, fieldName);

      if (element.m_isModified) cellModified = true;

      const elementEmpty =
        element.m_currentlyEmpty || (element.m_originallyEmpty && !element.m_isModified);

      if (!elementEmpty) cellEmpty = false;

      if (element.m_currentData === '' && element.m_isModified) blankModified = true;

      if (!rowModified) {
        for (const col of this.m_cols) {
          if (this.element(ref.m_Uuid, col.m_fieldName).m_isModified) {
            rowModified = true;
            break;
          }
        }
      }

      if (cellModified && rowModified && !cellEmpty) break;
    }

    // Apply striped renderer for appropriate empty cells
    if (cellEmpty && this.isStripeableField(aCol)) {
      const stripedRenderer = this.getStripedRenderer(aCol);

      if (stripedRenderer) {
        attr.SetRenderer(stripedRenderer);
        attr.SetBackgroundColour('var(--chrome-bg2)'); // wxSYS_COLOUR_WINDOW

        for (const ref of this.m_rows[aRow]!.m_Refs) {
          const element = this.element(ref.m_Uuid, fieldName);

          if (element.m_isModified) {
            element.m_isStriped = true;

            if (element.m_currentlyEmpty) {
              if (element.m_originallyEmpty) attr.SetBackgroundColour('var(--chrome-bg2)');
              else if (element.m_originalData === '') attr.SetBackgroundColour(STRIPED_ADDED_EMPTY);
              else attr.SetBackgroundColour(STRIPED_REMOVED);
            } else if (element.m_currentData === '') {
              attr.SetBackgroundColour(STRIPED_CLEARED);
            } else {
              attr.SetBackgroundColour(STRIPED_CHANGED);
            }
          }
        }
      }
    } else {
      let wasStriped = false;

      for (const ref of this.m_rows[aRow]!.m_Refs) {
        const element = this.element(ref.m_Uuid, fieldName);

        if (element.m_isStriped) {
          wasStriped = true;
          element.m_isStriped = false;
        }
      }

      // If the cell was previously striped, we need to reset the attribute
      if (wasStriped) attr = new wxGridCellAttr();

      // wxSYS_COLOUR_WINDOWFRAME
      if (rowModified) attr.SetBackgroundColour('var(--sys-windowframe)');

      if (blankModified) attr.SetBackgroundColour(BLANK_MODIFIED);
    }

    return attr;
  }

  /** `CreateDerivedSymbol( aRow, aCol, aNewSymbolName )`: a request ApplyData carries out. */
  CreateDerivedSymbol(aRow: number, aCol: number, aNewSymbolName: string): void {
    if (aRow < 0 || aRow >= this.m_rows.length) return; // wxCHECK_RET
    if (aCol < 0 || aCol >= this.m_cols.length) return; // wxCHECK_RET

    const parentSymbol = this.m_rows[aRow]!.m_Refs[0]!;
    const fieldName = this.m_cols[aCol]!.m_fieldName;

    // Use a special field name that won't conflict with real fields
    const derivedSymbolFieldName = `__DERIVED_SYMBOL_${fieldName}__`;

    // Store derived symbol creation data under special field name so ApplyData can find it
    const targetElement = this.element(parentSymbol.m_Uuid, derivedSymbolFieldName);
    targetElement.m_createDerivedSymbol = true;
    targetElement.m_derivedSymbolName = aNewSymbolName;
    targetElement.m_currentData = aNewSymbolName;
    targetElement.m_isModified = true;
    targetElement.m_originalData = parentSymbol.m_Uuid;

    this.m_edited = true;
  }

  /** `CreateDerivedSymbolImmediate( aRow, aCol, aNewSymbolName )`. */
  CreateDerivedSymbolImmediate(aRow: number, aCol: number, aNewSymbolName: string): void {
    if (aRow < 0 || aRow >= this.m_rows.length) return; // wxCHECK_RET
    if (aCol < 0 || aCol >= this.m_cols.length) return; // wxCHECK_RET

    const parentSymbol = this.m_rows[aRow]!.m_Refs[0]!;

    // Generate a fresh UUID for the new derived symbol, and create the symbol immediately
    this.createActualDerivedSymbol(parentSymbol, aNewSymbolName, newKiid());

    // Rebuild the grid to show the new symbol
    this.RebuildRows();

    this.m_edited = true;
  }

  private createActualDerivedSymbol(
    aParentSymbol: LIB_SYMBOL,
    aNewSymbolName: string,
    aNewSymbolUuid: string,
  ): void {
    let newSymbol = this.m_symbolsList.find((sym) => sym.m_Uuid === aNewSymbolUuid) ?? null;

    if (!newSymbol) {
      newSymbol = LIB_SYMBOL.copyOf(aParentSymbol);
      newSymbol.SetName(aNewSymbolName);

      // Also update the VALUE field to reflect the new name for derived symbols
      newSymbol.GetValueField().SetText(aNewSymbolName);

      newSymbol.SetLibParent(aParentSymbol);
      // Note: SetLib() not called here - library association handled by dialog's library manager
      (newSymbol as { m_Uuid: string }).m_Uuid = aNewSymbolUuid;
      this.m_symbolsList.push(newSymbol);

      // Initialize field data for the new symbol in the data store
      for (const col of this.m_cols) this.updateDataStoreSymbolField(newSymbol, col.m_fieldName);
    }

    // Note: Not adding to symbolLibrary directly - this will be handled by the dialog's library
    // manager integration
    const libraryName = aParentSymbol.GetLibId().GetLibNickname();
    this.m_createdDerivedSymbols.push([newSymbol, libraryName]);
  }

  RevertRow(aRow: number): void {
    for (const ref of this.m_rows[aRow]!.m_Refs) {
      for (const element of this.fieldStore(ref.m_Uuid).values()) {
        element.m_currentData = element.m_originalData;
        element.m_isModified = false;
        element.m_currentlyEmpty = false;
      }
    }

    this.m_edited = false;

    for (const fieldStore of this.m_dataStore.values()) {
      for (const element of fieldStore.values()) {
        if (element.m_isModified) {
          this.m_edited = true;
          return;
        }
      }
    }
  }

  ClearCell(aRow: number, aCol: number): void {
    if (aCol < 0 || aCol >= this.m_cols.length) return; // wxCHECK_RET

    for (const ref of this.m_rows[aRow]!.m_Refs) {
      const dataElement = this.element(ref.m_Uuid, this.m_cols[aCol]!.m_fieldName);

      if (this.m_cols[aCol]!.m_fieldName === 'Keywords') {
        dataElement.m_currentData = '';
        dataElement.m_currentlyEmpty = false;
        dataElement.m_isModified = dataElement.m_currentData !== dataElement.m_originalData;
      } else {
        dataElement.m_currentData = '';
        dataElement.m_currentlyEmpty = true;
        dataElement.m_isModified =
          dataElement.m_currentData !== dataElement.m_originalData ||
          dataElement.m_currentlyEmpty !== dataElement.m_originallyEmpty;
      }
    }

    this.m_edited = true;
  }

  override GetGroupType(aRow: number): GROUP_TYPE {
    return this.m_rows[aRow]!.m_Flag;
  }

  SetSorting(aCol: number, ascending: boolean): void {
    if (aCol < 0 || aCol >= this.m_cols.length) return; // wxCHECK_RET

    this.m_sortColumn = aCol;
    this.m_sortAscending = ascending;
  }

  GetSortCol(): number {
    return this.m_sortColumn;
  }

  GetSortAsc(): boolean {
    return this.m_sortAscending;
  }

  GetSymbolForRow(aRow: number): LIB_SYMBOL | null {
    if (aRow < 0 || aRow >= this.m_rows.length) return null; // wxCHECK

    return this.m_rows[aRow]!.m_Refs[0]!;
  }

  GetSymbolNames(aList: string[]): void {
    aList.length = 0;

    for (const symbol of this.m_symbolsList) aList.push(symbol.GetName());
  }

  SetSymbols(aSymbolsList: readonly LIB_SYMBOL[]): void {
    this.m_symbolsList = [...aSymbolsList];
  }

  /**
   * `cmp( lhGroup, rhGroup, dataModel, sortCol, ascending )`: empty rows always sink; then the
   * sort column's trimmed text, two groups with equal text by their second symbol's name.
   */
  private static cmp(
    lhGroup: LIB_DATA_MODEL_ROW,
    rhGroup: LIB_DATA_MODEL_ROW,
    dataModel: LIB_FIELDS_EDITOR_GRID_DATA_MODEL,
    sortCol: number,
    ascending: boolean,
  ): boolean {
    // Empty rows always go to the bottom, whether ascending or descending
    if (lhGroup.m_Refs.length === 0) return true;
    else if (rhGroup.m_Refs.length === 0) return false;

    // N.B. To meet the iterator sort conditions, we cannot simply invert the truth
    // to get the opposite sort.  i.e. ~(a<b) != (a>b)
    const local_cmp = (a: string, b: string): boolean => (ascending ? a < b : a > b);

    // Primary sort key is sortCol; secondary is always the symbol name (column 0)
    const lhs = dataModel.GetGroupValue(lhGroup, sortCol).trim();
    const rhs = dataModel.GetGroupValue(rhGroup, sortCol).trim();

    if (lhs === rhs && lhGroup.m_Refs.length > 1 && rhGroup.m_Refs.length > 1) {
      const lhRef = lhGroup.m_Refs[1]!.GetName();
      const rhRef = rhGroup.m_Refs[1]!.GetName();
      return local_cmp(lhRef, rhRef);
    }

    return local_cmp(lhs, rhs);
  }

  private Sort(): void {
    this.CollapseForSort();

    // We're going to sort the rows based on their first reference, so the first reference
    // had better be the lowest one.
    for (const row of this.m_rows) {
      sortBy(row.m_Refs, (lhs, rhs) => strNumCmp(lhs.GetRef(null), rhs.GetRef(null), true) < 0);
    }

    sortBy(this.m_rows, (lhs, rhs) =>
      LIB_FIELDS_EDITOR_GRID_DATA_MODEL.cmp(
        lhs,
        rhs,
        this,
        this.m_sortColumn,
        this.m_sortAscending,
      ),
    );

    // Time to renumber the item numbers
    let itemNumber = 1;

    for (const row of this.m_rows) row.m_ItemNumber = itemNumber++;

    this.ExpandAfterSort();
  }

  private groupMatch(lhRef: LIB_SYMBOL, rhRef: LIB_SYMBOL): boolean {
    let matchFound = false;

    // Now check all the other columns.
    for (const col of this.m_cols) {
      if (!col.m_group) continue;

      if (
        this.element(lhRef.m_Uuid, col.m_fieldName).m_currentData !==
        this.element(rhRef.m_Uuid, col.m_fieldName).m_currentData
      )
        return false;

      matchFound = true;
    }

    return matchFound;
  }

  /** `getAttributeValue()`: a checkbox column's value, "1" or "0" (unknown names read "0"). */
  private getAttributeValue(aSymbol: LIB_SYMBOL, aAttributeName: string): string {
    if (aAttributeName === '${DNP}') return aSymbol.GetDNP() ? '1' : '0';
    if (aAttributeName === '${EXCLUDE_FROM_BOARD}')
      return aSymbol.GetExcludedFromBoard() ? '1' : '0';
    if (aAttributeName === '${EXCLUDE_FROM_BOM}') return aSymbol.GetExcludedFromBOM() ? '1' : '0';
    if (aAttributeName === '${EXCLUDE_FROM_SIM}') return aSymbol.GetExcludedFromSim() ? '1' : '0';
    if (aAttributeName === 'Power') return aSymbol.IsPower() ? '1' : '0';
    if (aAttributeName === 'LocalPower') return aSymbol.IsLocalPower() ? '1' : '0';

    return '0';
  }

  /** `setAttributeValue()`. */
  private setAttributeValue(aSymbol: LIB_SYMBOL, aAttributeName: string, aValue: string): void {
    if (aAttributeName === '${DNP}') aSymbol.SetDNP(aValue === '1');
    else if (aAttributeName === '${EXCLUDE_FROM_BOARD}')
      aSymbol.SetExcludedFromBoard(aValue === '1');
    else if (aAttributeName === '${EXCLUDE_FROM_BOM}') aSymbol.SetExcludedFromBOM(aValue === '1');
    else if (aAttributeName === '${EXCLUDE_FROM_SIM}') aSymbol.SetExcludedFromSim(aValue === '1');
    else if (aAttributeName === 'LocalPower') {
      // Turning off local power still leaves the global flag set
      if (aValue === '0') aSymbol.SetGlobalPower();
      else aSymbol.SetLocalPower();
    } else if (aAttributeName === 'Power') {
      if (aValue === '0') aSymbol.SetNormal();
      else aSymbol.SetGlobalPower();
    }
    // else: "Unknown attribute name" (wxLogDebug)
  }

  RebuildRows(): void {
    const grid = this.GetView() as WX_GRID | null;

    if (grid) {
      // Commit any pending in-place edits before the row gets moved out from under
      // the editor.
      grid.CommitPendingChanges(true);

      grid.ProcessTableMessage(
        wxGridTableRequest.wxGRIDTABLE_NOTIFY_ROWS_DELETED,
        0,
        this.m_rows.length,
      );
    }

    this.m_rows = [];

    for (const ref of this.m_symbolsList) {
      if (this.m_filter !== '') {
        let match = false;
        const fieldStore = this.fieldStore(ref.m_Uuid);

        for (const col of this.m_cols) {
          const it = fieldStore.get(col.m_fieldName);

          if (it && wildCompareString(this.m_filter, it.m_currentData, false)) {
            match = true;
            break;
          }
        }

        if (!match) continue;
      }

      let matchFound = false;

      // Performance optimization for ungrouped case to skip the N^2 for loop
      if (!this.m_groupingEnabled) {
        this.m_rows.push(new LIB_DATA_MODEL_ROW(ref, GROUP_TYPE.GROUP_SINGLETON));
        continue;
      }

      // See if we already have a row which this symbol fits into
      for (const row of this.m_rows) {
        // all group members must have identical refs so just use the first one
        const rowRef = row.m_Refs[0]!;

        if (this.m_groupingEnabled && this.groupMatch(ref, rowRef)) {
          matchFound = true;
          row.m_Refs.push(ref);
          row.m_Flag = GROUP_TYPE.GROUP_COLLAPSED;
          break;
        }
      }

      if (!matchFound) this.m_rows.push(new LIB_DATA_MODEL_ROW(ref, GROUP_TYPE.GROUP_SINGLETON));
    }

    this.GetView()?.ProcessTableMessage(
      wxGridTableRequest.wxGRIDTABLE_NOTIFY_ROWS_APPENDED,
      this.m_rows.length,
      0,
    );

    this.Sort();
  }

  ExpandRow(aRow: number): void {
    const children: LIB_DATA_MODEL_ROW[] = [];

    for (const ref of this.m_rows[aRow]!.m_Refs)
      children.push(new LIB_DATA_MODEL_ROW(ref, GROUP_TYPE.CHILD_ITEM));

    if (children.length < 2) return;

    sortBy(children, (lhs, rhs) =>
      LIB_FIELDS_EDITOR_GRID_DATA_MODEL.cmp(
        lhs,
        rhs,
        this,
        this.m_sortColumn,
        this.m_sortAscending,
      ),
    );

    this.m_rows[aRow]!.m_Flag = GROUP_TYPE.GROUP_EXPANDED;
    this.m_rows.splice(aRow + 1, 0, ...children);

    this.GetView()?.ProcessTableMessage(
      wxGridTableRequest.wxGRIDTABLE_NOTIFY_ROWS_INSERTED,
      aRow,
      children.length,
    );
  }

  CollapseRow(aRow: number): void {
    let deleted = 0;

    while (
      aRow + 1 + deleted < this.m_rows.length &&
      this.m_rows[aRow + 1 + deleted]!.m_Flag === GROUP_TYPE.CHILD_ITEM
    )
      deleted++;

    this.m_rows[aRow]!.m_Flag = GROUP_TYPE.GROUP_COLLAPSED;
    this.m_rows.splice(aRow + 1, deleted);

    this.GetView()?.ProcessTableMessage(
      wxGridTableRequest.wxGRIDTABLE_NOTIFY_ROWS_DELETED,
      aRow + 1,
      deleted,
    );
  }

  ExpandCollapseRow(aRow: number): void {
    const group = this.m_rows[aRow]!;

    if (group.m_Flag === GROUP_TYPE.GROUP_COLLAPSED) this.ExpandRow(aRow);
    else if (group.m_Flag === GROUP_TYPE.GROUP_EXPANDED) this.CollapseRow(aRow);
  }

  CollapseForSort(): void {
    for (let i = 0; i < this.m_rows.length; ++i) {
      if (this.m_rows[i]!.m_Flag === GROUP_TYPE.GROUP_EXPANDED) {
        this.CollapseRow(i);
        this.m_rows[i]!.m_Flag = GROUP_TYPE.GROUP_COLLAPSED_DURING_SORT;
      }
    }
  }

  ExpandAfterSort(): void {
    for (let i = 0; i < this.m_rows.length; ++i) {
      if (this.m_rows[i]!.m_Flag === GROUP_TYPE.GROUP_COLLAPSED_DURING_SORT) this.ExpandRow(i);
    }
  }

  /**
   * `ApplyData( symbolChangeHandler, postApplyHandler )`: the data store written back onto the
   * symbols (each changed one handed to \a symbolChangeHandler first), untracked user fields
   * removed, then the derived symbols asked for created.
   */
  ApplyData(
    symbolChangeHandler: (aSymbol: LIB_SYMBOL) => void,
    postApplyHandler: (() => void) | null = null,
  ): void {
    for (const symbol of this.m_symbolsList) {
      const fieldStore = this.fieldStore(symbol.m_Uuid);

      // std::map iterates by key
      for (const srcName of [...fieldStore.keys()].sort()) {
        const dataElement = fieldStore.get(srcName)!;
        const srcValue = dataElement.m_currentData;
        const col = this.GetFieldNameCol(srcName);

        if (dataElement.m_isModified) symbolChangeHandler(symbol);

        if (srcName === LIB_FIELDS_EDITOR_GRID_DATA_MODEL.SYMBOL_NAME) continue;

        // Attributes bypass the field logic, so handle them first
        if (col !== -1 && this.ColIsCheck(col)) {
          this.setAttributeValue(symbol, srcName, srcValue);
          continue;
        }

        // Skip special fields with variables as names (e.g. ${QUANTITY}),
        // they can't be edited
        if (IsGeneratedField(srcName)) continue;

        // Skip special derived symbol creation fields - these are handled separately
        if (srcName.startsWith('__DERIVED_SYMBOL_') && srcName.endsWith('__')) continue;

        if (srcName === 'Keywords') {
          symbol.SetKeyWords(srcValue);
          dataElement.m_originalData = dataElement.m_currentData;
          dataElement.m_isModified = false;
          dataElement.m_currentlyEmpty = false;
          dataElement.m_originallyEmpty = false;
          continue;
        }

        let destField = symbol.GetField(srcName);
        const userAdded = col !== -1 && this.m_cols[col]!.m_userAdded;

        // Add a not existing field if it has a value for this symbol
        const createField = !destField && (srcValue !== '' || userAdded);

        if (createField) {
          const symbolPos = symbol.GetPosition();
          destField = new SCH_FIELD(symbol, FIELD_T.USER, srcName);
          destField.SetPosition(symbolPos);
          symbol.AddField(destField);
        }

        if (!destField) continue;

        if (destField.GetId() === FIELD_T.REFERENCE) {
          // Reference is not editable from this dialog
        } else if (destField.GetId() === FIELD_T.VALUE) {
          // Value field cannot be empty
          if (srcValue !== '') symbol.GetField(FIELD_T.VALUE)!.SetText(srcValue);
        } else if (destField.GetId() === FIELD_T.FOOTPRINT) {
          symbol.GetField(FIELD_T.FOOTPRINT)!.SetText(srcValue);
        } else {
          destField.SetText(srcValue);
        }

        dataElement.m_originalData = dataElement.m_currentData;
        dataElement.m_isModified = false;
        dataElement.m_currentlyEmpty = false;
        dataElement.m_originallyEmpty = dataElement.m_currentlyEmpty;
      }

      const symbolFields: SCH_FIELD[] = [];
      symbol.GetFields(symbolFields);

      // Remove any fields that are not mandatory
      for (const field of symbolFields) {
        if (field.IsMandatory()) continue;

        const stillTracked = fieldStore.has(field.GetName());

        if (!stillTracked) {
          symbolChangeHandler(symbol);
          symbol.RemoveField(field);
        }
      }
    }

    // Process derived symbol creation requests
    for (const fieldStore of [...this.m_dataStore.values()]) {
      for (const fieldName of [...fieldStore.keys()].sort()) {
        const element = fieldStore.get(fieldName)!;

        if (element.m_createDerivedSymbol) {
          // First try to interpret as UUID, then look up by symbol name
          let parentSymbol =
            this.m_symbolsList.find((sym) => sym.m_Uuid === element.m_originalData) ?? null;

          if (!parentSymbol)
            parentSymbol =
              this.m_symbolsList.find((sym) => sym.GetName() === element.m_originalData) ?? null;

          if (parentSymbol) {
            let actualDerivedName = element.m_derivedSymbolName;

            // If the derived name is the same as the parent name, auto-generate a unique name
            if (actualDerivedName === parentSymbol.GetName()) {
              // Try common variant patterns first
              actualDerivedName = `${parentSymbol.GetName()}_1`;

              // If that exists, try incrementing the number
              let variant = 2;
              let nameExists = true;

              while (nameExists && variant < 100) {
                nameExists = this.m_symbolsList.some((sym) => sym.GetName() === actualDerivedName);

                if (nameExists) {
                  actualDerivedName = `${parentSymbol.GetName()}_${variant}`;
                  variant++;
                }
              }
            }

            // Generate a fresh UUID for the new derived symbol (don't reuse symId which is for
            // an existing symbol)
            this.createActualDerivedSymbol(parentSymbol, actualDerivedName, newKiid());
          }

          element.m_createDerivedSymbol = false;
          break;
        }
      }
    }

    this.m_edited = false;

    // Call post-apply handler if provided (for library operations and tree refresh)
    postApplyHandler?.();
  }

  /** Get and clear the list of newly created derived symbols for library manager processing. */
  GetAndClearCreatedDerivedSymbols(): [LIB_SYMBOL, string][] {
    const result = this.m_createdDerivedSymbols;
    this.m_createdDerivedSymbols = [];
    return result;
  }

  IsEdited(): boolean {
    return this.m_edited;
  }

  GetDataWidth(aCol: number): number {
    let width = 0;
    const fieldName = this.GetColFieldName(aCol); // symbol fieldName or Qty string

    for (const symbol of this.m_symbolsList)
      width = Math.max(width, GetTextExtent(this.element(symbol.m_Uuid, fieldName).m_currentData));

    return width;
  }

  override GetTypeName(row: number, col: number): string {
    if (this.ColIsCheck(col)) return wxGRID_VALUE_BOOL;

    return super.GetTypeName(row, col);
  }

  SetFilter(aFilter: string): void {
    this.m_filter = aFilter;
  }

  GetFilter(): string {
    return this.m_filter;
  }

  SetGroupingEnabled(group: boolean): void {
    this.m_groupingEnabled = group;
  }

  GetGroupingEnabled(): boolean {
    return this.m_groupingEnabled;
  }

  SetGroupColumn(aCol: number, group: boolean): void {
    if (aCol < 0 || aCol >= this.m_cols.length) return; // wxCHECK_RET

    this.m_cols[aCol]!.m_group = group;
  }

  GetGroupColumn(aCol: number): boolean {
    if (aCol < 0 || aCol >= this.m_cols.length) return false; // wxCHECK_MSG

    return this.m_cols[aCol]!.m_group;
  }

  SetShowColumn(aCol: number, show: boolean): void {
    if (aCol < 0 || aCol >= this.m_cols.length) return; // wxCHECK_RET

    this.m_cols[aCol]!.m_show = show;
  }

  GetShowColumn(aCol: number): boolean {
    if (aCol < 0 || aCol >= this.m_cols.length) return false; // wxCHECK_MSG

    return this.m_cols[aCol]!.m_show;
  }

  /** `IsRowEditable()`: upstream compares with GROUP_SINGLETON twice; kept. */
  IsRowEditable(aRow: number): boolean {
    if (aRow < 0 || aRow >= this.m_rows.length) return false; // wxCHECK_MSG

    return this.m_rows[aRow]!.m_Flag === GROUP_TYPE.GROUP_SINGLETON;
  }

  IsCellEdited(aRow: number, aCol: number): boolean {
    if (aRow < 0 || aRow >= this.m_rows.length) return false; // wxCHECK_MSG
    if (aCol < 0 || aCol >= this.m_cols.length) return false; // wxCHECK_MSG

    return this.element(this.m_rows[aRow]!.m_Refs[0]!.m_Uuid, this.m_cols[aCol]!.m_fieldName)
      .m_isModified;
  }

  IsCellClear(aRow: number, aCol: number): boolean {
    if (aRow < 0 || aRow >= this.m_rows.length) return false; // wxCHECK_MSG
    if (aCol < 0 || aCol >= this.m_cols.length) return false; // wxCHECK_MSG

    return this.element(this.m_rows[aRow]!.m_Refs[0]!.m_Uuid, this.m_cols[aCol]!.m_fieldName)
      .m_currentlyEmpty;
  }

  IsRowSingleSymbol(aRow: number): boolean {
    if (aRow < 0 || aRow >= this.m_rows.length) return false; // wxCHECK_MSG

    return (
      this.m_rows[aRow]!.m_Flag === GROUP_TYPE.GROUP_SINGLETON ||
      this.m_rows[aRow]!.m_Flag === GROUP_TYPE.CHILD_ITEM
    );
  }

  /** `isStripeableField( aCol )`: every column but the checkboxes. */
  private isStripeableField(aCol: number): boolean {
    if (aCol < 0 || aCol >= this.m_cols.length) return false; // wxCHECK

    // Don't apply stripes to checkbox fields
    return !this.ColIsCheck(aCol);
  }

  /** `getStripedRenderer( aCol )`: one STRIPED_STRING_RENDERER per field name, cached. */
  private getStripedRenderer(aCol: number): wxGridCellRenderer | null {
    if (aCol < 0 || aCol >= this.m_cols.length) return null; // wxCHECK

    const fieldName = this.m_cols[aCol]!.m_fieldName;

    // Check if we already have a striped renderer for this field type
    let stripedRenderer = this.m_stripedRenderers.get(fieldName);

    if (!stripedRenderer) {
      // Default to striped string renderer
      stripedRenderer = new STRIPED_STRING_RENDERER();

      // Cache the renderer for future use
      this.m_stripedRenderers.set(fieldName, stripedRenderer);
    }

    return stripedRenderer;
  }
}

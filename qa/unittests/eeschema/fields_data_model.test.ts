// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * FIELDS_EDITOR_GRID_DATA_MODEL against kicad-cli 10.0.6's own `sch export bom`, which builds and
 * exports exactly this model (EESCHEMA_JOBS_HANDLER::JobExportBom): the complex hierarchy with
 * the default fields, grouped by Value and Footprint, and every field (`*`) sorted by Value with
 * `;` delimiters and no reference ranges. `exportBom` below is JobExportBom's model building, step
 * for step.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GetGeneratedFieldDisplayName, IsGeneratedField } from '@ziroeda/common/common.js';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { PROJECT } from '@ziroeda/common/project.js';
import { PROJECT_FILE } from '@ziroeda/common/project/project_file.js';
import type { BOM_FIELD, BOM_PRESET } from '@ziroeda/common/settings/bom_settings.js';
import {
  GetCanonicalFieldName,
  GetDefaultFieldName,
  MANDATORY_FIELDS,
} from '@ziroeda/common/template_fieldnames.js';
import { LoadSchematic } from '@ziroeda/eeschema/eeschema_helpers.js';
import { FIELDS_EDITOR_GRID_DATA_MODEL } from '@ziroeda/eeschema/fields_data_model.js';
import { SCH_REFERENCE_LIST } from '@ziroeda/eeschema/sch_reference_list.js';
import { SYMBOL_FILTER } from '@ziroeda/eeschema/sch_sheet_path.js';
import type { SCHEMATIC } from '@ziroeda/eeschema/schematic.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const DIR = resolve(__dirname, '../../data/eeschema/netlist_oracle/complex_hierarchy');
const ORACLE = resolve(__dirname, '../../data/eeschema/bom_oracle');

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => SetPgm(null));

function load(): SCHEMATIC {
  const pro = join(DIR, 'complex_hierarchy.kicad_pro');
  const project = new PROJECT();
  project.setProjectFullName(pro);
  const file = new PROJECT_FILE(pro);
  project.setProjectFile(file);
  file.LoadFromFile(JSON.parse(readFileSync(pro, 'utf8')));
  return LoadSchematic(join(DIR, 'complex_hierarchy.kicad_sch'), project, (p) =>
    existsSync(p) ? readFileSync(p, 'utf8') : null,
  )!;
}

interface BomJob {
  fields: string[];
  labels: string[];
  groupBy: string[];
  sortField: string;
  fieldDelimiter: string;
  refRangeDelimiter: string;
}

/** EESCHEMA_JOBS_HANDLER::JobExportBom's data model, preset and format, then Export(). */
function exportBom(sch: SCHEMATIC, job: BomJob): string {
  const referenceList = new SCH_REFERENCE_LIST();
  sch.Hierarchy().GetSymbols(referenceList, SYMBOL_FILTER.SYMBOL_FILTER_NON_POWER, false);

  const dataModel = new FIELDS_EDITOR_GRID_DATA_MODEL(referenceList, null);

  // Mandatory fields first
  for (const fieldId of MANDATORY_FIELDS)
    dataModel.AddColumn(GetCanonicalFieldName(fieldId), GetDefaultFieldName(fieldId, true), false);

  // Generated/virtual fields, then the attribute fields
  for (const name of [
    FIELDS_EDITOR_GRID_DATA_MODEL.QUANTITY_VARIABLE,
    FIELDS_EDITOR_GRID_DATA_MODEL.ITEM_NUMBER_VARIABLE,
    '${DNP}',
    '${EXCLUDE_FROM_BOM}',
    '${EXCLUDE_FROM_BOARD}',
    '${EXCLUDE_FROM_SIM}',
  ])
    dataModel.AddColumn(name, GetGeneratedFieldDisplayName(name), false);

  // User field names in symbols second
  const userFieldNames = new Set<string>();
  for (let i = 0; i < referenceList.GetCount(); ++i) {
    for (const field of referenceList.GetItem(i).GetSymbol()!.GetFields()) {
      if (!field.IsMandatory() && !field.IsPrivate()) userFieldNames.add(field.GetName());
    }
  }
  for (const fieldName of [...userFieldNames].sort())
    dataModel.AddColumn(fieldName, GetGeneratedFieldDisplayName(fieldName), true);

  for (const t of sch.Settings().m_TemplateFieldNames.GetTemplateFieldNames()) {
    if (!userFieldNames.has(t.m_Name))
      dataModel.AddColumn(t.m_Name, GetGeneratedFieldDisplayName(t.m_Name), false);
  }

  const normalizeFieldName = (aName: string): string => {
    if (aName === '') return '';
    if (IsGeneratedField(aName)) return aName;
    const wrapped = `\${${aName}}`;
    if (IsGeneratedField(wrapped) && dataModel.GetFieldNameCol(wrapped) !== -1) return wrapped;
    return aName;
  };

  const fieldsOrdered: BOM_FIELD[] = [];
  let i = 0;
  for (const rawFieldName of job.fields) {
    const fieldName = normalizeFieldName(rawFieldName);
    if (fieldName === '*') {
      for (const modelField of dataModel.GetFieldsOrdered()) {
        if (fieldsOrdered.some((f) => f.name === modelField.name)) continue;
        if (job.fields.some((f) => normalizeFieldName(f) === modelField.name)) continue;
        fieldsOrdered.push({
          name: modelField.name,
          label: modelField.name,
          show: true,
          groupBy: false,
        });
      }
      continue;
    }
    const label = job.labels[i]
      ? job.labels[i]!
      : IsGeneratedField(fieldName)
        ? GetGeneratedFieldDisplayName(fieldName)
        : fieldName;
    fieldsOrdered.push({
      name: fieldName,
      label,
      show: !fieldName.startsWith('__'),
      groupBy: job.groupBy.includes(fieldName) || job.groupBy.includes(rawFieldName),
    });
    i++;
  }

  const preset: BOM_PRESET = {
    name: '',
    fieldsOrdered,
    sortField: normalizeFieldName(job.sortField),
    sortAsc: true,
    filterString: '',
    groupSymbols: true,
    excludeDNP: false,
    includeExcludedFromBOM: false,
  };

  dataModel.SetVariantNames(['']);
  dataModel.SetCurrentVariant('');
  dataModel.UpdateReferences(dataModel.GetReferenceList());
  dataModel.ApplyBomPreset(preset);

  return dataModel.Export({
    name: '',
    fieldDelimiter: job.fieldDelimiter,
    stringDelimiter: '"',
    refDelimiter: ',',
    refRangeDelimiter: job.refRangeDelimiter,
    keepTabs: false,
    keepLineBreaks: false,
  });
}

const DEFAULT_JOB: BomJob = {
  fields: ['Reference', 'Value', 'Footprint', 'QUANTITY', 'DNP'],
  labels: ['Refs', 'Value', 'Footprint', 'Qty', 'DNP'],
  groupBy: [],
  sortField: 'Reference',
  fieldDelimiter: ',',
  refRangeDelimiter: '-',
};

describe('FIELDS_EDITOR_GRID_DATA_MODEL against kicad-cli sch export bom', () => {
  it('the default fields', () => {
    expect(exportBom(load(), DEFAULT_JOB)).toBe(
      readFileSync(join(ORACLE, 'complex_hierarchy_default.csv'), 'utf8'),
    );
  });

  it('grouped by Value and Footprint', () => {
    expect(exportBom(load(), { ...DEFAULT_JOB, groupBy: ['Value', 'Footprint'] })).toBe(
      readFileSync(join(ORACLE, 'complex_hierarchy_grouped.csv'), 'utf8'),
    );
  });

  it('every field, sorted by Value, no ranges, ; delimited', () => {
    expect(
      exportBom(load(), {
        fields: ['*'],
        labels: [],
        groupBy: [],
        sortField: 'Value',
        fieldDelimiter: ';',
        refRangeDelimiter: '',
      }),
    ).toBe(readFileSync(join(ORACLE, 'complex_hierarchy_all.csv'), 'utf8'));
  });
});

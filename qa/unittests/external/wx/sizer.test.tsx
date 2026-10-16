// @vitest-environment happy-dom
/**
 * external/wx/sizer.tsx: each prop of `Add( item, proportion, flag, border )` lands as the one
 * style wx's own layout gives it, and nothing a dialog did not say.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  wxALIGN_BOTTOM,
  wxALIGN_CENTER_HORIZONTAL,
  wxALIGN_CENTER_VERTICAL,
  wxALIGN_RIGHT,
  wxALL,
  wxBOTTOM,
  wxEXPAND,
  wxHORIZONTAL,
  wxLEFT,
  wxRESERVE_SPACE_EVEN_IF_HIDDEN,
  wxRIGHT,
  wxTOP,
  wxVERTICAL,
} from '@ziroeda/wx/defs.js';
import {
  BoxSizer,
  FlexGridSizer,
  GridBagSizer,
  SizerItem,
  Spacer,
  StaticBoxSizer,
  StdDialogButtonSizer,
} from '@ziroeda/wx/sizer.js';

afterEach(cleanup);

/** An element's four margins, top right bottom left. */
const margins = (aEl: HTMLElement): string[] => [
  aEl.style.marginTop,
  aEl.style.marginRight,
  aEl.style.marginBottom,
  aEl.style.marginLeft,
];

/** The item wrapper around the element with this test id. */
const item = (aId: string, aRoot: HTMLElement): HTMLElement =>
  aRoot.querySelector(`[data-testid="${aId}"]`)!.parentElement as HTMLElement;

describe('BoxSizer items', () => {
  it('a border is a margin on exactly the sides the flag names, and they add up', () => {
    const { container } = render(
      <BoxSizer orient={wxVERTICAL}>
        <SizerItem flag={wxTOP | wxRIGHT | wxLEFT} border={5}>
          <span data-testid="a" />
        </SizerItem>
        <SizerItem flag={wxBOTTOM} border={3}>
          <span data-testid="b" />
        </SizerItem>
        <SizerItem flag={wxALL} border={20}>
          <span data-testid="c" />
        </SizerItem>
        <SizerItem>
          <span data-testid="d" />
        </SizerItem>
      </BoxSizer>,
    );
    expect(margins(item('a', container))).toEqual(['5px', '5px', '0px', '5px']);
    expect(margins(item('b', container))).toEqual(['0px', '0px', '3px', '0px']);
    expect(margins(item('c', container))).toEqual(['20px', '20px', '20px', '20px']);
    expect(margins(item('d', container))).toEqual(['0px', '0px', '0px', '0px']);
  });

  it('proportion is the share of the extra space, and 0 keeps the minimum', () => {
    const { container } = render(
      <BoxSizer orient={wxHORIZONTAL}>
        <SizerItem>
          <span data-testid="min" />
        </SizerItem>
        <SizerItem proportion={3}>
          <span data-testid="three" />
        </SizerItem>
        <SizerItem proportion={2}>
          <span data-testid="two" />
        </SizerItem>
      </BoxSizer>,
    );
    expect(item('min', container).style.flexGrow).toBe('0');
    expect(item('three', container).style.flexGrow).toBe('3');
    expect(item('two', container).style.flexGrow).toBe('2');
  });

  it('wxEXPAND stretches across; wxALIGN_* places a non-expanded item across', () => {
    const { container } = render(
      <BoxSizer orient={wxVERTICAL}>
        <SizerItem flag={wxEXPAND}>
          <span data-testid="x" />
        </SizerItem>
        <SizerItem flag={wxALIGN_RIGHT}>
          <span data-testid="r" />
        </SizerItem>
        <SizerItem flag={wxALIGN_CENTER_HORIZONTAL}>
          <span data-testid="c" />
        </SizerItem>
        <SizerItem>
          <span data-testid="l" />
        </SizerItem>
      </BoxSizer>,
    );
    expect(item('x', container).style.alignItems).toBe('stretch');
    expect(item('r', container).style.alignItems).toBe('flex-end');
    expect(item('c', container).style.alignItems).toBe('center');
    expect(item('l', container).style.alignItems).toBe('flex-start');
  });

  it('across a HORIZONTAL sizer the alignment is vertical', () => {
    const { container } = render(
      <BoxSizer orient={wxHORIZONTAL}>
        <SizerItem flag={wxALIGN_CENTER_VERTICAL}>
          <span data-testid="v" />
        </SizerItem>
        <SizerItem flag={wxALIGN_BOTTOM}>
          <span data-testid="b" />
        </SizerItem>
        <SizerItem flag={wxALIGN_RIGHT}>
          <span data-testid="h" />
        </SizerItem>
      </BoxSizer>,
    );
    expect(item('v', container).style.alignItems).toBe('center');
    expect(item('b', container).style.alignItems).toBe('flex-end');
    // wxALIGN_RIGHT is a horizontal alignment: in a horizontal sizer it is not across.
    expect(item('h', container).style.alignItems).toBe('flex-start');
  });

  it('the sizer lays its items along its orientation, and an item fills its slot along it', () => {
    const { container } = render(
      <BoxSizer orient={wxHORIZONTAL}>
        <SizerItem>
          <span data-testid="a" />
        </SizerItem>
      </BoxSizer>,
    );
    const sizer = container.querySelector('.ze-sizer') as HTMLElement;
    expect(sizer.style.flexDirection).toBe('row');
    expect(item('a', container).style.flexDirection).toBe('row');
    expect(item('a', container).classList.contains('ze-szi-fill')).toBe(true);
  });

  it("minSize is the window's SetMinSize, -1 leaving that axis alone", () => {
    const { container } = render(
      <BoxSizer orient={wxHORIZONTAL}>
        <SizerItem minSize={[350, -1]}>
          <span data-testid="m" />
        </SizerItem>
      </BoxSizer>,
    );
    expect(item('m', container).style.minWidth).toBe('350px');
    expect(item('m', container).style.minHeight).toBe('');
  });

  it('a hidden item takes no space at all', () => {
    const { container } = render(
      <BoxSizer orient={wxVERTICAL}>
        <SizerItem shown={false} flag={wxALL} border={5}>
          <span data-testid="gone" />
        </SizerItem>
      </BoxSizer>,
    );
    expect(container.querySelector('[data-testid="gone"]')).toBeNull();
    expect(container.querySelectorAll('.ze-szi')).toHaveLength(0);
  });

  it('wxRESERVE_SPACE_EVEN_IF_HIDDEN: a hidden item is laid out but not drawn', () => {
    const { container } = render(
      <BoxSizer orient={wxVERTICAL}>
        <SizerItem shown={false} flag={wxALL | wxRESERVE_SPACE_EVEN_IF_HIDDEN} border={5}>
          <span data-testid="kept" />
        </SizerItem>
      </BoxSizer>,
    );
    const kept = container.querySelector('[data-testid="kept"]')!.parentElement as HTMLElement;
    expect(kept.style.visibility).toBe('hidden');
    expect(margins(kept)).toEqual(['5px', '5px', '5px', '5px']);
  });

  it('a reserved hidden item keeps its proportional track', () => {
    const { container } = render(
      <BoxSizer orient={wxVERTICAL}>
        <SizerItem proportion={2}>
          <span />
        </SizerItem>
        <SizerItem shown={false} proportion={1} flag={wxRESERVE_SPACE_EVEN_IF_HIDDEN}>
          <span />
        </SizerItem>
      </BoxSizer>,
    );
    const sizer = container.querySelector('.ze-sizer') as HTMLElement;
    expect(sizer.style.gridTemplateRows).toBe('minmax(max-content, 2fr) minmax(max-content, 1fr)');
  });

  it('a spacer is its stated size, or a share of the slack', () => {
    const { container } = render(
      <BoxSizer orient={wxVERTICAL}>
        <Spacer width={0} height={8} />
        <Spacer proportion={1} />
      </BoxSizer>,
    );
    const [fixed, stretch] = [...container.querySelectorAll<HTMLElement>('.ze-szspacer')];
    expect(fixed!.style.minHeight).toBe('8px');
    expect(fixed!.style.flexGrow).toBe('0');
    expect(stretch!.style.flexGrow).toBe('1');
  });
});

describe('BoxSizer with proportional items (CalcMin)', () => {
  it('two proportion-1 items are equal fr tracks, so different minima still open equal', () => {
    const { container } = render(
      <BoxSizer orient={wxHORIZONTAL}>
        <SizerItem proportion={1}>
          <span>short</span>
        </SizerItem>
        <SizerItem>
          <span>fixed</span>
        </SizerItem>
        <SizerItem proportion={1}>
          <span>a much longer pane</span>
        </SizerItem>
      </BoxSizer>,
    );
    const sizer = container.querySelector('.ze-sizer') as HTMLElement;
    expect(sizer.style.display).toBe('grid');
    expect(sizer.style.gridTemplateColumns).toBe(
      'minmax(max-content, 1fr) max-content minmax(max-content, 1fr)',
    );
  });

  it("a proportion set inside a helper is the helper's item's proportion", () => {
    // dialog_global_edit_text_and_graphics_base.tsx's `Sp`: AddStretchSpacer with its own defaults.
    const Sp = (): JSX.Element => <Spacer proportion={1} />;
    const { container } = render(
      <BoxSizer orient={wxHORIZONTAL}>
        <SizerItem>
          <span>fixed</span>
        </SizerItem>
        <Sp />
      </BoxSizer>,
    );
    const sizer = container.querySelector('.ze-sizer') as HTMLElement;
    expect(sizer.style.gridTemplateColumns).toBe('max-content minmax(max-content, 1fr)');
  });

  it('a vertical one lays its tracks as rows; a hidden item has no track', () => {
    const { container } = render(
      <BoxSizer orient={wxVERTICAL}>
        <SizerItem proportion={2}>
          <span />
        </SizerItem>
        <SizerItem shown={false} proportion={5}>
          <span />
        </SizerItem>
        <Spacer proportion={1} />
      </BoxSizer>,
    );
    const sizer = container.querySelector('.ze-sizer') as HTMLElement;
    expect(sizer.style.gridTemplateRows).toBe('minmax(max-content, 2fr) minmax(max-content, 1fr)');
  });

  it('with no proportional item it stays a flex line', () => {
    const { container } = render(
      <BoxSizer orient={wxVERTICAL}>
        <SizerItem>
          <span />
        </SizerItem>
      </BoxSizer>,
    );
    const sizer = container.querySelector('.ze-sizer') as HTMLElement;
    expect(sizer.style.display).toBe('');
    expect(sizer.style.flexDirection).toBe('column');
  });

  it('a nested sizer added with wxEXPAND fills its slot across and along', () => {
    const { container } = render(
      <BoxSizer orient={wxVERTICAL}>
        <SizerItem proportion={1} flag={wxEXPAND}>
          <BoxSizer orient={wxHORIZONTAL}>
            <SizerItem>
              <span data-testid="inner" />
            </SizerItem>
          </BoxSizer>
        </SizerItem>
      </BoxSizer>,
    );
    const outer = item('inner', container).parentElement!.parentElement as HTMLElement;
    expect(outer.classList.contains('ze-szi-fill')).toBe(true);
    expect(outer.style.alignItems).toBe('stretch');
  });
});

describe('FlexGridSizer', () => {
  it('columns are their content, growable ones share the slack by proportion, gaps are vgap/hgap', () => {
    const { container } = render(
      <FlexGridSizer cols={3} vgap={3} hgap={5} growableCols={[1, [2, 2]]}>
        {['a', 'b', 'c', 'd', 'e', 'f'].map((k) => (
          <SizerItem key={k}>
            <span />
          </SizerItem>
        ))}
      </FlexGridSizer>,
    );
    const grid = container.querySelector('.ze-gridsizer') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe(
      'max-content minmax(max-content, 1fr) minmax(max-content, 2fr)',
    );
    expect(grid.style.gridTemplateRows).toBe('max-content max-content');
    expect(grid.style.rowGap).toBe('3px');
    expect(grid.style.columnGap).toBe('5px');
  });

  it('a cell item fills its cell only with wxEXPAND, else is placed by wxALIGN_* both ways', () => {
    const { container } = render(
      <FlexGridSizer cols={2}>
        <SizerItem flag={wxEXPAND}>
          <span data-testid="x" />
        </SizerItem>
        <SizerItem flag={wxALIGN_CENTER_VERTICAL | wxALIGN_RIGHT}>
          <span data-testid="cr" />
        </SizerItem>
      </FlexGridSizer>,
    );
    expect(item('x', container).classList.contains('ze-szi-fill')).toBe(true);
    expect(item('cr', container).classList.contains('ze-szi-fill')).toBe(false);
    expect(item('cr', container).style.alignItems).toBe('center');
    expect(item('cr', container).style.justifyContent).toBe('flex-end');
  });

  it('a hidden item does not count towards the rows', () => {
    const { container } = render(
      <FlexGridSizer cols={2}>
        <SizerItem>
          <span />
        </SizerItem>
        <SizerItem>
          <span />
        </SizerItem>
        <SizerItem shown={false}>
          <span />
        </SizerItem>
      </FlexGridSizer>,
    );
    const grid = container.querySelector('.ze-gridsizer') as HTMLElement;
    expect(grid.style.gridTemplateRows).toBe('max-content');
  });

  it('a hidden item keeps its cell: the items after it do not move up', () => {
    const { container } = render(
      <FlexGridSizer cols={2}>
        <SizerItem>
          <span data-testid="a" />
        </SizerItem>
        <SizerItem shown={false}>
          <span data-testid="hidden" />
        </SizerItem>
        <SizerItem>
          <span data-testid="c" />
        </SizerItem>
      </FlexGridSizer>,
    );
    expect(container.querySelector('[data-testid="hidden"]')).toBeNull();
    // c is the third Add(): row 1, column 0 - not row 0 column 1, where the hidden one sits.
    expect(item('c', container).style.gridRow).toBe('2 / span 1');
    expect(item('c', container).style.gridColumn).toBe('1 / span 1');
  });

  it('a column whose items are all hidden collapses, and the next column moves into its place', () => {
    const { container } = render(
      <FlexGridSizer cols={3} growableCols={[2]}>
        <SizerItem>
          <span data-testid="a" />
        </SizerItem>
        <SizerItem shown={false}>
          <span />
        </SizerItem>
        <SizerItem>
          <span data-testid="c" />
        </SizerItem>
      </FlexGridSizer>,
    );
    const grid = container.querySelector('.ze-gridsizer') as HTMLElement;
    // Two columns left, and the growable one (was 2) is now 1.
    expect(grid.style.gridTemplateColumns).toBe('max-content minmax(max-content, 1fr)');
    expect(item('c', container).style.gridColumn).toBe('2 / span 1');
  });

  it('a fragment of items counts as its items, not as one cell', () => {
    const { container } = render(
      <FlexGridSizer cols={2}>
        <>
          <SizerItem>
            <span />
          </SizerItem>
          <SizerItem>
            <span />
          </SizerItem>
        </>
        <SizerItem>
          <span data-testid="third" />
        </SizerItem>
      </FlexGridSizer>,
    );
    expect(item('third', container).style.gridRow).toBe('2 / span 1');
    const grid = container.querySelector('.ze-gridsizer') as HTMLElement;
    expect(grid.style.gridTemplateRows).toBe('max-content max-content');
  });

  it("a helper's items are its Add()s, each in its own cell in order (Footprint Properties' UnitRow)", () => {
    // The `_base` files' label / entry / units row, as dialog_footprint_properties_base.tsx has it.
    function UnitRow({ id }: { id: string }): JSX.Element {
      return (
        <>
          <SizerItem>
            <span data-testid={`${id}-label`} />
          </SizerItem>
          <SizerItem>
            <span data-testid={`${id}-entry`} />
          </SizerItem>
          <SizerItem>
            <span data-testid={`${id}-units`} />
          </SizerItem>
        </>
      );
    }
    const { container } = render(
      <FlexGridSizer cols={3}>
        <UnitRow id="x" />
        <UnitRow id="y" />
        <SizerItem>
          <span data-testid="after" />
        </SizerItem>
      </FlexGridSizer>,
    );
    const cell = (aId: string): string[] => {
      const s = item(aId, container).style;
      return [s.gridRow, s.gridColumn];
    };
    expect(cell('x-label')).toEqual(['1 / span 1', '1 / span 1']);
    expect(cell('x-units')).toEqual(['1 / span 1', '3 / span 1']);
    expect(cell('y-label')).toEqual(['2 / span 1', '1 / span 1']);
    expect(cell('y-entry')).toEqual(['2 / span 1', '2 / span 1']);
    expect(cell('after')).toEqual(['3 / span 1', '1 / span 1']);
  });

  it("two helpers' items keep apart: no duplicate React keys", () => {
    // Children.toArray restarts its keys inside every helper, so both rows' first items
    // would be '.0' - React warns, and may hand one row's entry the other's state.
    function Pair({ id }: { id: string }): JSX.Element {
      return (
        <>
          <SizerItem>
            <span data-testid={`${id}-a`} />
          </SizerItem>
          <SizerItem>
            <span data-testid={`${id}-b`} />
          </SizerItem>
        </>
      );
    }
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errors.push(a.map(String).join(' '));
    });
    try {
      render(
        <FlexGridSizer cols={2}>
          <Pair id="p" />
          <Pair id="q" />
        </FlexGridSizer>,
      );
    } finally {
      spy.mockRestore();
    }
    expect(errors.filter((e) => /same key/.test(e))).toEqual([]);
  });

  it('with no flexible direction it is a wxGridSizer: every track the size of the largest', () => {
    const { container } = render(
      <FlexGridSizer cols={2} flexibleDirection={0}>
        <SizerItem>
          <span />
        </SizerItem>
        <SizerItem>
          <span />
        </SizerItem>
      </FlexGridSizer>,
    );
    const grid = container.querySelector('.ze-gridsizer') as HTMLElement;
    // A plain fr track sizes to the largest track's content at the intrinsic size, as wx does.
    expect(grid.style.gridTemplateColumns).toBe('1fr 1fr');
  });
});

describe('GridBagSizer', () => {
  it('items sit at pos with span; an empty row or column is the empty-cell size', () => {
    const { container } = render(
      <GridBagSizer vgap={0} hgap={20} emptyCellSize={[10, 8]}>
        <SizerItem pos={[0, 0]}>
          <span data-testid="a" />
        </SizerItem>
        <SizerItem pos={[2, 0]} span={[1, 3]}>
          <span data-testid="b" />
        </SizerItem>
      </GridBagSizer>,
    );
    const grid = container.querySelector('.ze-gridsizer') as HTMLElement;
    expect(grid.style.gridTemplateRows).toBe('max-content 8px max-content');
    expect(grid.style.gridTemplateColumns).toBe('max-content max-content max-content');
    expect(item('a', container).style.gridRow).toBe('1 / span 1');
    expect(item('b', container).style.gridRow).toBe('3 / span 1');
    expect(item('b', container).style.gridColumn).toBe('1 / span 3');
  });
});

describe('StaticBoxSizer', () => {
  it('is a box sizer inside the static box, with the label as the legend', () => {
    const { container } = render(
      <StaticBoxSizer label="Options" orient={wxHORIZONTAL}>
        <SizerItem flag={wxLEFT} border={5}>
          <span />
        </SizerItem>
      </StaticBoxSizer>,
    );
    const box = container.querySelector('fieldset.ze-sbox') as HTMLElement;
    expect(box.querySelector('legend')!.textContent).toBe('Options');
    expect((box.querySelector('.ze-sizer') as HTMLElement).style.flexDirection).toBe('row');
  });
});

describe('StdDialogButtonSizer', () => {
  it('Realize() on GTK: Cancel, Apply, OK, with OK the default', () => {
    const { container } = render(
      <StdDialogButtonSizer onCancel={() => {}} onOk={() => {}} onApply={() => {}} />,
    );
    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toEqual(['Cancel', 'Apply', 'OK']);
    expect(container.querySelector('button.primary')!.textContent).toBe('OK');
  });
});

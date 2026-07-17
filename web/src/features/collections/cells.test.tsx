import { render, screen } from '@testing-library/react';
import type { ColumnModel } from '../../data/schemaModel';
import { renderCell } from './cells';

/**
 * Structured (JSON-scalar) slot values — e.g. a LinkML inline value type like
 * a quantity `{ value, unit }` that Mosaic emits as a JSON passthrough scalar —
 * must render legibly, never as "[object Object]".
 */
describe('renderCell — structured / object-valued slots', () => {
  const textCol: ColumnModel = { field: 'mass', label: 'Mass', kind: 'text' };

  it('renders an object value as key: value pairs, not [object Object]', () => {
    render(<>{renderCell(textCol, { value: 1350, unit: 'g' })}</>);
    expect(screen.getByText('value: 1350 · unit: g')).toBeInTheDocument();
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
  });

  it('renders an array value as joined items', () => {
    render(<>{renderCell(textCol, ['alpha', 'beta'])}</>);
    expect(screen.getByText('alpha, beta')).toBeInTheDocument();
  });

  it('still renders a plain scalar unchanged', () => {
    render(<>{renderCell(textCol, 'hello')}</>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});

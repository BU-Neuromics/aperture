import { render, screen } from '@testing-library/react';
import { DataSourceProvider, useCapabilities, useDataSource } from './DataSourceContext';
import { capableSchema, fakeClient } from './testing/fixtures';

/** A feature gated on a negotiated capability (the ADR-0029 seam in action). */
function Probe() {
  const state = useDataSource();
  const caps = useCapabilities();
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      {caps.offsetPagination && <button>Next page</button>}
    </div>
  );
}

describe('DataSourceProvider / useCapabilities (step 0.4)', () => {
  it('is unconfigured without an endpoint URL — capability-gated UI stays hidden', () => {
    render(
      <DataSourceProvider endpoint={{ url: null }}>
        <Probe />
      </DataSourceProvider>,
    );
    expect(screen.getByTestId('status')).toHaveTextContent('unconfigured');
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
  });

  it('negotiates capabilities and lights up gated features', async () => {
    render(
      <DataSourceProvider
        endpoint={{ url: 'http://example.test/graphql' }}
        clientFactory={() => fakeClient(capableSchema())}
      >
        <Probe />
      </DataSourceProvider>,
    );
    expect(await screen.findByTestId('status')).toHaveTextContent('ready');
    expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();
  });

  it('surfaces connection failure as an error state (honest degradation)', async () => {
    const failing = () => ({
      async query() {
        return { data: null, error: new Error('unreachable') };
      },
    });
    render(
      <DataSourceProvider endpoint={{ url: 'http://example.test/graphql' }} clientFactory={failing}>
        <Probe />
      </DataSourceProvider>,
    );
    expect(await screen.findByTestId('status')).toHaveTextContent('error');
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
  });
});

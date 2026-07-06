import { AppShell } from './shell/AppShell';
import { Brand } from './shell/Brand';
import { DataSourceProvider } from './data/DataSourceContext';
import { resolveEndpoint } from './data/endpoint';
import type { EndpointConfig } from './data/endpoint';
import type { ScopedDataClient } from './data/scopedClient';
import { CollectionsNav } from './features/collections/CollectionsNav';
import { CollectionMain } from './features/collections/CollectionMain';
import { FacetPanel } from './features/collections/FacetPanel';
import type { ResolvedWorkflows } from './workflows/config';
import { resolveWorkflows } from './workflows/config';
import { WorkflowsProvider } from './workflows/WorkflowsContext';

/**
 * The Phase-0 walking skeleton, end to end: endpoint config → Layer-D
 * adapter → capability negotiation → schema-derived nav + table in the
 * configured layout's slots, with {collection, page} in the URL.
 */
const shellConfig = { layout: 'headerNavMain' };

interface AppProps {
  /** Test seams; production uses env config + the real network client. */
  endpoint?: EndpointConfig;
  clientFactory?: (url: string) => ScopedDataClient;
  workflows?: ResolvedWorkflows;
}

export function App({
  endpoint = resolveEndpoint(),
  clientFactory,
  workflows = resolveWorkflows(),
}: AppProps) {
  return (
    <DataSourceProvider endpoint={endpoint} clientFactory={clientFactory}>
      <WorkflowsProvider value={workflows}>
        <AppShell
          config={shellConfig}
          slots={{
            header: <Brand />,
            primaryNav: <CollectionsNav />,
            main: <CollectionMain />,
            inspector: <FacetPanel />,
          }}
        />
      </WorkflowsProvider>
    </DataSourceProvider>
  );
}

import { useDataSource } from '../../data/DataSourceContext';
import { useCollectionUrlState } from './urlState';
import { CollectionTable } from './CollectionTable';
import './collections.css';

/**
 * The `main`-slot content: routes the data-source state to honest panels
 * (unconfigured / connecting / error — ADR-0029) and renders the active
 * collection's table once the source is ready. The active collection comes
 * from the URL (step 0.6), defaulting to the first derived collection.
 */
export function CollectionMain() {
  const state = useDataSource();
  const { collection } = useCollectionUrlState();

  if (state.status === 'unconfigured') {
    return (
      <div className="main-panel" role="status">
        <h1 className="main-panel-title">No data-plane endpoint configured</h1>
        <p className="main-panel-detail">
          Point Aperture at a running Hippo GraphQL endpoint by setting{' '}
          <code>VITE_HIPPO_GRAPHQL_URL</code> (for example{' '}
          <code>VITE_HIPPO_GRAPHQL_URL=http://localhost:8000/graphql npm run dev</code>).
        </p>
      </div>
    );
  }

  if (state.status === 'connecting') {
    return (
      <div className="main-panel" role="status">
        <h1 className="main-panel-title">Connecting…</h1>
        <p className="main-panel-detail">Introspecting the endpoint and negotiating capabilities.</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="main-panel" role="alert">
        <h1 className="main-panel-title">Couldn’t connect to the endpoint</h1>
        <p className="main-panel-detail">{state.message}</p>
      </div>
    );
  }

  const collections = state.source.collections;
  if (collections.length === 0) {
    return (
      <div className="main-panel" role="status">
        <h1 className="main-panel-title">No browsable collections</h1>
        <p className="main-panel-detail">
          The endpoint's schema exposes no list queries to derive collections from.
        </p>
      </div>
    );
  }

  const active = collections.find((c) => c.id === collection) ?? collections[0];
  return <CollectionTable key={active.id} source={state.source} collection={active} />;
}

import { useState } from 'react';
import { AppShell } from './shell/AppShell';
import { Brand } from './shell/Brand';
import { MOCK_COLLECTIONS } from './dev/mockCollections';
import './App.css';

/**
 * Phase 0.1a composition: the portal "config" selects a layout from the
 * registry (trivial with one entry — ADR-0031) and binds content to its
 * slots. primaryNav shows a mock collections list; main is a placeholder.
 * Both bind to live schema-derived data in steps 0.3–0.5.
 */
const shellConfig = { layout: 'headerNavMain' };

export function App() {
  const [activeCollection, setActiveCollection] = useState(MOCK_COLLECTIONS[0].id);

  return (
    <AppShell
      config={shellConfig}
      slots={{
        header: <Brand />,
        primaryNav: (
          <>
            <div className="nav-section-label">Collections</div>
            <div className="nav-list">
              {MOCK_COLLECTIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="nav-item"
                  aria-current={c.id === activeCollection}
                  onClick={() => setActiveCollection(c.id)}
                >
                  <span className="nav-item-chip">{c.initial}</span>
                  <span className="nav-item-label">{c.label}</span>
                </button>
              ))}
            </div>
          </>
        ),
        main: (
          <div className="main-placeholder">
            <p className="app-placeholder">
              Walking skeleton — Phase 0.1a. The schema-derived collection table lands in step 0.5.
            </p>
          </div>
        ),
      }}
    />
  );
}

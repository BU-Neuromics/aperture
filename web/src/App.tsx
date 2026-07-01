import './App.css';

/**
 * Phase 0.1 placeholder shell. The real app frame — a layout registry + typed
 * slot contract (header / primaryNav / main / inspector?) per ADR-0031 — lands
 * in step 0.1a, translated from design/design-export/. For now this proves the
 * React + tokens + build/test spine works end to end.
 */
export function App() {
  return (
    <div className="app-frame">
      <header className="app-header">
        <span className="app-wordmark">Aperture</span>
      </header>
      <main className="app-main">
        <p className="app-placeholder">Walking skeleton — Phase 0.1</p>
      </main>
    </div>
  );
}

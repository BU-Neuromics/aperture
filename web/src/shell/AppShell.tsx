import type { ReactNode } from 'react';
import type { SlotBindings, SlotName } from './slots';
import { getLayout } from './registry';
import './shell.css';

export interface ShellConfig {
  /** Name of a layout in the registry (config selects, never composes chrome). */
  layout: string;
}

interface AppShellProps {
  config: ShellConfig;
  slots: SlotBindings;
}

/**
 * Resolves the configured layout from the registry and binds content to its
 * slots. Degradation is honest (ADR-0029/0031): bindings for slots the layout
 * does not support are dropped and reported in a visible notice — never a
 * broken render, never silently swallowed. An unknown layout name renders an
 * error state instead of guessing.
 */
export function AppShell({ config, slots }: AppShellProps) {
  const layout = getLayout(config.layout);

  if (!layout) {
    return (
      <div className="shell-error" role="alert">
        <strong>Unknown layout “{config.layout}”.</strong> The portal config must select a layout
        from the registry.
      </div>
    );
  }

  const supported: SlotBindings = {};
  const dropped: SlotName[] = [];
  for (const [name, content] of Object.entries(slots) as [SlotName, ReactNode][]) {
    if (content === undefined) continue;
    if (layout.supports.includes(name)) supported[name] = content;
    else dropped.push(name);
  }

  return (
    <>
      {dropped.length > 0 && (
        <div className="shell-degradation-notice" role="status">
          Layout “{layout.name}” does not support: {dropped.join(', ')} — content not shown.
        </div>
      )}
      <layout.Component slots={supported} />
    </>
  );
}

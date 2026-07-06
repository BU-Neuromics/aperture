import { render, screen, within } from '@testing-library/react';
import { App } from './App';

describe('App (Phase 0.1a shell composition)', () => {
  it('renders the Aperture wordmark in the header slot', () => {
    render(<App />);
    expect(within(screen.getByRole('banner')).getByText('Aperture')).toBeInTheDocument();
  });

  it('renders the collections list in the primaryNav slot', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    for (const label of [
      'Donors',
      'Samples',
      'Brain Samples',
      'Datafiles',
      'Datasets',
      'Workflows',
    ]) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
  });

  it('renders a main region', () => {
    render(<App />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});

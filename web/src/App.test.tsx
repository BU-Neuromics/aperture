import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the Aperture wordmark', () => {
    render(<App />);
    expect(screen.getByText('Aperture')).toBeInTheDocument();
  });

  it('renders a main region', () => {
    render(<App />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});

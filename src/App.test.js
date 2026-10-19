import { render, screen } from '@testing-library/react';
import App from './App';

test('zeigt die deutsche Anmeldeseite', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Sketchle' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
});

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

test('signed-out members see sign-in fields without payment actions', () => {
  localStorage.clear();
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><App /></MemoryRouter>);
  expect(screen.getByPlaceholderText('Enter your member number')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Enter your password')).toHaveAttribute('type', 'password');
  expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Deposit via M-Pesa' })).not.toBeInTheDocument();
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShareImageGenerator } from '../ShareImageGenerator';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', role: 'admin' } }),
}));

describe('ShareImageGenerator initial prompt', () => {
  it('opens with a blank image-generation prompt', () => {
    render(<ShareImageGenerator onChange={vi.fn()} onCancel={vi.fn()} />);

    const prompt = screen.getByPlaceholderText(/Jesus welcomes honest seekers/i);
    expect(prompt).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Generate Image' })).toBeDisabled();
  });
});
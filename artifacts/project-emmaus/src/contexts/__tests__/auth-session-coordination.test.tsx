import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return { promise, resolve };
}

function authResponse(id: string) {
  return new Response(JSON.stringify({
    user: {
      id,
      email: `${id}@example.test`,
      preferredName: id,
      role: 'user',
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

let latestAuth: ReturnType<typeof useAuth> | null = null;

function Probe() {
  const auth = useAuth();
  latestAuth = auth;
  return (
    <>
      <output data-testid="subject">{auth.user?.id ?? 'none'}</output>
      <output data-testid="loading">{String(auth.loading)}</output>
    </>
  );
}

beforeEach(() => {
  latestAuth = null;
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthProvider session coordination', () => {
  it('discards a stale hydration response after a newer sign-in wins', async () => {
    const staleAccountA = deferred<Response>();
    let authUserRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/user')) {
        authUserRequests += 1;
        return authUserRequests === 1
          ? staleAccountA.promise
          : Promise.resolve(authResponse('subject-b'));
      }
      if (url.endsWith('/api/auth/login')) {
        return Promise.resolve(new Response('{}', { status: 200 }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await act(async () => {
      await latestAuth!.signIn('b@example.test', 'password');
    });
    expect(screen.getByTestId('subject')).toHaveTextContent('subject-b');

    await act(async () => {
      staleAccountA.resolve(authResponse('subject-a'));
      await Promise.resolve();
    });

    expect(screen.getByTestId('subject')).toHaveTextContent('subject-b');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  it('invalidates visible account state before revalidating a cross-tab change', async () => {
    const accountB = deferred<Response>();
    let authUserRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.endsWith('/api/auth/user')) {
        throw new Error(`Unexpected request: ${url}`);
      }
      authUserRequests += 1;
      return authUserRequests === 1
        ? Promise.resolve(authResponse('subject-a'))
        : accountB.promise;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('subject')).toHaveTextContent('subject-a');
    });

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'emmaus_auth_sync',
        newValue: JSON.stringify({ changedAt: Date.now(), nonce: 'other-tab' }),
      }));
    });

    expect(screen.getByTestId('subject')).toHaveTextContent('none');
    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await act(async () => {
      accountB.resolve(authResponse('subject-b'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('subject')).toHaveTextContent('subject-b');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
  });
});
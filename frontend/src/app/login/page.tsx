'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoginForm } from '../../components/auth/login-form';
import { useAuth } from '../../hooks/use-auth';
import { LoginSchema } from '../../lib/validators/login.schema';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading, loginError, isLoggingIn } =
    useAuth();

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push('/vehicles');
    }
  }, [isAuthenticated, isLoading, router]);

  async function handleLogin(credentials: LoginSchema) {
    try {
      await login(credentials);
    } catch {
      // React Query exposes the error through loginError for the form.
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">PrioraScan</h1>
          <p className="mt-2 text-sm text-gray-600">Sign in to your workshop</p>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <LoginForm
            onSubmit={handleLogin}
            error={loginError}
            isLoading={isLoggingIn}
          />
        </div>
      </div>
    </div>
  );
}

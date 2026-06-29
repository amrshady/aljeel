'use client';

import { Button } from '@aljeel/ui';
import { useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ApiClientError } from '@/lib/api-client';
import { useRouter } from '@/i18n/routing';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default function LoginPage() {
  const t = useTranslations('auth');
  const { login, verifyMfa } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@supplier-a.test');
  const [password, setPassword] = useState('Password1!');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('000000');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await login(email, password);
      setChallengeId(result.challengeId);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('loginError'));
    } finally {
      setLoading(false);
    }
  }

  async function onMfa(e: FormEvent) {
    e.preventDefault();
    if (!challengeId) return;
    setLoading(true);
    setError(null);
    try {
      const me = await verifyMfa(challengeId, code);
      const apRoles = new Set(['AP_CLERK', 'AP_APPROVER']);
      router.replace(apRoles.has(me.role) ? '/ap/review' : '/dashboard');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('mfaError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-md items-center justify-end px-6 py-4">
          <LocaleSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        {!challengeId ? (
          <form onSubmit={onLogin} className="mt-8 space-y-4">
            <div>
              <label className="text-sm font-medium">{t('email')}</label>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('password')}</label>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('loading') : t('login')}
            </Button>
          </form>
        ) : (
          <form onSubmit={onMfa} className="mt-8 space-y-4">
            <p className="text-sm text-muted-foreground">{t('mfaHint')}</p>
            <input
              className="w-full rounded-md border px-3 py-2 tracking-widest"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('loading') : t('verify')}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}

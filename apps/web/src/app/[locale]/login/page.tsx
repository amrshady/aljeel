'use client';

import { Button, cn } from '@aljeel/ui';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ApiClientError } from '@/lib/api-client';
import { useRouter } from '@/i18n/routing';
import { LocaleSwitcher } from '@/components/locale-switcher';

const inputClassName =
  'mt-1.5 w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(210,45%,40%)]/30 focus-visible:border-[hsl(210,45%,40%)]';

export default function LoginPage() {
  const t = useTranslations('auth');
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@supplier-a.test');
  const [password, setPassword] = useState('Password1!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const me = await login(email, password);
      const apRoles = new Set(['AP_CLERK', 'AP_APPROVER']);
      router.replace(apRoles.has(me.role) ? '/ap/review' : '/dashboard');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('loginError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[linear-gradient(160deg,hsl(210,40%,97%)_0%,hsl(0,0%,100%)_45%,hsl(15,55%,97%)_100%)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[hsl(210,45%,40%)]/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-[hsl(15,55%,55%)]/10 blur-3xl"
      />

      <header className="relative z-10 flex justify-end px-6 py-5">
        <LocaleSwitcher />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16 pt-4">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-white/60 bg-white/80 p-8 shadow-[0_20px_60px_-24px_rgba(51,102,153,0.35)] backdrop-blur-sm sm:p-10">
            <div className="flex flex-col items-center text-center">
              <Image
                src="/aljeel-logo.jpeg"
                alt="Aljeel"
                width={180}
                height={72}
                priority
                className="h-14 w-auto object-contain"
              />
              <h1 className="mt-6 text-2xl font-semibold tracking-tight text-[hsl(210,45%,28%)]">
                {t('title')}
              </h1>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                {t('subtitle')}
              </p>
            </div>

            <form onSubmit={onLogin} className="mt-8 space-y-5">
              <div>
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  {t('email')}
                </label>
                <input
                  id="email"
                  className={inputClassName}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  {t('password')}
                </label>
                <input
                  id="password"
                  className={inputClassName}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                className={cn(
                  'w-full bg-[hsl(210,45%,40%)] text-white hover:bg-[hsl(210,45%,34%)]',
                  'shadow-sm shadow-[hsl(210,45%,40%)]/25',
                )}
                disabled={loading}
              >
                {loading ? t('loading') : t('login')}
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth, roleHomePath } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { FormError, TextField } from '../components/FormField';
import { supabase } from '../lib/supabase';

export default function Login() {
  const { session, profile, loading, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  if (!loading && session && profile) {
    const redirectTo =
      profile.status === 'pending' ? '/pending' : roleHomePath(profile.role);
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await signIn(email, password);
    setSubmitting(false);
    if (signInError) setError(signInError);
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('Enter your email above first, then tap "Forgot password".');
      return;
    }
    setError(null);
    await supabase.auth.resetPasswordForEmail(email);
    setResetSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6 py-12 text-ink">
      <div className="w-full max-w-sm">
        <Link to="/" className="font-heading text-xl font-bold text-chilli">
          McCluckin&rsquo;s
        </Link>
        <h1 className="mt-6 font-heading text-2xl font-bold">Log in</h1>
        <p className="mt-1 font-body text-sm text-ink/60">
          Email and password for now &mdash; phone sign-in is coming soon.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <TextField
            id="email"
            label="Email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FormError message={error} />
          {resetSent && (
            <p className="rounded-lg bg-mustard/20 px-3 py-2 text-sm text-ink">
              If that email has an account, a reset link is on its way.
            </p>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </Button>
          <button
            type="button"
            onClick={handleForgotPassword}
            className="font-body text-sm text-ink/60 hover:text-chilli hover:underline"
          >
            Forgot password?
          </button>
        </form>

        <p className="mt-8 font-body text-sm text-ink/60">
          New here?{' '}
          <Link to="/signup" className="font-semibold text-chilli hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

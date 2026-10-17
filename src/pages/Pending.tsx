import { Navigate } from 'react-router-dom';
import { useAuth, roleHomePath } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { PageSpinner } from '../components/PageSpinner';

const STEPS = ['Account created', 'Details submitted', 'In review by McCluckin’s'];

export default function Pending() {
  const { session, profile, loading, signOut } = useAuth();

  if (loading) return <PageSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile && profile.status === 'active') {
    return <Navigate to={roleHomePath(profile.role)} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6 py-12 text-ink">
      <div className="w-full max-w-md text-center">
        <h1 className="font-heading text-2xl font-bold">Awaiting approval</h1>
        <p className="mt-3 font-body text-ink/70">
          {profile
            ? `${profile.full_name.split(' ')[0]}, your account is waiting for approval.`
            : 'Your account is waiting for approval.'}{' '}
          We check every new supplier and driver before giving out jobs. We&rsquo;ll message you
          on WhatsApp once you&rsquo;re approved.
        </p>

        <ol className="mx-auto mt-8 flex max-w-xs flex-col gap-3 text-left">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  index < 2 ? 'bg-chilli text-cream' : 'bg-mustard text-ink'
                }`}
              >
                {index + 1}
              </span>
              <span className="font-body text-sm">{step}</span>
            </li>
          ))}
        </ol>

        <Button variant="secondary" className="mt-8" onClick={() => void signOut()}>
          Log out
        </Button>
      </div>
    </div>
  );
}

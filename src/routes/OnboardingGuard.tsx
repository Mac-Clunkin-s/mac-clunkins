import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, roleHomePath } from '../auth/AuthContext';
import { PageSpinner } from '../components/PageSpinner';
import type { UserRole } from '../lib/types';

/**
 * Like ProtectedRoute but lets `pending` profiles in, because the shared
 * ProtectedRoute bounces them to /pending and they could never reach the
 * Get approved screen. Suspended users are still sent to /login.
 */
export function OnboardingGuard({ role, children }: { role: UserRole; children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <PageSpinner />;
  if (profile.status === 'suspended') return <Navigate to="/login" replace />;
  if (profile.role !== role) return <Navigate to={roleHomePath(profile.role)} replace />;
  return <>{children}</>;
}

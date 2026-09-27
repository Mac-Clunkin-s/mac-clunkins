import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, roleHomePath } from './AuthContext';
import type { UserRole } from '../lib/types';
import { PageSpinner } from '../components/PageSpinner';

export function ProtectedRoute({
  allow,
  children,
}: {
  allow: UserRole[];
  children: ReactNode;
}) {
  const { session, profile, loading } = useAuth();

  if (loading) return <PageSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <PageSpinner label="Loading your account…" />;
  if (profile.status === 'pending') return <Navigate to="/pending" replace />;
  if (profile.status === 'suspended') return <Navigate to="/login" replace />;
  if (!allow.includes(profile.role)) {
    return <Navigate to={roleHomePath(profile.role)} replace />;
  }

  return <>{children}</>;
}

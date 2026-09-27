import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardShell, EmptyState } from '../../components/DashboardShell';
import { PageSpinner } from '../../components/PageSpinner';
import { FormError } from '../../components/FormField';
import { Button } from '../../components/Button';
import { formatStatus } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useSupabaseQuery } from '../../lib/useQuery';
import type { Profile, ProfileStatus } from '../../lib/types';

type StatusFilter = ProfileStatus | 'all';

const TABS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'all', label: 'All' },
];

export default function AdminUsers() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  const { data: users, loading, error } = useSupabaseQuery<Profile[]>(
    () => {
      let query = supabase
        .from('profiles')
        .select('*')
        .neq('role', 'admin')
        .order('created_at', { ascending: false });
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      return query;
    },
    [statusFilter, reloadKey],
  );

  async function setStatus(profileId: string, status: ProfileStatus) {
    setActionError(null);
    setBusyId(profileId);
    const { error: rpcError } = await supabase.rpc('set_profile_status', {
      p_profile_id: profileId,
      p_status: status,
      p_note: null,
    });
    setBusyId(null);
    if (rpcError) {
      setActionError({ id: profileId, message: rpcError.message });
      return;
    }
    setReloadKey((k) => k + 1);
  }

  function reject(profileId: string) {
    if (!window.confirm('Reject this application? The account will be marked suspended.')) return;
    void setStatus(profileId, 'suspended');
  }

  function suspend(profileId: string) {
    if (!window.confirm('Suspend this account? They will lose access immediately.')) return;
    void setStatus(profileId, 'suspended');
  }

  return (
    <DashboardShell roleLabel="Admin">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Users</h1>
          <p className="mt-1 font-body text-sm text-ink/60">
            Approve pending suppliers, drivers and buyers, or suspend an active account.
          </p>
        </div>
        <Link to="/admin" className="font-body text-sm font-semibold text-chilli hover:underline">
          &larr; Dashboard
        </Link>
      </div>

      <div className="mt-6 flex gap-1 border-b border-ink/10">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-2 font-body text-sm font-semibold transition ${
              statusFilter === tab.value
                ? 'border-b-2 border-chilli text-chilli'
                : 'text-ink/50 hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {loading && <PageSpinner label="Loading users…" />}
        {error && <FormError message={`Couldn't load users: ${error.message}`} />}
        {!loading && !error && users && users.length === 0 && (
          <EmptyState
            title="No users here"
            body={
              statusFilter === 'pending'
                ? 'No accounts are waiting for approval right now.'
                : `No ${statusFilter === 'all' ? '' : statusFilter} accounts yet.`
            }
          />
        )}
        {!loading && !error && users && users.length > 0 && (
          <ul className="flex flex-col gap-3">
            {users.map((user) => (
              <li key={user.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-heading font-bold">{user.full_name}</p>
                      <span className="rounded-full bg-mustard/30 px-2 py-0.5 font-body text-xs font-semibold uppercase tracking-wide text-ink/70">
                        {user.role}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-body text-xs font-semibold uppercase tracking-wide ${
                          user.status === 'active'
                            ? 'bg-mustard/30 text-ink/70'
                            : user.status === 'pending'
                              ? 'bg-chilli/10 text-chilli'
                              : 'bg-ink/10 text-ink/60'
                        }`}
                      >
                        {formatStatus(user.status)}
                      </span>
                    </div>
                    <p className="mt-1 font-body text-sm text-ink/60">
                      {user.business_name ?? 'No business name on file'}
                      {user.whatsapp_phone ? ` · ${user.whatsapp_phone}` : ''}
                      {user.email ? ` · ${user.email}` : ''}
                    </p>
                    <p className="mt-1 font-body text-xs text-ink/40">
                      Signed up {new Date(user.created_at).toLocaleDateString('en-ZA')}
                      {user.pdma_number ? ` · PDMA ${user.pdma_number}` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {user.status === 'pending' && (
                      <>
                        <Button
                          variant="primary"
                          disabled={busyId === user.id}
                          onClick={() => void setStatus(user.id, 'active')}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={busyId === user.id}
                          onClick={() => reject(user.id)}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {user.status === 'active' && (
                      <Button
                        variant="secondary"
                        disabled={busyId === user.id}
                        onClick={() => suspend(user.id)}
                      >
                        Suspend
                      </Button>
                    )}
                    {user.status === 'suspended' && (
                      <Button
                        variant="primary"
                        disabled={busyId === user.id}
                        onClick={() => void setStatus(user.id, 'active')}
                      >
                        Reactivate
                      </Button>
                    )}
                  </div>
                </div>
                {actionError?.id === user.id && (
                  <div className="mt-3">
                    <FormError message={`Couldn't update this account: ${actionError.message}`} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardShell>
  );
}

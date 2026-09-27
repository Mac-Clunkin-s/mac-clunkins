import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { AppLanguage, BusinessType, Profile, UserRole } from '../lib/types';

export interface SignUpInput {
  email: string;
  password: string;
  role: Exclude<UserRole, 'admin'>;
  fullName: string;
  businessName?: string;
  businessType?: BusinessType;
  whatsappPhone: string;
  pdmaNumber?: string;
  language?: AppLanguage;
  /** Independent opt-in for marketing messages, default false. Never inferred from
   *  agreeing to the terms/privacy notice — see the consents table. */
  marketingOptIn?: boolean;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  /** True until the initial session + profile lookup resolves. */
  loading: boolean;
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (input: SignUpInput) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile(userId: string) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (cancelled) return;
      if (error) {
        setProfile(null);
        setProfileError(error.message);
      } else {
        setProfile(data);
        setProfileError(null);
      }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      if (!cancelled) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (cancelled) return;
      setSession(next);
      if (next) {
        await loadProfile(next.user.id);
      } else {
        setProfile(null);
        setProfileError(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp(input: SignUpInput) {
    const { error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          role: input.role,
          full_name: input.fullName,
          business_name: input.businessName,
          business_type: input.businessType,
          whatsapp_phone: input.whatsappPhone,
          pdma_number: input.pdmaNumber,
          language: input.language ?? 'en',
          marketing_opt_in: input.marketingOptIn ?? false,
        },
      },
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, profileError, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}

export function roleHomePath(role: UserRole): string {
  switch (role) {
    case 'buyer':
      return '/orders';
    case 'supplier':
      return '/supplier/jobs';
    case 'driver':
      return '/driver/trips';
    case 'admin':
      return '/admin';
  }
}

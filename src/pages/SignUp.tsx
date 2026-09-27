import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { FormError, SelectField, TextField } from '../components/FormField';
import type { BusinessType } from '../lib/types';

type SignUpRole = 'buyer' | 'supplier' | 'driver';

const ROLE_LABEL: Record<SignUpRole, string> = {
  buyer: 'Buyer',
  supplier: 'Supplier',
  driver: 'Driver',
};

const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: 'shisanyama', label: 'Shisanyama' },
  { value: 'kota_shop', label: 'Kota shop' },
  { value: 'tavern', label: 'Tavern' },
  { value: 'caterer', label: 'Caterer' },
  { value: 'butchery', label: 'Butchery' },
  { value: 'spaza', label: 'Spaza shop' },
  { value: 'reseller', label: 'Reseller' },
  { value: 'farm', label: 'Farm' },
  { value: 'transporter', label: 'Transporter' },
  { value: 'other', label: 'Other' },
];

function isSignUpRole(value: string | null): value is SignUpRole {
  return value === 'buyer' || value === 'supplier' || value === 'driver';
}

export default function SignUp() {
  const { signUp } = useAuth();
  const [params] = useSearchParams();
  const initialRole = params.get('role');
  const [role, setRole] = useState<SignUpRole>(isSignUpRole(initialRole) ? initialRole : 'buyer');
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType | ''>('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pdmaNumber, setPdmaNumber] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!acceptedTerms) {
      setError('Please accept the Terms and Refund policy to continue.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: signUpError } = await signUp({
      email,
      password,
      role,
      fullName,
      businessName: businessName || undefined,
      businessType: businessType || undefined,
      whatsappPhone: whatsapp,
      pdmaNumber: role === 'buyer' ? pdmaNumber || undefined : undefined,
    });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-6 py-12 text-ink">
        <div className="w-full max-w-sm text-center">
          <h1 className="font-heading text-2xl font-bold">Check your email</h1>
          <p className="mt-3 font-body text-ink/70">
            Confirm your address, then log in. Your account stays in review until an admin
            approves it.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-block rounded-full bg-chilli px-6 py-2.5 font-body font-semibold text-cream hover:bg-chilli/90"
          >
            Go to log in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6 py-12 text-ink">
      <div className="w-full max-w-md">
        <Link to="/" className="font-heading text-xl font-bold text-chilli">
          McCluckin&rsquo;s
        </Link>
        <h1 className="mt-6 font-heading text-2xl font-bold">Sign up</h1>

        <div className="mt-4 flex gap-2" role="tablist" aria-label="Account type">
          {(Object.keys(ROLE_LABEL) as SignUpRole[]).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={role === option}
              onClick={() => setRole(option)}
              className={`flex-1 rounded-full px-3 py-2 font-body text-sm font-semibold transition ${
                role === option
                  ? 'bg-chilli text-cream'
                  : 'border border-ink/15 bg-white text-ink/70 hover:bg-ink/5'
              }`}
            >
              {ROLE_LABEL[option]}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <TextField
            id="fullName"
            label="Your name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <TextField
            id="businessName"
            label={role === 'buyer' ? 'Business name (optional)' : 'Business name'}
            required={role !== 'buyer'}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
          <SelectField
            id="businessType"
            label={role === 'buyer' ? 'Business type (optional)' : 'Business type'}
            required={role !== 'buyer'}
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value as BusinessType)}
          >
            <option value="" disabled>
              Choose one&hellip;
            </option>
            {BUSINESS_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </SelectField>
          <TextField
            id="whatsapp"
            label="WhatsApp number"
            type="tel"
            placeholder="+27 6XX XXX XXX"
            required
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
          {role === 'buyer' && (
            <TextField
              id="pdmaNumber"
              label="PDMA number (only if you resell more than 5 birds)"
              value={pdmaNumber}
              onChange={(e) => setPdmaNumber(e.target.value)}
            />
          )}
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
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label className="flex items-start gap-2 font-body text-sm text-ink/70">
            <input
              type="checkbox"
              className="mt-1"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
            />
            <span>
              I accept the{' '}
              <Link to="/legal/terms" className="text-chilli hover:underline">
                Terms
              </Link>{' '}
              and{' '}
              <Link to="/legal/refunds" className="text-chilli hover:underline">
                Refund policy
              </Link>
              .
            </span>
          </label>
          <FormError message={error} />
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-8 font-body text-sm text-ink/60">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-chilli hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

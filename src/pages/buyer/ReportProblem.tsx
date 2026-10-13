import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/Button';
import { FormError, SelectField, TextField } from '../../components/FormField';
import { PageSpinner } from '../../components/PageSpinner';
import { createCase, getOrder, uploadCasePhotos } from './api';
import { BuyerLayout, Card } from './components/BuyerLayout';
import { useAsync } from './hooks/useAsync';
import { t } from './i18n-shim';
import {
  CASE_TYPES,
  MAX_PHOTOS,
  NEEDS_BIRD_COUNT,
  validateProblem,
  type ProblemErrors,
} from './lib/problem';
import type { CaseType } from './types';

export default function ReportProblem() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const order = useAsync(() => getOrder(id), [id]);
  const [type, setType] = useState<CaseType | ''>('');
  const [birds, setBirds] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<ProblemErrors>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs = validateProblem({
      type,
      birdsAffected: birds,
      description,
      quantityOrdered: order.data?.quantity ?? Number.MAX_SAFE_INTEGER,
    });
    setErrors(errs);
    if (Object.keys(errs).length > 0 || !type || !profile) return;

    setBusy(true);
    try {
      // Photo upload is best-effort: a storage failure must never block the buyer from raising the case.
      const up = files.length > 0 ? await uploadCasePhotos(profile.id, files) : { paths: [], failed: 0 };
      const created = await createCase({
        orderId: id,
        raisedBy: profile.id,
        type,
        birdsAffected: NEEDS_BIRD_COUNT.includes(type) ? Number(birds) : birds.trim() ? Number(birds) : null,
        description: description.trim(),
        photoPaths: up.paths,
      });
      navigate(`/cases/${created.id}`, { state: { photosFailed: up.failed } });
    } catch {
      setServerError(t('buyer.problem.submitError'));
      setBusy(false);
    }
  }

  const err = (k: keyof ProblemErrors) =>
    errors[k] ? (
      <p role="alert" className="mt-1 text-sm text-chilli">
        {t(errors[k] as string)}
      </p>
    ) : null;

  return (
    <BuyerLayout>
      <h1 className="mb-5 font-heading text-2xl font-bold">{t('buyer.problem.title')}</h1>
      {order.loading && <PageSpinner label={t('buyer.problem.loading')} />}
      {order.data && (
        <Card>
          <p className="mb-4 text-sm text-ink/60">
            {t('buyer.problem.forOrder', { number: order.data.number })}
          </p>
          <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
            <div>
              <SelectField
                id="type"
                label={t('buyer.problem.type')}
                value={type}
                onChange={(e) => setType(e.target.value as CaseType | '')}
              >
                <option value="">{t('buyer.newOrder.choose')}</option>
                {CASE_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {t(`buyer.caseType.${c}`)}
                  </option>
                ))}
              </SelectField>
              {err('type')}
            </div>
            <div>
              <TextField
                id="birds"
                label={t('buyer.problem.birds')}
                inputMode="numeric"
                value={birds}
                onChange={(e) => setBirds(e.target.value)}
              />
              {err('birdsAffected')}
            </div>
            <div>
              <label className="flex flex-col gap-1 text-sm" htmlFor="description">
                <span className="font-medium text-ink/80">{t('buyer.problem.description')}</span>
                <textarea
                  id="description"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-lg border border-ink/15 bg-white px-3 py-2"
                />
              </label>
              {err('description')}
            </div>
            <div>
              <label className="flex flex-col gap-1 text-sm" htmlFor="photos">
                <span className="font-medium text-ink/80">{t('buyer.problem.photos', { max: MAX_PHOTOS })}</span>
                <input
                  id="photos"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS))}
                />
              </label>
              {files.length > 0 && (
                <p className="mt-1 text-xs text-ink/60">{t('buyer.problem.photosChosen', { n: files.length })}</p>
              )}
            </div>
            <FormError message={serverError} />
            <Button type="submit" disabled={busy}>
              {busy ? t('buyer.problem.sending') : t('buyer.problem.submit')}
            </Button>
          </form>
        </Card>
      )}
    </BuyerLayout>
  );
}

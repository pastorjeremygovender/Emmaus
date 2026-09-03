import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, ChevronDown, CircleAlert, Loader2, LockKeyhole, Save, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { BottomNav } from '@/components/BottomNav';
import { MemberHeaderActions } from '@/components/MemberHeaderActions';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMemberProfile,
  updateMemberProfile,
  type IccMembership,
  type MemberProfile,
  type MemberProfilePatch,
} from '@/lib/member-profile-api';

type FormValues = {
  preferredName: string;
  email: string;
  contactNumber: string;
  physicalAddress: string;
  dateOfBirth: string;
  iccMembership: IccMembership | '';
};

type FormErrors = Partial<Record<keyof FormValues, string>>;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const emptyForm: FormValues = {
  preferredName: '',
  email: '',
  contactNumber: '',
  physicalAddress: '',
  dateOfBirth: '',
  iccMembership: '',
};

function toFormValues(profile: MemberProfile): FormValues {
  return {
    preferredName: profile.preferredName ?? '',
    email: profile.email ?? '',
    contactNumber: profile.contactNumber ?? '',
    physicalAddress: profile.physicalAddress ?? '',
    dateOfBirth: profile.dateOfBirth ?? '',
    iccMembership: profile.iccMembership ?? '',
  };
}

function validateForm(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  const preferredName = values.preferredName.trim();
  const contactNumber = values.contactNumber.trim();
  const physicalAddress = values.physicalAddress.trim();

  if (!preferredName) errors.preferredName = 'Please tell us what you would like to be called.';
  if (preferredName.length > 80) errors.preferredName = 'Please keep your preferred name under 80 characters.';
  if (contactNumber && contactNumber.length < 7) {
    errors.contactNumber = 'Please check this number, or leave it blank.';
  } else if (contactNumber.length > 40) {
    errors.contactNumber = 'Please keep your contact number under 40 characters.';
  }
  if (physicalAddress.length > 300) {
    errors.physicalAddress = 'Please keep your address under 300 characters.';
  }
  if (values.dateOfBirth) {
    const [year, month, day] = values.dateOfBirth.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const isRealDate = /^\d{4}-\d{2}-\d{2}$/.test(values.dateOfBirth) &&
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
    if (!isRealDate) {
      errors.dateOfBirth = 'Use the date format shown.';
    } else if (date.getTime() > todayUtc) {
      errors.dateOfBirth = 'Your date of birth cannot be in the future.';
    }
  }

  return errors;
}

function toPatch(values: FormValues): MemberProfilePatch {
  return {
    preferredName: values.preferredName.trim(),
    contactNumber: values.contactNumber.trim() || null,
    physicalAddress: values.physicalAddress.trim() || null,
    dateOfBirth: values.dateOfBirth || null,
    iccMembership: values.iccMembership || null,
  };
}

function FieldMessage({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="mt-2 flex items-start gap-1.5 text-[13px] leading-5 text-destructive" role="alert">
      <CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function FieldLabel({
  htmlFor,
  children,
  optional = false,
}: {
  htmlFor: string;
  children: string;
  optional?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-3 text-[14px] font-semibold text-foreground">
      <span>{children}</span>
      {optional && <span className="text-[11px] font-normal text-muted-foreground">Optional</span>}
    </label>
  );
}

export default function PersonalDetails() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [initialForm, setInitialForm] = useState<FormValues>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loadError, setLoadError] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const loadProfile = useCallback(async () => {
    setLoadError('');
    setProfileLoading(true);
    try {
      const memberProfile = await getMemberProfile();
      const nextForm = toFormValues(memberProfile);
      setProfile(memberProfile);
      setForm(nextForm);
      setInitialForm(nextForm);
      setErrors({});
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'We could not load your personal details.');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.id) void loadProfile();
  }, [loadProfile, user?.id]);

  const updateField = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSaveState('idle');
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const validateAndSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setSaveState('idle');
      return;
    }

    setSaveState('saving');
    try {
      const updated = await updateMemberProfile(toPatch(form));
      const nextForm = toFormValues(updated);
      setProfile(updated);
      setForm(nextForm);
      setInitialForm(nextForm);
      setErrors({});
      setLoadError('');
      setSaveState('saved');
    } catch (error: unknown) {
      setSaveState('error');
      setLoadError(error instanceof Error ? error.message : 'We could not save your details. Please try again.');
    }
  };

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialForm),
    [form, initialForm],
  );

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background px-5 pt-10">
        <div className="mx-auto max-w-[560px] animate-pulse space-y-5">
          <div className="h-5 w-28 rounded bg-muted" />
          <div className="h-10 w-64 rounded bg-muted" />
          <div className="h-4 w-80 max-w-full rounded bg-muted" />
          <div className="h-[520px] rounded-3xl bg-card" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (profileLoading) {
    return (
      <div className="min-h-[100dvh] bg-background px-5 pt-10">
        <div className="mx-auto max-w-[560px] animate-pulse space-y-5">
          <div className="h-5 w-28 rounded bg-muted" />
          <div className="h-10 w-64 rounded bg-muted" />
          <div className="h-4 w-80 max-w-full rounded bg-muted" />
          <div className="h-[520px] rounded-3xl bg-card" />
        </div>
      </div>
    );
  }

  const displayEmail = profile?.email || form.email || user.email;
  const errorMessage = loadError;
  const backToProfile = () => setLocation('/personal');

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <main className="mx-auto max-w-[560px] px-5 pb-10 pt-6 sm:pt-10">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/personal"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-1 text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            data-testid="link-back-to-profile"
          >
            <ArrowLeft size={17} aria-hidden="true" />
            Back to Profile
          </Link>
          <MemberHeaderActions compact />
        </div>

        <header className="mb-7">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Your Emmaus record</p>
          <h1 className="font-serif text-[38px] leading-[1.02] text-foreground sm:text-[44px]">Personal details</h1>
          <p className="mt-4 max-w-[42ch] text-[15px] leading-6 text-muted-foreground">
            Keep the details your church holds about you up to date. This is a private space, just for you.
          </p>
        </header>

        {errorMessage && (
          <div
            className="mb-5 flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3.5 text-[13px] leading-5 text-destructive"
            role="alert"
          >
            <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold">{saveState === 'error' ? 'Your changes were not saved' : 'We could not load your details'}</p>
              <p className="mt-0.5 opacity-90">{errorMessage}</p>
            </div>
            {saveState === 'error' && (
              <button
                type="button"
                onClick={() => setLoadError('')}
                className="min-h-[32px] rounded-lg px-2 text-[12px] font-semibold underline underline-offset-2"
              >
                Dismiss
              </button>
            )}
            {saveState !== 'error' && (
              <button
                type="button"
                onClick={() => void loadProfile()}
                className="min-h-[32px] rounded-lg px-2 text-[12px] font-semibold underline underline-offset-2"
              >
                Try again
              </button>
            )}
          </div>
        )}

        <form onSubmit={validateAndSave} noValidate className="space-y-5">
          <section className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
            <div className="border-b border-border/60 bg-primary/[0.045] px-5 py-5 sm:px-7">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShieldCheck size={18} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold">A little about you</h2>
                  <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                    Your preferred name is the one we will use when we speak with you.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6 px-5 py-6 sm:px-7">
              <div>
                <FieldLabel htmlFor="preferred-name">Preferred name</FieldLabel>
                <input
                  id="preferred-name"
                  name="preferredName"
                  type="text"
                  autoComplete="given-name"
                  value={form.preferredName}
                  onChange={(event) => updateField('preferredName', event.target.value)}
                  onBlur={() => setErrors(validateForm(form))}
                  aria-invalid={Boolean(errors.preferredName)}
                  aria-describedby={errors.preferredName ? 'preferred-name-error' : undefined}
                  className={`mt-2 h-12 w-full rounded-xl border bg-background px-3.5 text-[15px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-primary/20 ${
                    errors.preferredName ? 'border-destructive/70 focus:border-destructive' : 'border-input focus:border-primary'
                  }`}
                  placeholder="What should we call you?"
                />
                {errors.preferredName && <FieldMessage id="preferred-name-error">{errors.preferredName}</FieldMessage>}
              </div>

              <div>
                <FieldLabel htmlFor="member-email">Email address</FieldLabel>
                <div className="relative mt-2">
                  <input
                    id="member-email"
                    name="email"
                    type="email"
                    value={displayEmail}
                    readOnly
                    aria-describedby="email-help"
                    className="h-12 w-full rounded-xl border border-input/70 bg-muted/45 px-3.5 pr-11 text-[15px] text-muted-foreground outline-none"
                  />
                  <LockKeyhole size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/70" aria-hidden="true" />
                </div>
                <p id="email-help" className="mt-2 text-[12px] leading-5 text-muted-foreground">
                  Email is connected to your Emmaus sign-in and cannot be changed here.
                </p>
              </div>

              <div>
                <FieldLabel htmlFor="contact-number" optional>Mobile or contact number</FieldLabel>
                <input
                  id="contact-number"
                  name="contactNumber"
                  type="tel"
                  autoComplete="tel"
                  value={form.contactNumber}
                  onChange={(event) => updateField('contactNumber', event.target.value)}
                  onBlur={() => setErrors(validateForm(form))}
                  aria-invalid={Boolean(errors.contactNumber)}
                  aria-describedby={errors.contactNumber ? 'contact-number-error' : undefined}
                  className={`mt-2 h-12 w-full rounded-xl border bg-background px-3.5 text-[15px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-primary/20 ${
                    errors.contactNumber ? 'border-destructive/70 focus:border-destructive' : 'border-input focus:border-primary'
                  }`}
                  placeholder="For example, 0400 123 456"
                />
                {errors.contactNumber && <FieldMessage id="contact-number-error">{errors.contactNumber}</FieldMessage>}
              </div>

              <div>
                <FieldLabel htmlFor="physical-address" optional>Physical address</FieldLabel>
                <textarea
                  id="physical-address"
                  name="physicalAddress"
                  autoComplete="street-address"
                  value={form.physicalAddress}
                  onChange={(event) => updateField('physicalAddress', event.target.value)}
                  onBlur={() => setErrors(validateForm(form))}
                  aria-invalid={Boolean(errors.physicalAddress)}
                  aria-describedby={errors.physicalAddress ? 'physical-address-error' : undefined}
                  className={`mt-2 min-h-[104px] w-full resize-y rounded-xl border bg-background px-3.5 py-3 text-[15px] leading-6 outline-none transition-colors placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-primary/20 ${
                    errors.physicalAddress ? 'border-destructive/70 focus:border-destructive' : 'border-input focus:border-primary'
                  }`}
                  placeholder="Where do you live?"
                />
                {errors.physicalAddress && <FieldMessage id="physical-address-error">{errors.physicalAddress}</FieldMessage>}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
            <div className="px-5 py-5 sm:px-7">
              <h2 className="text-[16px] font-semibold">A few more details</h2>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                These help your church care for you well. Share only what feels right.
              </p>
            </div>
            <div className="space-y-6 border-t border-border/60 px-5 py-6 sm:px-7">
              <div>
                <FieldLabel htmlFor="date-of-birth" optional>Date of birth</FieldLabel>
                <input
                  id="date-of-birth"
                  name="dateOfBirth"
                  type="date"
                  autoComplete="bday"
                  value={form.dateOfBirth}
                  onChange={(event) => updateField('dateOfBirth', event.target.value)}
                  onBlur={() => setErrors(validateForm(form))}
                  aria-invalid={Boolean(errors.dateOfBirth)}
                  aria-describedby={errors.dateOfBirth ? 'date-of-birth-error' : undefined}
                  className={`mt-2 h-12 w-full rounded-xl border bg-background px-3.5 text-[15px] outline-none transition-colors focus:ring-2 focus:ring-primary/20 ${
                    errors.dateOfBirth ? 'border-destructive/70 focus:border-destructive' : 'border-input focus:border-primary'
                  }`}
                />
                {errors.dateOfBirth && <FieldMessage id="date-of-birth-error">{errors.dateOfBirth}</FieldMessage>}
              </div>

              <fieldset>
                <legend className="text-[14px] font-semibold text-foreground">Are you a member of ICC?</legend>
                <p className="mt-1 text-[12px] leading-5 text-muted-foreground">Choose the answer that best describes you.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {([
                    ['yes', 'Yes'],
                    ['no', 'No'],
                    ['unsure', 'Not sure'],
                  ] as [IccMembership, string][]).map(([value, label]) => (
                    <label
                      key={value}
                      className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-3.5 text-[14px] transition-colors ${
                        form.iccMembership === value
                          ? 'border-primary bg-primary/8 text-primary'
                          : 'border-input bg-background text-foreground hover:border-primary/45'
                      }`}
                    >
                      <input
                        type="radio"
                        name="iccMembership"
                        value={value}
                        checked={form.iccMembership === value}
                        onChange={() => updateField('iccMembership', value)}
                        className="h-4 w-4 accent-[hsl(var(--primary))]"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </section>

          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="order-2 flex items-center gap-2 text-[12px] text-muted-foreground sm:order-1" aria-live="polite">
              {saveState === 'saved' && <><Check size={15} className="text-primary" aria-hidden="true" /> Saved just now</>}
              {saveState === 'saving' && <><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Saving your details</>}
              {saveState === 'idle' && !isDirty && 'Your details are up to date'}
              {saveState === 'idle' && isDirty && 'You have unsaved changes'}
              {saveState === 'error' && 'Please try saving again'}
            </p>
            <div className="order-1 flex gap-2 sm:order-2">
              <Button type="button" variant="ghost" onClick={backToProfile} className="flex-1 sm:flex-none">
                Cancel
              </Button>
              <Button type="submit" disabled={saveState === 'saving' || !isDirty} className="flex-1 gap-2 sm:flex-none">
                {saveState === 'saving' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                Save details
              </Button>
            </div>
          </div>
        </form>

        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-border/60 bg-primary/[0.035] px-4 py-4 text-[12px] leading-5 text-muted-foreground">
          <ChevronDown size={16} className="mt-0.5 rotate-[-90deg] shrink-0 text-primary" aria-hidden="true" />
          <p>Only the church team responsible for your member record can access these details.</p>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
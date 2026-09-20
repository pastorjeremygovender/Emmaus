import { useEffect } from 'react';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';

const deletionEmail = 'pastorjeremygovender@gmail.com';
const deletionSubject = 'Emmaus Account Deletion Request';
const deletionBody = [
  'Hello ICC,',
  '',
  'I request permanent deletion of my Emmaus account and associated personal data.',
  '',
  'Name:',
  'Email address used for Emmaus:',
  '',
  'I understand ICC may need to verify that I own this account before processing the request.',
].join('\n');

const deletionMailto = `mailto:${deletionEmail}?subject=${encodeURIComponent(deletionSubject)}&body=${encodeURIComponent(deletionBody)}`;

export default function AccountDeletion() {
  useEffect(() => {
    const previousTitle = document.title;
    const description = 'Request permanent deletion of an Emmaus account and associated personal data.';
    const existingDescription = document.querySelector('meta[name="description"]');
    const previousDescription = existingDescription?.getAttribute('content');

    document.title = 'Delete Your Emmaus Account';
    existingDescription?.setAttribute('content', description);

    return () => {
      document.title = previousTitle;
      if (existingDescription && previousDescription !== null) {
        existingDescription.setAttribute('content', previousDescription);
      }
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/95">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-6 py-5 sm:px-8">
          <a
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            Back to Emmaus
          </a>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <ShieldCheck size={18} aria-hidden="true" />
            Emmaus
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-12 sm:px-8 sm:py-16">
        <article className="space-y-10">
          <header className="max-w-3xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Isipingo Community Church
            </p>
            <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
              Delete your Emmaus account
            </h1>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground">
              Emmaus is the Christian discipleship application provided by Isipingo Community Church
              (ICC). This page explains how a member can request permanent deletion of their Emmaus
              account and associated personal data.
            </p>
          </header>

          <div className="divide-y divide-border/70 rounded-3xl border border-border/70 bg-card/40 px-6 sm:px-10">
            <section className="space-y-4 py-8 first:pt-8">
              <h2 className="font-serif text-2xl leading-tight tracking-tight">
                How to request deletion
              </h2>
              <p className="text-[15px] leading-7 text-muted-foreground">
                ICC currently processes account-deletion requests securely by email rather than
                allowing an unauthenticated visitor to delete an account directly. Use the button
                below to start a request. It opens an email addressed to the ICC account-support
                contact with the required subject and information.
              </p>
              <a
                href={deletionMailto}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Mail size={17} aria-hidden="true" />
                Email ICC to request deletion
              </a>
              <p className="text-[15px] leading-7 text-muted-foreground">
                You may also email{' '}
                <a
                  className="font-medium text-primary underline underline-offset-4"
                  href={deletionMailto}
                >
                  {deletionEmail}
                </a>{' '}
                with the subject <strong className="font-semibold text-foreground">{deletionSubject}</strong>.
              </p>
            </section>

            <section className="space-y-4 py-8">
              <h2 className="font-serif text-2xl leading-tight tracking-tight">
                Identity verification
              </h2>
              <p className="text-[15px] leading-7 text-muted-foreground">
                To protect members from an unauthorised deletion, ICC will verify that you own the
                Emmaus account before processing the request. Send the request from the email
                address used for Emmaus where possible and include your full name. ICC may ask you
                to confirm account details or complete another secure verification step. Never
                include your password or one-time login code in an email.
              </p>
              <p className="text-[15px] leading-7 text-muted-foreground">
                A request does not delete an account immediately, and this page cannot be used to
                delete another person&apos;s account.
              </p>
            </section>

            <section className="space-y-4 py-8">
              <h2 className="font-serif text-2xl leading-tight tracking-tight">
                What will be deleted
              </h2>
              <p className="text-[15px] leading-7 text-muted-foreground">
                After your request is verified, ICC will permanently delete or de-identify the
                personal data associated with your Emmaus account, including:
              </p>
              <ul className="list-disc space-y-3 pl-5 text-[15px] leading-7 text-muted-foreground">
                <li>Your Emmaus account and authentication profile.</li>
                <li>Personal profile details and account preferences.</li>
                <li>Personal activity such as progress, history, favourites and saved notes.</li>
                <li>Notification settings and device notification information linked to your account.</li>
                <li>Other member-submitted personal content where it is not part of a shared church record.</li>
              </ul>
            </section>

            <section className="space-y-4 py-8">
              <h2 className="font-serif text-2xl leading-tight tracking-tight">
                Information that may be retained
              </h2>
              <p className="text-[15px] leading-7 text-muted-foreground">
                Some information may need to be retained for a limited period where required by
                law, security or fraud-prevention obligations, dispute resolution, or legitimate
                church and administrative record-keeping. Shared Group messages, meeting records or
                other content may remain, or be de-identified, when necessary to preserve the
                context and integrity of a shared record.
              </p>
              <p className="text-[15px] leading-7 text-muted-foreground">
                ICC may retain a minimal record of the deletion request and its outcome to
                demonstrate that the request was handled and to meet legal or security obligations.
                Retained information is not used to restore the deleted account.
              </p>
            </section>

            <section className="space-y-4 py-8">
              <h2 className="font-serif text-2xl leading-tight tracking-tight">
                Processing period
              </h2>
              <p className="text-[15px] leading-7 text-muted-foreground">
                ICC aims to acknowledge a request within 5 business days and complete a verified
                deletion request within 30 calendar days. If a request is complex, requires
                additional verification, or is subject to a lawful retention requirement, ICC will
                explain the delay and the information that must be retained.
              </p>
            </section>

            <section className="space-y-4 py-8 last:pb-8">
              <h2 className="font-serif text-2xl leading-tight tracking-tight">
                Privacy information
              </h2>
              <p className="text-[15px] leading-7 text-muted-foreground">
                For more information about Emmaus data practices, retention and your rights, read
                the{' '}
                <a
                  className="font-medium text-primary underline underline-offset-4"
                  href="/privacy-policy"
                >
                  Emmaus Privacy Policy
                </a>
                .
              </p>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
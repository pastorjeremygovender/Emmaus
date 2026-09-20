import { useEffect } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

const sections = [
  {
    title: 'Information we collect',
    paragraphs: [
      'Depending on which Emmaus features you use, we may collect:',
    ],
    bullets: [
      'Account information, including your name, surname, email address, telephone number, date of birth, physical address and church-membership information.',
      'Authentication information required to create and secure your account.',
      'Discipleship activity, including Daily Rhythm activity, Walks and Journeys opened or completed, Bible activity, devotional progress and other engagement within Emmaus.',
      'Content you submit, including profile information, notes, messages, voice notes, images, documents and other material shared through Groups or related features.',
      'Group and meeting information, including membership, participation and messages.',
      'Notification preferences and device notification tokens.',
      'Technical information required for security, troubleshooting and operation, such as device type, operating system, app version, IP address, error information and diagnostic logs.',
      'Camera and microphone access when you choose to use video, audio, voice-note, image-upload or related features.',
      'Location information only when you expressly enable a location-based feature such as Welcome Assist or attendance check-in.',
      'Bluetooth access only when you expressly enable a feature that requires nearby-device detection.',
    ],
    after: 'Emmaus does not continuously track users’ movements or sell precise location information.',
  },
  {
    title: 'How we use information',
    paragraphs: ['We use information to:'],
    bullets: [
      'Create, secure and maintain user accounts.',
      'Provide Daily Rhythm content, devotionals, the Bible, Walks, Journeys, Groups and other Emmaus features.',
      'Save progress and show relevant content.',
      'Support group communication, audio and video meetings.',
      'Send notifications selected by the user.',
      'Provide optional attendance, Welcome Assist or pastoral-care functionality.',
      'Respond to support requests.',
      'Maintain security, prevent misuse, diagnose errors and improve reliability.',
      'Comply with applicable legal obligations.',
    ],
    after: 'Pastoral information is intended to support appropriate care and discipleship. It should not be used to shame, rank or publicly expose individuals.',
  },
  {
    title: 'Permissions',
    paragraphs: [
      'Emmaus may request device permissions for notifications, camera, microphone, location or Bluetooth. Permissions are requested only where required by a feature and can be refused or withdrawn through the device’s settings.',
      'Some features may not work if the corresponding permission is disabled.',
    ],
  },
  {
    title: 'Sharing of information',
    paragraphs: ['We do not sell or rent personal information.', 'Information may be shared:'],
    bullets: [
      'With authorised ICC pastors, leaders or administrators where necessary for administration, pastoral care or Group management.',
      'With other members of a Group when you deliberately post or share content in that Group.',
      'With trusted technology providers that host, secure or operate Emmaus, solely as necessary to provide their services.',
      'Where required by law, legal process or to protect users, ICC or the public.',
    ],
  },
  {
    title: 'Data storage and security',
    paragraphs: [
      'We use reasonable administrative and technical safeguards designed to protect personal information against unauthorised access, loss, alteration or disclosure.',
      'No internet service can guarantee absolute security. Users should protect their login details and avoid sharing highly sensitive information through Group messages or other shared areas.',
    ],
  },
  {
    title: 'Data retention',
    paragraphs: [
      'We retain personal information only for as long as reasonably necessary to provide Emmaus, meet pastoral and administrative requirements, resolve disputes, maintain security and comply with legal obligations.',
      'Group content or records may remain where required to preserve legitimate church or administrative records, subject to applicable law.',
    ],
  },
  {
    title: 'Account and data deletion',
    paragraphs: [
      'Users may request deletion of their Emmaus account and associated personal information by emailing:',
    ],
    email: 'pastorjeremygovender@gmail.com',
    after: 'Please use the subject: Emmaus Account Deletion Request.',
    additional: [
      'We may need to verify the requester’s identity. Information may be retained where required by law, security obligations or legitimate record-keeping requirements.',
      'A public account-deletion request page may also be provided within Emmaus or on the Emmaus website.',
    ],
  },
  {
    title: 'Children',
    paragraphs: [
      'Emmaus is not directed at children under 13. A parent or legal guardian should supervise the use of Emmaus by a minor where required by law.',
    ],
  },
  {
    title: 'Third-party services and links',
    paragraphs: [
      'Emmaus may use or link to third-party services for hosting, authentication, notifications, media, communications or other functionality. Those services may process limited information under their own terms and privacy policies.',
      'Links to external websites are not controlled by ICC.',
    ],
  },
  {
    title: 'User rights',
    paragraphs: [
      'Subject to applicable law, including South Africa’s Protection of Personal Information Act (POPIA), users may request:',
    ],
    bullets: [
      'Access to their personal information.',
      'Correction of inaccurate information.',
      'Deletion of eligible information.',
      'Withdrawal of consent for optional processing.',
      'Information about how their data is being used.',
    ],
    after: 'Requests can be sent to the contact address below.',
  },
  {
    title: 'Changes to this policy',
    paragraphs: [
      'We may update this Privacy Policy when Emmaus features, legal requirements or data practices change. The effective date displayed above will be updated when material changes are made.',
    ],
  },
];

export default function PrivacyPolicy() {
  useEffect(() => {
    const previousTitle = document.title;
    const description = 'Emmaus Privacy Policy — how Isipingo Community Church collects, uses and protects personal information.';
    const existingDescription = document.querySelector('meta[name="description"]');
    const previousDescription = existingDescription?.getAttribute('content');

    document.title = 'Emmaus Privacy Policy';
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
              Emmaus Privacy Policy
            </h1>
            <p className="text-sm font-medium text-muted-foreground">
              Effective date: 14 September 2026
            </p>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground">
              Emmaus is a Christian discipleship application provided by Isipingo Community Church (“ICC”, “we”, “us” or “our”). This Privacy Policy explains what information Emmaus collects, why it is used, how it is protected, and the choices available to users.
            </p>
          </header>

          <div className="divide-y divide-border/70 rounded-3xl border border-border/70 bg-card/40 px-6 sm:px-10">
            {sections.map(section => (
              <section key={section.title} className="space-y-4 py-8 first:pt-8 last:pb-8">
                <h2 className="font-serif text-2xl leading-tight tracking-tight">
                  {section.title}
                </h2>
                {section.paragraphs?.map(paragraph => (
                  <p key={paragraph} className="text-[15px] leading-7 text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="list-disc space-y-3 pl-5 text-[15px] leading-7 text-muted-foreground">
                    {section.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}
                  </ul>
                )}
                {section.email && (
                  <p>
                    <a
                      className="font-medium text-primary underline underline-offset-4"
                      href={`mailto:${section.email}`}
                    >
                      {section.email}
                    </a>
                  </p>
                )}
                {section.after && (
                  <p className="text-[15px] leading-7 text-muted-foreground">{section.after}</p>
                )}
                {section.additional?.map(paragraph => (
                  <p key={paragraph} className="text-[15px] leading-7 text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}

            <section className="space-y-4 py-8">
              <h2 className="font-serif text-2xl leading-tight tracking-tight">Contact</h2>
              <p className="text-[15px] leading-7 text-muted-foreground">
                For privacy questions, account-deletion requests or concerns about personal information, contact:
              </p>
              <address className="not-italic text-[15px] leading-7 text-muted-foreground">
                <strong className="font-semibold text-foreground">Isipingo Community Church</strong>
                <br />
                Email:{' '}
                <a
                  className="font-medium text-primary underline underline-offset-4"
                  href="mailto:pastorjeremygovender@gmail.com"
                >
                  pastorjeremygovender@gmail.com
                </a>
                <br />
                Website:{' '}
                <a
                  className="font-medium text-primary underline underline-offset-4"
                  href="https://www.emmaus.co.za"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  https://www.emmaus.co.za
                </a>
              </address>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
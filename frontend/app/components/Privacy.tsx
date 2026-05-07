import { LegalLayout } from "./shared/LegalLayout";

// IMPORTANT: This is a working draft. Before submitting for Google App
// Verification, review every section, replace the placeholder contact
// address, and have it reviewed by someone qualified if the app starts
// holding meaningful user data.

export function Privacy() {
  return (
    <LegalLayout title="Privacy policy" lastUpdated="May 7, 2026">
      <p>
        StudySprint (the "Service") is a study tracker that lets you log focus
        sessions, set goals, and optionally connect Google Calendar to keep your
        sessions in sync. This page explains what data we collect, what we do
        with it, and how to delete it.
      </p>

      <h2>What we collect</h2>

      <h3>Account data</h3>
      <ul>
        <li>
          <strong>Email address</strong> — required to create an account, used
          for sign-in and account recovery.
        </li>
        <li>
          <strong>Username, display name, bio</strong> — optional, only set if
          you choose to make your profile public.
        </li>
        <li>
          <strong>Authentication tokens</strong> — managed by Supabase Auth.
          We never see or store your password directly; sign-ins via Google
          OAuth never expose your Google credentials to us.
        </li>
      </ul>

      <h3>Activity data</h3>
      <ul>
        <li>
          <strong>Study goals</strong> — title, description, target hours,
          target date, subjects you assign.
        </li>
        <li>
          <strong>Study sessions</strong> — duration, optional notes, an
          optional 1-5 quality rating, the timestamp at which you logged the
          session.
        </li>
        <li>
          <strong>Subject tags</strong> — short text labels (e.g. "Calculus")
          that you attach to goals. These are stored in a shared table; the
          name itself is global, but no other user can see which goals are
          yours unless your profile is public.
        </li>
      </ul>

      <h3>Google Calendar integration (optional)</h3>
      <p>
        If you choose to connect Google Calendar via the Connect Calendar
        button, we store:
      </p>
      <ul>
        <li>
          A Google access token and refresh token, scoped to{" "}
          <code>https://www.googleapis.com/auth/calendar.events</code> only.
          These let the Service create, read, update, and delete calendar
          events on your behalf when you explicitly use a related feature
          (e.g. "Export this session to Calendar").
        </li>
        <li>
          The Calendar event IDs created or imported by the Service, so we can
          keep StudySprint sessions in sync with their Calendar counterparts.
        </li>
      </ul>
      <p>
        You can disconnect Google Calendar at any time from the Dashboard,
        which deletes the stored tokens and unlinks any imported events.
        Revoking the grant directly at{" "}
        <a href="https://myaccount.google.com/permissions">
          myaccount.google.com/permissions
        </a>{" "}
        has the same effect.
      </p>

      <h3>Limited Use disclosure (Google API Services)</h3>
      <p>
        StudySprint's use of information received from Google APIs adheres to
        the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy#limited-use">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Specifically:
      </p>
      <ul>
        <li>
          <strong>We only use Google Calendar data to provide in-app features
          you initiated</strong> — exporting sessions, importing events,
          listing upcoming events. Nothing happens in the background without
          your action.
        </li>
        <li>
          <strong>We do not transfer Google user data to third parties</strong>{" "}
          except as needed to provide the Service (e.g. storing tokens in our
          Supabase backend so the Service can call Calendar on your behalf).
          We do not sell, share, or trade it.
        </li>
        <li>
          <strong>We do not use Google user data for advertising</strong>, ad
          targeting, or any model training of any kind.
        </li>
        <li>
          <strong>We do not allow humans to read Google user data</strong>,
          except (1) with your explicit consent, (2) for security purposes
          such as investigating abuse, (3) to comply with applicable law, or
          (4) where the data is aggregated and used for internal operations
          in line with this policy.
        </li>
      </ul>

      <h2>What we don't collect</h2>
      <ul>
        <li>We don't track you across other sites.</li>
        <li>We don't run advertising or share data with ad networks.</li>
        <li>We don't sell your data to anyone.</li>
        <li>
          We don't read the body of your Google Calendar events unless you
          explicitly use the import flow on a specific event.
        </li>
      </ul>

      <h2>Where your data lives</h2>
      <p>
        StudySprint stores all account, activity, and integration data in a
        managed{" "}
        <a href="https://supabase.com">Supabase</a> project (PostgreSQL,
        hosted in <code>us-west-1</code>). Supabase processes data according
        to its own{" "}
        <a href="https://supabase.com/privacy">privacy policy</a>.
      </p>
      <p>The application frontend is hosted on Vercel; static asset requests
        are subject to{" "}
        <a href="https://vercel.com/legal/privacy-policy">Vercel's privacy policy</a>.
      </p>
      <p>
        When you use the syllabus parser, the syllabus text you submit is
        forwarded to{" "}
        <a href="https://openrouter.ai">OpenRouter</a> (an LLM gateway) which
        in turn forwards it to one of several free-tier model providers.
        Submitted text may be retained by those providers per their respective
        terms; please don't submit syllabi containing private personal data.
      </p>

      <h2>Cookies and local storage</h2>
      <p>
        We use{" "}
        <code>localStorage</code> and a Supabase session cookie to keep you
        signed in across page loads. We do not use third-party tracking cookies
        or analytics scripts.
      </p>

      <h2>How to delete your data</h2>
      <p>You can:</p>
      <ul>
        <li>
          <strong>Reset your account</strong> from the in-app settings menu —
          this wipes your goals, sessions, and Google Calendar tokens, and
          reinstalls the starter goals.
        </li>
        <li>
          <strong>Delete your account entirely</strong> by emailing the
          contact below. This removes everything: profile, goals, sessions,
          tokens, audit history.
        </li>
      </ul>
      <p>
        Account deletions are processed within 30 days. Backups containing
        your data may persist for up to 90 days after deletion before being
        purged.
      </p>

      <h2>Children</h2>
      <p>
        StudySprint is not directed at children under 13. If you are under 13,
        please don't create an account. If we learn that we've collected data
        from a child under 13 without parental consent, we'll delete it.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If this policy materially changes, we'll update the "Last updated"
        date at the top and, for active accounts, send a notice via email. By
        continuing to use the Service after such a change, you accept the
        revised policy.
      </p>

      <h2>Contact</h2>
      <p>
        Questions, deletion requests, or data-access requests:{" "}
        <a href="mailto:vaughanolayinka@gmail.com">vaughanolayinka@gmail.com</a>
        .
      </p>
    </LegalLayout>
  );
}

import { LegalLayout } from "./shared/LegalLayout";

// IMPORTANT: This is a working draft. Replace the placeholder contact
// address and governing-law jurisdiction before deploying. Have a lawyer
// review if the project ever takes payments or holds meaningful user data.

export function Terms() {
  return (
    <LegalLayout title="Terms of service" lastUpdated="May 7, 2026">
      <p>
        These Terms of Service ("Terms") govern your access to and use of
        StudySprint (the "Service"). By creating an account or using the
        Service you agree to these Terms. If you don't agree, don't use the
        Service.
      </p>

      <h2>What StudySprint is</h2>
      <p>
        StudySprint is a personal project — a study tracker that lets you log
        focus sessions, set goals, watch a virtual garden grow as you study,
        and (optionally) sync with Google Calendar. It's offered free of
        charge, with no warranties, and is not a commercial product.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You're responsible for everything that happens under your account.</li>
        <li>Don't share your credentials with anyone.</li>
        <li>
          Don't impersonate someone else or sign up using someone else's email
          without permission.
        </li>
        <li>One person, one account.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service to break any law or anyone else's rights.</li>
        <li>
          Submit content that's harassing, defamatory, sexually explicit
          involving minors, or that infringes on intellectual property you
          don't own.
        </li>
        <li>
          Try to extract data you weren't given access to — including probing
          for vulnerabilities, scraping other users' data, or attempting to
          bypass row-level security.
        </li>
        <li>
          Use the syllabus parser to process content you don't have the right
          to share with third-party LLM providers (your syllabus is forwarded
          to OpenRouter; see our{" "}
          <a href="/privacy">privacy policy</a> for details).
        </li>
        <li>
          Generate disproportionate load on the Service (e.g. automated
          scripts firing many requests per second).
        </li>
      </ul>
      <p>
        If you violate these rules we may suspend or delete your account
        without notice.
      </p>

      <h2>Your content</h2>
      <p>
        You retain ownership of everything you submit (goals, sessions,
        notes, syllabus text, profile copy). By submitting it you grant
        StudySprint a non-exclusive license to store and process it for the
        sole purpose of providing the Service to you. We don't claim
        ownership and we don't relicense your content to anyone else.
      </p>

      <h2>Third-party services</h2>
      <p>
        Parts of the Service depend on third-party providers — Supabase
        (database + auth), Vercel (hosting), Google (Calendar API and OAuth),
        and OpenRouter (syllabus parsing LLM gateway). Their terms and
        privacy policies apply when you use the corresponding features. The
        Service can stop working at any time if any of these dependencies
        change or become unavailable, and we're not liable for those outages.
      </p>

      <h2>Disclaimer of warranties</h2>
      <p>
        The Service is provided <strong>"as is"</strong> and{" "}
        <strong>"as available"</strong>, with no warranties of any kind —
        express, implied, or statutory. We don't guarantee the Service will
        be uninterrupted, error-free, secure, or that data will never be
        lost. We don't warrant that any analytics, streaks, gamification
        rewards, or "garden growth" calculations are correct.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, StudySprint and its
        contributors will not be liable for any indirect, incidental,
        consequential, special, exemplary, or punitive damages arising out of
        or related to your use of the Service. Total cumulative liability
        for any direct damages is capped at $0 (the amount you've paid for
        the Service).
      </p>

      <h2>Termination</h2>
      <p>
        You can stop using the Service at any time. We can suspend or
        terminate your access at any time, with or without notice, especially
        if you violate these Terms. On termination, your right to use the
        Service ends immediately. Sections of these Terms that by their
        nature should survive termination (your content license to us for
        anything still stored, disclaimers, liability limits) will survive.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms occasionally. If a change is material we'll
        update the "Last updated" date and, for active accounts, notify you
        via email. Continued use after a change means you accept the new
        Terms.
      </p>

      <h2>Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of Connecticut,
        USA, without regard to conflicts-of-law principles. Disputes will be
        resolved in the state or federal courts located in Connecticut, and
        you consent to the personal jurisdiction of those courts.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms:{" "}
        <a href="mailto:vaughanolayinka@gmail.com">vaughanolayinka@gmail.com</a>
        .
      </p>
    </LegalLayout>
  );
}

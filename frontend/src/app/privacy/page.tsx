export default function Privacy() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-4xl font-[var(--font-playfair)] mb-8">Privacy Policy</h1>
        
        <div className="prose">
          <p>
            This Privacy Policy describes how File Renamer AI (&quot;the Service&quot;, &quot;we&quot;, &quot;us&quot;) collects, uses,
            and protects information when you access our website and application at filerenamerai.com.
          </p>

          <h2>1) Data We Access</h2>
          <p>We minimize data collection and only access what is necessary to provide the Service:</p>
          <ul>
            <li><strong>Google user data (OAuth):</strong> basic profile information (user ID, email) for sign‑in via Supabase. We do not request or access Google Drive files.</li>
            <li><strong>Uploaded content:</strong> images you voluntarily upload for renaming.</li>
            <li><strong>Service metadata:</strong> logs, timestamps, IP address, and device/browser information used for security and reliability.</li>
            <li><strong>Billing data:</strong> limited information from Stripe (e.g., customer ID, email, subscription status) to manage subscriptions and credits. Card details are never stored by us.</li>
          </ul>

          <h2>2) How We Use Data</h2>
          <ul>
            <li><strong>Authentication:</strong> to sign you in with Google OAuth via Supabase and secure your session.</li>
            <li><strong>Providing the Service:</strong> to process your uploaded images with our vision‑language model and return suggested filenames.</li>
            <li><strong>Credits & billing:</strong> to maintain an account profile (email, credits balance) and apply subscription top‑ups from Stripe webhooks.</li>
            <li><strong>Security & operations:</strong> to detect abuse, debug issues, and improve reliability.</li>
          </ul>

          <h2>3) Data Sharing</h2>
          <p>We do not sell personal information. We share data only with service providers acting as processors:</p>
          <ul>
            <li><strong>Supabase</strong> (authentication and database for profiles/credits)</li>
            <li><strong>AWS</strong> (S3 for temporary file storage and results; SQS for job queueing)</li>
            <li><strong>Stripe</strong> (payments and subscription management)</li>
          </ul>
          <p>These providers process data under their terms and security controls. We do not grant them permission to use your data for their own marketing purposes.</p>

          <h2>4) Storage & Protection</h2>
          <ul>
            <li><strong>Uploaded images:</strong> stored temporarily in private S3 buckets to run the rename job, then written results (e.g., a JSONL manifest) to S3. All transfers use TLS; S3 data is encrypted at rest by AWS.</li>
            <li><strong>Google OAuth:</strong> handled by Supabase; we do not store your Google OAuth client secrets in the browser or persist Google access tokens on our servers beyond what Supabase manages for session handling.</li>
            <li><strong>Access control:</strong> API endpoints are protected by server‑side keys; the frontend uses a server proxy to avoid exposing secrets.</li>
          </ul>

          <h2>5) Retention & Deletion</h2>
          <ul>
            <li><strong>Uploaded images:</strong> retained only as long as necessary to complete processing and deliver results; we aim to keep these artifacts short‑lived.</li>
            <li><strong>Results manifest:</strong> stored to S3 so you can fetch job results; you may request deletion at any time.</li>
            <li><strong>Account profile (email, credits):</strong> retained while your account remains active to provide the Service.</li>
          </ul>
          <p>Deletion requests: email <a href="mailto:privacy@filerenamerai.com">privacy@filerenamerai.com</a> from your account email. Upon verification, we will delete associated stored data (profile/credits and any remaining job artifacts) unless we are required to retain it for legal, security, or billing purposes.</p>

          <h2>6) Your Choices & Controls</h2>
          <ul>
            <li><strong>Revoke Google access:</strong> you can revoke access at any time from your Google Account permissions.</li>
            <li><strong>Sign out:</strong> you may sign out from the app to end your session.</li>
            <li><strong>Data deletion:</strong> contact us to delete stored data as described above.</li>
          </ul>

          <h2>7) Children’s Privacy</h2>
          <p>The Service is not intended for children under 13, and we do not knowingly collect information from children.</p>

          <h2>8) Changes to this Policy</h2>
          <p>We may update this policy from time to time. If changes are material, we will provide notice in the app or by email.</p>

          <h2>9) Contact</h2>
          <p>Questions or requests: <a href="mailto:privacy@filerenamerai.com">privacy@filerenamerai.com</a></p>

          <p className="text-sm text-gray-500 mt-8">Last updated: {new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  )
}

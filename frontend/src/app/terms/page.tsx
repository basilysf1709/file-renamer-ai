export default function Terms() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-4xl font-[var(--font-playfair)] mb-8">Terms of Service</h1>
        
        <div className="prose">
          <h2>1. Acceptance of Terms</h2>
          <p>By accessing and using renamedriveimages.work (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service.</p>

          <h2>2. Google Drive Access</h2>
          <p>The Service requires access to your Google Drive to function. We only access files you explicitly select through the Google Drive picker. We do not store your files; we only process them temporarily for renaming purposes.</p>

          <h2>3. AI Renaming Service</h2>
          <p>Our AI-powered renaming feature uses Google&apos;s Gemini API to suggest descriptive filenames. While we strive for accuracy, we cannot guarantee the appropriateness of suggested names. You maintain full control over accepting or rejecting suggestions.</p>

          <h2>4. Data Usage</h2>
          <p>We process your files solely to provide the renaming service. We do not store, share, or use your data for any other purpose. All processing is temporary and happens only when you explicitly request it.</p>

          <h2>5. User Responsibilities</h2>
          <p>You are responsible for:</p>
          <ul>
            <li>Maintaining the security of your Google account</li>
            <li>Reviewing suggested filenames before accepting them</li>
            <li>Ensuring you have the right to rename the files you select</li>
          </ul>

          <h2>6. Service Limitations</h2>
          <p>The Service is provided &ldquo;as is&rdquo; without warranties. We may experience downtime, errors, or limitations. We reserve the right to modify or discontinue the service at any time.</p>

          <h2>7. Changes to Terms</h2>
          <p>We may update these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.</p>

          <h2>8. Contact</h2>
          <p>For questions about these terms, contact us at support@renamedriveimages.work</p>

          <p className="text-sm text-gray-500 mt-8">Last updated: September 22, 2025</p>
        </div>
      </div>
    </div>
  )
}

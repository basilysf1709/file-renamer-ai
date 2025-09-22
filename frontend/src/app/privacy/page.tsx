export default function Privacy() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-4xl font-[var(--font-playfair)] mb-8">Privacy Policy</h1>
        
        <div className="prose">
          <h2>1. Information We Access</h2>
          <p>When you use renamedriveimages.work (&ldquo;the Service&rdquo;), we access:</p>
          <ul>
            <li>Your Google Drive files that you explicitly select via the picker</li>
            <li>Basic Google account information for authentication</li>
          </ul>

          <h2>2. How We Use Information</h2>
          <p>We use your information solely to:</p>
          <ul>
            <li>Process selected images for AI-powered filename suggestions</li>
            <li>Authenticate your access to the service</li>
            <li>Maintain and improve the service</li>
          </ul>

          <h2>3. Data Storage</h2>
          <p>We do not store your files or images. Files are processed in memory only when you request renaming suggestions. We do not maintain any database of user files or suggestions.</p>

          <h2>4. Third-Party Services</h2>
          <p>We use the following third-party services:</p>
          <ul>
            <li>Google Drive API for file access</li>
            <li>Google Gemini API for AI-powered naming suggestions</li>
          </ul>

          <h2>5. Data Security</h2>
          <p>We implement security measures to protect your data during processing. All file access is temporary and happens over secure connections. We never store your files or Google credentials.</p>

          <h2>6. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Know what data we access</li>
            <li>Revoke access to your Google Drive</li>
            <li>Request information about our data practices</li>
          </ul>

          <h2>7. Changes to Privacy Policy</h2>
          <p>We may update this policy. We will notify users of material changes via the service.</p>

          <h2>8. Contact</h2>
          <p>For privacy questions, contact us at privacy@renamedriveimages.work</p>

          <p className="text-sm text-gray-500 mt-8">Last updated: September 22, 2025</p>
        </div>
      </div>
    </div>
  )
}

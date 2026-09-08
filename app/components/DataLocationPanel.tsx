export default function DataLocationPanel({ signedIn, diaryLocked }: { signedIn: boolean; diaryLocked: boolean }) {
  return <article className="settings-card settings-wide data-location-panel">
    <p className="eyebrow">WHERE YOUR DATA LIVES</p><h2>Your storage and privacy at a glance</h2>
    <dl>
      <div><dt>On this device</dt><dd>An offline browser copy of tasks, preferences, and any unlocked diary data.</dd></div>
      <div><dt>Account sync</dt><dd>{signedIn ? "A second copy follows your signed-in account across devices." : "Off until you sign in; this device is currently the only working copy."}</dd></div>
      <div><dt>Diary</dt><dd>{diaryLocked ? "Encrypted with your passphrase before storage or sync." : "Readable on this device and in the account copy. Turn on Diary lock for encryption."}</dd></div>
      <div><dt>Shared links</dt><dd>Only chosen professional tasks. Personal work, diary pages, and attachments are excluded.</dd></div>
    </dl>
    <p>Tasks are protected by account access but are not end-to-end encrypted. Never store passwords, tokens, private keys, or credentials here.</p>
  </article>;
}

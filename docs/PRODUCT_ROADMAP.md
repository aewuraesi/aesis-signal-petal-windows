# Signal Petal product roadmap

This roadmap turns the current improvement list into release-sized work. A checked item is implemented in the codebase, not merely designed.

## Release A — organise and recover work

- [x] Store projects, services, tags, parent tasks, dependencies, and daily recurrence without breaking older backups.
- [x] Carry project, service, and tag columns through spreadsheet import and export.
- [x] Add project, service, and tag editors to task creation and task details.
- [x] Add parent/subtask and dependency pickers with blocked-by warnings.
- [x] Add relationship-aware deletion behaviour.
- [x] Add saved queue views and dashboard card visibility preferences.
- [x] Add drag-and-drop dashboard card ordering.
- [x] Add custom “every N days/weeks/months/years” recurrence controls.
- [x] Add seven rolling daily recovery points and restore controls, alongside downloaded backup reminders.

## Release B — privacy and focus

- [x] Explain local, synced, locked, and shared data accurately in the README.
- [x] Put the same plain-language data-location panel inside Settings.
- [x] Allow Diary to be disabled and removed from navigation, review, calendar, and insights.
- [x] Add optional AES-GCM encryption for the complete synced workspace with a portable recovery key.
- [ ] Split the dashboard, calendar, insights, diary, review, settings, and modal flows out of `app/page.tsx`.

## Release C — files, reminders, and connections

- [x] Move attachments out of localStorage into IndexedDB and accept resized images, PDFs, logs, text, CSV, JSON, Markdown, and DOCX files.
- [x] Include IndexedDB attachment binaries in downloaded backups and restore them before task data.
- [x] Add a provider-neutral local notification outbox with queued, delivered, and failed states.
- [ ] Connect email and web push delivery (requires choosing and configuring external providers).
- [x] Add standards-based calendar export for Google Calendar, Outlook, and Apple Calendar.
- [ ] Add calendar import, followed by GitHub, Jira, PagerDuty, and Slack or Teams adapters.
- [ ] Keep every external write opt-in, previewed, and recorded in the task timeline.

## Release D — desktop delivery

- [x] Add unsigned macOS and Windows development packaging around the existing built app.
- [x] Add desktop package-input smoke tests.
- [ ] Add signed installers, automatic updates, and installer migration tests (requires signing credentials and release hosting).
- [ ] Keep the installable web version for phones and managed environments.

Desktop packaging will use a thin native shell around the existing app rather than maintain a second product. Signing and public distribution will require the owner's Apple Developer and Windows signing credentials; development builds can be produced without them.

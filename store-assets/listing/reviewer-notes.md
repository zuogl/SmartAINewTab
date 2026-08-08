# Suggested reviewer notes

SmartAINewTab replaces Chrome's new tab page with a local-first workspace for the user's own Chrome
bookmarks.

## Test without an account or API key

1. Install the extension and open a new tab.
2. Existing Chrome bookmarks appear in the visual workspace.
3. Use the search box in Bookmarks mode to search bookmark titles and URLs locally.
4. Drag a bookmark or category; this changes the extension's sidecar layout, not Chrome's native
   bookmark folders.
5. Open Settings → Backup to export and restore a local JSON backup.
6. Open Settings → Bookmark health to inspect the available checks. Any destructive or URL-changing
   batch action requires a preview and confirmation.

## Optional permissions

Website access is not granted at install time. The extension requests it only after a user starts a
feature that needs network access. Declining the request leaves the new tab page, bookmark display,
drag-and-drop, local search, and local backup usable.

## Optional AI

AI features are BYOK. The user chooses a provider, endpoint, model, and API key. The API key is stored
in the extension's local storage and is excluded from JSON exports and encrypted cloud backups.
Provider responses are validated as data and are never executed as code.

## Optional Google sign-in and cloud backup

Google sign-in is used only for staged encrypted cloud backup. It requests basic identity and does
not request Gmail, Drive, Contacts, or Calendar scopes. Backup content is encrypted in the browser
before upload. Availability is shown inside the extension and may be disabled for the initial
trusted-tester review.

Users can delete a cloud backup or permanently delete the cloud account from Settings → Account and
cloud sync. The public account-deletion page documents the same flow.

## Remote code

The package executes no remotely hosted code. All executable JavaScript is included in the ZIP.

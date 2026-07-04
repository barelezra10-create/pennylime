# Dialer Workspace - Design Spec

Date: 2026-07-04
Status: Approved by Bar (conversation)

## Summary

A split-screen calling workspace at `/admin/dialer`, the new landing page of the Dialer tab. Left: searchable, stage-filterable contact list. Right: either a manual dial pad (call any number) or the selected contact (call, timeline notes, call history). Builds entirely on the shipped dialer infrastructure (DialerProvider softphone, CallButton, ContactCalls, /api/voice/*, /api/admin/calls).

Out of scope: queue/auto-advance mode, SMS from the workspace, editing contact fields.

## Decisions

| Question | Decision |
|---|---|
| Picking who to call | Free choice from a list with search + stage filters (no queue) |
| Manual dialing | Yes: dial pad tab, call any number, logged without contact |
| Notes | Both kinds: per-call wrap-up notes (existing) + contact timeline notes (Activity type "note") |

## Layout

Two-column page (stacked on small screens):

- Left column (~1/3): search input (matches name, email, phone, case-insensitive), stage filter pills (All + KANBAN_STAGES from contact-helpers), scrollable contact rows (name, stage badge with STAGE_COLORS, phone or "no phone" gray). Contacts with phones sort first, then by most recently updated. Clicking a row selects the contact and switches the right panel to the Contact view.
- Right column (~2/3), two tabs:
  - **Dial pad** (default when nothing selected): number display formatted as (XXX) XXX-XXXX while typing, 12-key pad (1-9, *, 0, #) clickable + full keyboard input incl. backspace/Enter-to-call, big Call button (disabled until >= 10 digits). If the entered digits match a contact's phone (via the phoneCandidates variants), show "This is {name}" with a button to load that contact.
  - **Contact** (auto-selected on row click): header with name, stage badge, phone, "Open contact page" link to /admin/contacts/[id], full-size CallButton; a notes composer (textarea + Save) that creates an Activity {type: "note", title: "Note", details, performedBy: session email} and refreshes the notes list below it (most recent 10 timeline notes); the existing ContactCalls history under that.

Calling uses the existing useDialer().startCall; the floating panel handles live-call UI and wrap-up exactly as today. Manual dials pass the raw E.164 number as both phone and display name; the outbound webhook already stores contactId null for them.

## Data / server

- Page data: server component fetches contacts once (id, firstName, lastName, email, phone, stage, updatedAt; exclude archived) reusing the query shape of getContacts, capped at 1000, serialized to the client component. Search/filtering happens client-side (dataset is small).
- New server action `addContactNote(contactId, details)` in src/actions/contacts.ts: session-gated, creates the Activity row, returns the created note. Notes list comes with the selected contact via a small `GET /api/admin/contacts/[id]/notes` route OR is fetched through an action `getContactNotes(contactId, limit 10)`; use a server action for both to match the codebase's action-first pattern.
- No schema changes.

## Nav and routing

- New page src/app/admin/dialer/page.tsx + dialer-workspace.tsx client component.
- Dialer tab: href changes to /admin/dialer; prefixes gain "/admin/dialer"; subnav becomes: Workspace (/admin/dialer), Calls & voicemails (/admin/calls), Voice settings (/admin/settings/tracking). "Call from pipeline" entry is dropped (the workspace replaces it).
- Middleware ADMIN_PROTECTED gains "/admin/dialer".

## Error handling

- Contact with no phone: Call button disabled with tooltip (existing CallButton behavior).
- Dial pad with < 10 digits: Call disabled.
- Note save failure: inline error text, note text preserved.
- Voice unconfigured: existing panel error path ("Voice is not configured...").

## Testing

- Unit tests: dial pad formatting/normalization helper (pure), addContactNote action happy path shape (if the codebase tests actions; otherwise formatting helper only).
- Manual: search + filter, select contact, save note (verify it appears on the contact page timeline), dial pad match banner, call from both tabs, build green.

# Chat Visitor Identification - Design Spec

Date: 2026-07-08
Status: Approved by Bar (conversation)

## Summary

Stop "Anonymous" chats from applicants. Three parts: (A) applying signs the visitor into the portal cookie so they are recognized everywhere for 30 days; (B) the chat API auto-recognizes the portal cookie and links the session to the contact at verified auth level; (C) everyone else must give name + email before chatting (required intro form in the widget).

## A. Cookie at apply

- In src/actions/applications.ts, immediately after `prisma.application.create` succeeds, call `signInPortal(application.id)` (src/lib/portal-auth.ts; server actions can set cookies). Applicants now carry the same 30-day `pl_portal` cookie the portal login sets.

## B. Chat auto-recognition

- In /api/agent/chat: on session creation AND on any user message for a session with no contactId, call `getPortalApplicationId()`. When it returns an id: load the application (firstName, email, contactId/contact relation), resolve the Contact (application's contact, else Contact by application email), and update the AgentSession: contactId, leadFirstName (from application firstName), leadEmail (application email), authLevel "verified" (the cookie is the same credential the portal trusts to show loan data).
- All three response shapes (create/message/poll) gain `identified: boolean` (session has contactId or leadEmail) and `visitorName: string | null`.
- Recognized users skip the widget intro form and the AI's verifyIdentity dance (verified level unlocks the loan tools directly).

## C. Required intro form (widget)

- Gate: when the panel is open and the visitor is neither server-identified (`identified` from any API response) nor has a local lead (localStorage pennylime.chat.lead with an email), the composer is replaced by an intro step: "Before we start, what's your name and email?" with firstName + email inputs (both required, simple email validation), Start chat button.
- Submitting stores the lead locally and sends it to the API (existing lead-upsert path links/creates the Contact), then enables the composer.
- The old optional "Save this chat to your inbox" link is removed (superseded); the lead-capture plumbing is reused by the intro step.
- Recognized portal users see no intro form at all.

## Error handling

- Cookie invalid/expired: silently treated as unidentified (no error).
- Intro submit failure: inline error, inputs preserved.
- Recognition failure inside the route must never break chat (try/catch, degrade to anonymous).

## Testing

- Manual: apply on the site → open chat → greeted as identified (no intro form), admin sees real name; incognito visitor → required intro form → contact created and linked; portal login → chat recognized.
- Existing tests must stay green; no new pure logic worth unit-testing beyond compile.

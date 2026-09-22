/** Voicemail routing means no staff member answered, even if Twilio completed the call. */
export function isMissedInbound(call: { direction: string; kind: string; status: string }): boolean {
  return call.direction === "inbound" && (call.kind === "voicemail" || ["no-answer", "busy", "failed", "canceled"].includes(call.status));
}

// Pure TwiML builders for the admin dialer. No IO, unit-testable.

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const XML = '<?xml version="1.0" encoding="UTF-8"?>';

export function outboundDialTwiml(opts: { callerId: string; to: string; baseUrl: string }): string {
  const b = opts.baseUrl.replace(/\/$/, "");
  return (
    XML +
    `<Response><Dial callerId="${esc(opts.callerId)}" record="record-from-answer-dual" ` +
    `recordingStatusCallback="${b}/api/voice/recording" action="${b}/api/voice/dial-complete">` +
    `<Number url="${b}/api/voice/whisper" statusCallback="${b}/api/voice/status" ` +
    `statusCallbackEvent="ringing answered completed">${esc(opts.to)}</Number>` +
    `</Dial></Response>`
  );
}

export function whisperTwiml(): string {
  return (
    XML +
    `<Response><Say voice="Polly.Joanna">This call is from PennyLime and may be recorded for quality purposes.</Say></Response>`
  );
}

export function inboundVoicemailTwiml(opts: { baseUrl: string }): string {
  const b = opts.baseUrl.replace(/\/$/, "");
  return (
    XML +
    `<Response><Say voice="Polly.Joanna">You have reached PennyLime. ` +
    `Please leave your name, number, and a brief message after the beep.</Say>` +
    `<Record maxLength="180" playBeep="true" transcribe="true" ` +
    `transcribeCallback="${b}/api/voice/transcription" ` +
    `recordingStatusCallback="${b}/api/voice/recording" ` +
    `action="${b}/api/voice/voicemail-done"/>` +
    `<Say voice="Polly.Joanna">We did not receive a message. Goodbye.</Say><Hangup/></Response>`
  );
}

export function voicemailDoneTwiml(): string {
  return XML + `<Response><Say voice="Polly.Joanna">Thank you. Goodbye.</Say><Hangup/></Response>`;
}

export function rejectTwiml(message: string): string {
  return XML + `<Response><Say voice="Polly.Joanna">${esc(message)}</Say><Hangup/></Response>`;
}

export function twimlResponse(xml: string): Response {
  return new Response(xml, { status: 200, headers: { "content-type": "text/xml" } });
}

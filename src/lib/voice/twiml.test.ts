import { describe, it, expect } from "vitest";
import {
  outboundDialTwiml,
  whisperTwiml,
  inboundVoicemailTwiml,
  voicemailDoneTwiml,
  rejectTwiml,
} from "./twiml";

const BASE = "https://pennylime.com";

describe("outboundDialTwiml", () => {
  it("dials the client with callerId, recording, and whisper url", () => {
    const xml = outboundDialTwiml({ callerId: "+18886912706", to: "+15551234567", baseUrl: BASE });
    expect(xml).toContain('callerId="+18886912706"');
    expect(xml).toContain('record="record-from-answer-dual"');
    expect(xml).toContain(`recordingStatusCallback="${BASE}/api/voice/recording"`);
    expect(xml).toContain(`action="${BASE}/api/voice/dial-complete"`);
    expect(xml).toContain(`url="${BASE}/api/voice/whisper"`);
    expect(xml).toContain(`statusCallback="${BASE}/api/voice/status"`);
    expect(xml).toContain(">+15551234567</Number>");
    expect(xml.startsWith("<?xml")).toBe(true);
  });

  it("escapes XML in numbers", () => {
    const xml = outboundDialTwiml({ callerId: "+1888&", to: "+1555<", baseUrl: BASE });
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;");
  });
});

describe("whisperTwiml", () => {
  it("says the recording announcement", () => {
    const xml = whisperTwiml();
    expect(xml).toContain("<Say");
    expect(xml.toLowerCase()).toContain("may be recorded");
    expect(xml.toLowerCase()).toContain("pennylime");
  });
});

describe("inboundVoicemailTwiml", () => {
  it("greets and records with transcription", () => {
    const xml = inboundVoicemailTwiml({ baseUrl: BASE });
    expect(xml).toContain("<Say");
    expect(xml.toLowerCase()).toContain("pennylime");
    expect(xml).toContain('maxLength="180"');
    expect(xml).toContain('transcribe="true"');
    expect(xml).toContain(`transcribeCallback="${BASE}/api/voice/transcription"`);
    expect(xml).toContain(`recordingStatusCallback="${BASE}/api/voice/recording"`);
    expect(xml).toContain(`action="${BASE}/api/voice/voicemail-done"`);
    expect(xml).toContain('playBeep="true"');
  });
});

describe("voicemailDoneTwiml", () => {
  it("thanks and hangs up", () => {
    const xml = voicemailDoneTwiml();
    expect(xml).toContain("<Hangup/>");
  });
});

describe("rejectTwiml", () => {
  it("says the error and hangs up", () => {
    const xml = rejectTwiml("Unable to place this call.");
    expect(xml).toContain("Unable to place this call.");
    expect(xml).toContain("<Hangup/>");
  });
});

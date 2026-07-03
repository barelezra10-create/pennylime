import twilio from "twilio";

export function mintVoiceToken(opts: {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
  identity: string;
}): string {
  const AccessToken = twilio.jwt.AccessToken;
  const token = new AccessToken(opts.accountSid, opts.apiKeySid, opts.apiKeySecret, {
    identity: opts.identity,
    ttl: 3600,
  });
  token.addGrant(new AccessToken.VoiceGrant({ outgoingApplicationSid: opts.twimlAppSid }));
  return token.toJwt();
}

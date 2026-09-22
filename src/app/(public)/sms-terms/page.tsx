export const metadata = {
  title: "SMS Terms & Opt-In Policy",
  alternates: { canonical: "https://pennylime.com/sms-terms" },
};

export default function SmsTermsPage() {
  return (
    <div className="max-w-[680px] mx-auto py-12 md:py-16 px-5 md:px-6">
      <h1 className="text-[26px] md:text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-8">
        SMS Terms &amp; Opt-In Policy
      </h1>
      <div className="space-y-6">
        <p className="text-[15px] text-[#71717a] leading-relaxed">Last updated: September 22, 2026</p>

        <p className="text-[15px] text-[#71717a] leading-relaxed">
          PennyLime is owned and operated by 770 Technology LLC, a Florida limited liability company (EIN 42-2071573), with principal place of business at 1300 Monad Terrace, Unit 9B, Miami Beach, FL 33139. This policy explains how PennyLime sends text messages, what they contain, and how you can stop them.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          How You Opt In
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          You opt in during the application at <a href="/apply" className="text-[#15803d] hover:underline">pennylime.com/apply</a> by entering your mobile number and selecting the separate SMS consent checkbox beneath the phone field. The checkbox is unchecked by default and optional. It authorizes automated account and payment text messages from PennyLime (770 Technology LLC), including application status updates, funding confirmations, payment reminders, payment confirmations, and failed-payment or late-fee notices. You can submit your application without selecting this checkbox. Consent is not a condition of receiving an advance. The phone-verification screen offers “Continue without SMS verification”; choosing it lets you continue without requesting a text or marking your number as verified. Requesting or entering a one-time verification code does not by itself enroll you in ongoing account or payment texts. We do not share your number with third parties for their marketing.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          What We Send
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          We send transactional account-servicing messages only:
        </p>
        <ul className="text-[15px] text-[#71717a] leading-relaxed space-y-2 list-disc pl-5">
          <li>Application received and status updates</li>
          <li>Approval and offer-ready notifications</li>
          <li>Funding confirmations</li>
          <li>Upcoming payment reminders</li>
          <li>Failed-payment and late-fee notices</li>
          <li>Payment confirmations</li>
        </ul>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          Message Frequency &amp; Rates
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          Message frequency varies based on your account activity. Message and data rates may apply. PennyLime does not charge you for these messages, but your mobile carrier may.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          How to Opt Out or Get Help
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          Reply <strong className="text-[#1a1a1a]">STOP</strong> to any message to unsubscribe at any time. After you opt out, we will send one confirmation message and no further texts unless you opt back in by replying <strong className="text-[#1a1a1a]">START</strong>. Reply <strong className="text-[#1a1a1a]">HELP</strong> for help, or contact us at <a href="mailto:info@pennylime.com" className="text-[#15803d] hover:underline">info@pennylime.com</a>. Opting out of texts does not affect required servicing communications, which we may continue to send by email.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          More Information
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          See our <a href="/terms" className="text-[#15803d] hover:underline">Terms of Service</a> and <a href="/privacy" className="text-[#15803d] hover:underline">Privacy Policy</a> for full details on how we handle your information.
        </p>
      </div>
    </div>
  );
}

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { passwordUser, completeMfa, fingerprint, recordLoginFailure } from "@/lib/security/admin-mfa";
import { mfaRequired, validAdminSession } from "@/lib/security/mfa-policy";

export const authOptions: NextAuthOptions = {
  providers: [CredentialsProvider({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" },
      challengeId: { label: "Challenge", type: "text" }, assertion: { label: "Passkey", type: "text" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials.password) return null;
      try {
        const user = await passwordUser(credentials.email, credentials.password);
        if (!user) return null;
        let mfaVerified = false;
        let mfaVersion = user.mfaVersion;
        if (credentials.challengeId && credentials.assertion) {
          const version = await completeMfa(user, credentials.challengeId, credentials.assertion);
          if (version === null) { await recordLoginFailure(user.email); return null; }
          mfaVersion = version;
          mfaVerified = true;
        } else if (mfaRequired(user.passkeys.length)) {
          await recordLoginFailure(user.email);
          return null;
        }
        await prisma.auditLog.create({ data: { action: "LOGIN_SUCCESS", entityType: "ADMIN_USER", entityId: user.id,
          performedBy: user.email, details: JSON.stringify({ mfaVerified }) } });
        return { id: user.id, email: user.email, name: user.name, role: user.role, mfaVerified, mfaVersion, passwordStamp: fingerprint(user.passwordHash) };
      } catch {
        await recordLoginFailure(credentials.email.trim().toLowerCase()).catch(() => {});
        return null;
      }
    },
  })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as typeof user & { role: string; mfaVerified: boolean; mfaVersion: number; passwordStamp: string };
        token.role = u.role; token.mfaVerified = u.mfaVerified; token.mfaVersion = u.mfaVersion; token.passwordStamp = u.passwordStamp;
      }
      return token;
    },
    async session({ session, token }) {
      // This guard covers ALL getServerSession users: pages, API routes and server actions.
      // A middleware-only gate would leave direct API/server-action calls exposed.
      const user = token.sub ? await prisma.adminUser.findUnique({ where: { id: token.sub }, include: { _count: { select: { passkeys: true } } } }) : null;
      const valid = user && validAdminSession({ verified: token.mfaVerified, tokenVersion: token.mfaVersion,
        currentVersion: user.mfaVersion, passkeyCount: user._count.passkeys,
        passwordStamp: token.passwordStamp, currentPasswordStamp: fingerprint(user.passwordHash) });
      if (!valid) return null as unknown as typeof session;
      if (session.user) {
        session.user.email = user.email;
        session.user.name = user.name;
        (session.user as { role?: string }).role = user.role;
      }
      return session;
    },
  },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60, updateAge: 60 * 60 },
  pages: { signIn: "/admin/login" },
};

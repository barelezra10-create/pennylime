import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";

const ADMIN_SESSION_HOURS = 12;
const FAILED_LOGIN_WINDOW_MIN = 15;
const MAX_FAILED_LOGINS = 5;

async function isLockedOut(email: string): Promise<boolean> {
  const since = new Date(Date.now() - FAILED_LOGIN_WINDOW_MIN * 60 * 1000);
  const recentFailures = await prisma.auditLog.count({
    where: {
      action: "LOGIN_FAILED",
      performedBy: email.toLowerCase(),
      createdAt: { gte: since },
    },
  });
  return recentFailures >= MAX_FAILED_LOGINS;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        if (!email || !credentials?.password) return null;

        if (await isLockedOut(email)) {
          await logAudit({
            action: "LOGIN_LOCKED_OUT",
            entityType: "ADMIN_USER",
            entityId: email,
            performedBy: email,
            details: { reason: `${MAX_FAILED_LOGINS}+ failed logins in ${FAILED_LOGIN_WINDOW_MIN}min` },
          }).catch(() => {});
          return null;
        }

        const user = await prisma.adminUser.findUnique({ where: { email } });
        if (!user) {
          await logAudit({
            action: "LOGIN_FAILED",
            entityType: "ADMIN_USER",
            entityId: email,
            performedBy: email,
            details: { reason: "no such user" },
          }).catch(() => {});
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          await logAudit({
            action: "LOGIN_FAILED",
            entityType: "ADMIN_USER",
            entityId: user.id,
            performedBy: email,
            details: { reason: "wrong password" },
          }).catch(() => {});
          return null;
        }

        await logAudit({
          action: "LOGIN_SUCCESS",
          entityType: "ADMIN_USER",
          entityId: user.id,
          performedBy: email,
        }).catch(() => {});

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    // NOTE: role changes take effect at next sign-in; the JWT is cached for up to 12 h.
    async jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role ?? "ADMIN";
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as { role?: string }).role = (token.role as string) ?? "ADMIN";
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: ADMIN_SESSION_HOURS * 60 * 60,
    updateAge: 60 * 60,
  },
  pages: { signIn: "/admin/login" },
};

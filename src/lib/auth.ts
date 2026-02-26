import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

export interface ValidatedUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  company: string | null;
  companyId: string | null;
  companyLogoId: string | null;
  phone: string | null;
}

export async function validateCredentials(
  email: string,
  password: string
): Promise<ValidatedUser> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { companyRef: true },
  });

  if (!user || !user.isActive) {
    throw new Error("Invalid email or password");
  }

  const isPasswordValid = await compare(password, user.hashedPassword);

  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }

  // Auto-link user to company by email domain if not already linked
  let companyId = user.companyId;
  let companyLogoId = user.companyRef?.logoPath ?? null;
  let companyName = user.company;

  if (!companyId) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain) {
      const company = await prisma.company.findUnique({
        where: { domain },
      });
      if (company) {
        companyId = company.id;
        companyLogoId = company.logoPath;
        companyName = company.name;
        // Link user to company
        await prisma.user.update({
          where: { id: user.id },
          data: {
            companyId: company.id,
            company: company.name,
            lastLoginAt: new Date(),
          },
        });
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
      }
    }
  } else {
    // Already linked — just update lastLoginAt and sync company name
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        company: user.companyRef?.name ?? user.company,
      },
    });
    companyName = user.companyRef?.name ?? user.company;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    company: companyName,
    companyId,
    companyLogoId,
    phone: user.phone,
  };
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        return validateCredentials(credentials.email, credentials.password);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        token.company = (user as { company?: string | null }).company ?? null;
        token.companyId = (user as { companyId?: string | null }).companyId ?? null;
        token.companyLogoId = (user as { companyLogoId?: string | null }).companyLogoId ?? null;
        token.phone = (user as { phone?: string | null }).phone ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id: string }).id = token.id as string;
        (session.user as { role: string }).role = token.role as string;
        (session.user as { company?: string | null }).company = token.company ?? null;
        (session.user as { companyId?: string | null }).companyId = token.companyId ?? null;
        (session.user as { companyLogoId?: string | null }).companyLogoId = token.companyLogoId ?? null;
        (session.user as { phone?: string | null }).phone = token.phone ?? null;
      }
      return session;
    },
  },
};

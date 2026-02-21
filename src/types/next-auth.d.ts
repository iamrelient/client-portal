import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      company?: string | null;
      companyId?: string | null;
      companyLogoId?: string | null;
      phone?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    company?: string | null;
    companyId?: string | null;
    companyLogoId?: string | null;
    phone?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    company?: string | null;
    companyId?: string | null;
    companyLogoId?: string | null;
    phone?: string | null;
  }
}

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await hash("admin123", 12);
  const userPassword = await hash("user1234", 12);

  const admin = await prisma.user.upsert({
    where: { email: "caleb@rayrenders.com" },
    update: {},
    create: {
      name: "Caleb",
      email: "caleb@rayrenders.com",
      hashedPassword: adminPassword,
      role: "ADMIN",
      company: "Ray Renders",
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "user@example.com" },
    update: {},
    create: {
      name: "Jane Smith",
      email: "user@example.com",
      hashedPassword: userPassword,
      role: "USER",
      company: "Acme Corp",
    },
  });

  await prisma.activity.createMany({
    data: [
      {
        type: "ACCOUNT_CREATED",
        description: "Account was created",
        userId: admin.id,
      },
      {
        type: "LOGIN",
        description: "Signed in from Chrome on Windows",
        userId: admin.id,
      },
      {
        type: "ACCOUNT_CREATED",
        description: "Account was created",
        userId: user.id,
      },
      {
        type: "LOGIN",
        description: "Signed in from Safari on macOS",
        userId: user.id,
      },
      {
        type: "SETTINGS_UPDATED",
        description: "Updated profile information",
        userId: user.id,
      },
    ],
  });

  console.log("Seeded: caleb@rayrenders.com / admin123");
  console.log("Seeded: user@example.com / user1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

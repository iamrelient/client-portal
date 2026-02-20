import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totalUsers, activeUsers, recentActivities, usersByMonth, inactiveClients] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.activity.findMany({
        take: 20,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, email: true } },
        },
      }),
      prisma.user.groupBy({
        by: ["createdAt"],
        _count: true,
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.user.findMany({
        where: {
          role: "USER",
          isActive: true,
          OR: [
            { lastLoginAt: null },
            { lastLoginAt: { lt: thirtyDaysAgo } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          lastLoginAt: true,
          company: true,
        },
        orderBy: { lastLoginAt: { sort: "asc", nulls: "first" } },
        take: 10,
      }),
    ]);

  return NextResponse.json({
    totalUsers,
    activeUsers,
    inactiveUsers: totalUsers - activeUsers,
    recentActivities,
    usersByMonth,
    inactiveClients,
  });
}

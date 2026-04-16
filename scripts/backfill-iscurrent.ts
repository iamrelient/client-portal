/**
 * One-time backfill to correct the `isCurrent` flag across the File table.
 *
 * Historical data has `isCurrent = true` on every row because the upload
 * pipeline never maintained the flag. This script flips all rows in each
 * `fileGroupId` to `isCurrent = false` except the highest version, which
 * becomes `isCurrent = true`. Single-version rows (no fileGroupId) are all
 * set to `isCurrent = true`.
 *
 * Run with (PowerShell):
 *   $env:DATABASE_URL="postgresql://..."
 *   npx tsx scripts/backfill-iscurrent.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Files with a fileGroupId: highest version = current, rest = not
  const groups = await prisma.file.groupBy({
    by: ["fileGroupId"],
    where: { fileGroupId: { not: null } },
    _max: { version: true },
  });

  let currentSet = 0;
  let currentCleared = 0;

  for (const g of groups) {
    if (!g.fileGroupId || g._max.version == null) continue;
    const r1 = await prisma.file.updateMany({
      where: { fileGroupId: g.fileGroupId, version: g._max.version },
      data: { isCurrent: true },
    });
    const r2 = await prisma.file.updateMany({
      where: { fileGroupId: g.fileGroupId, version: { not: g._max.version } },
      data: { isCurrent: false },
    });
    currentSet += r1.count;
    currentCleared += r2.count;
  }

  // 2. Files with no fileGroupId (single-version): always current
  const singles = await prisma.file.updateMany({
    where: { fileGroupId: null },
    data: { isCurrent: true },
  });

  console.log(`Grouped: ${currentSet} marked current, ${currentCleared} cleared`);
  console.log(`Single-version: ${singles.count} marked current`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

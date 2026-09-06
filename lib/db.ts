import { PrismaClient } from "@prisma/client";

// Next.js dev mode hot-reloads modules, which would otherwise open a new pool
// on every reload until Postgres refuses connections. Reuse one client.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

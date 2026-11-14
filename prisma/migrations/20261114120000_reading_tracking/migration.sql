-- Reading tracking (Phase 1): reading PIN, per-book progress details, daily totals,
-- remembered readers on shared devices. Additive only: no existing data is changed.

-- AlterTable
ALTER TABLE "ReadingProgress" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "maxPage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pagesSeen" BYTEA,
ADD COLUMN     "pagesViewed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "secondsRead" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalPages" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "readingPinHash" TEXT;

-- CreateTable
CREATE TABLE "ReadingDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReaderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReaderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadingDay_day_idx" ON "ReadingDay"("day");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingDay_userId_day_key" ON "ReadingDay"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ReaderProfile_tokenHash_key" ON "ReaderProfile"("tokenHash");

-- CreateIndex
CREATE INDEX "ReaderProfile_userId_idx" ON "ReaderProfile"("userId");

-- CreateIndex
CREATE INDEX "ReadingProgress_userId_updatedAt_idx" ON "ReadingProgress"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "ReadingDay" ADD CONSTRAINT "ReadingDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReaderProfile" ADD CONSTRAINT "ReaderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


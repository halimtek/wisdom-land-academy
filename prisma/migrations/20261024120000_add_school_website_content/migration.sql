-- Additive school website content and metadata. Existing rows and media remain untouched.
ALTER TABLE "Book" ADD COLUMN "author" TEXT;

CREATE TYPE "SchoolContentKind" AS ENUM (
  'ACTIVITY',
  'ANNOUNCEMENT',
  'STAFF_PROFILE',
  'STUDENT_PROJECT'
);

CREATE TABLE "SchoolContent" (
  "id" TEXT NOT NULL,
  "kind" "SchoolContentKind" NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "body" TEXT,
  "displayName" TEXT,
  "roleTitle" TEXT,
  "eventDate" TIMESTAMP(3),
  "imagePath" TEXT,
  "imageAlt" TEXT,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "consentConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolContent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchoolContent_kind_isPublished_eventDate_idx"
  ON "SchoolContent"("kind", "isPublished", "eventDate");
CREATE INDEX "SchoolContent_kind_isPublished_updatedAt_idx"
  ON "SchoolContent"("kind", "isPublished", "updatedAt");

CREATE TABLE "SchoolSettings" (
  "id" TEXT NOT NULL DEFAULT 'main',
  "aboutText" TEXT,
  "contactPhone" TEXT,
  "contactEmail" TEXT,
  "contactAddress" TEXT,
  "logoImagePath" TEXT,
  "logoImageAlt" TEXT,
  "heroImagePath" TEXT,
  "heroImageAlt" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolSettings_pkey" PRIMARY KEY ("id")
);

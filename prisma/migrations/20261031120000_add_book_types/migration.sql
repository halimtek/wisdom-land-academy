-- Additive book types and general library access. Existing books remain grade-based.
CREATE TYPE "BookType" AS ENUM ('GRADE_BASED', 'GENERAL');

ALTER TABLE "Book"
  ADD COLUMN "bookType" "BookType" NOT NULL DEFAULT 'GRADE_BASED',
  ADD COLUMN "coverImagePath" TEXT,
  ADD COLUMN "accessAllStudents" BOOLEAN NOT NULL DEFAULT false,
  ALTER COLUMN "subjectId" DROP NOT NULL;

CREATE TABLE "BookGradeAccess" (
  "id" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookGradeAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookGradeAccess_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BookGradeAccess_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BookGradeAccess_bookId_gradeId_key" ON "BookGradeAccess"("bookId", "gradeId");
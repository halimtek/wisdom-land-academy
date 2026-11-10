-- Books remain private until an administrator explicitly publishes them.
ALTER TABLE "Book" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false;

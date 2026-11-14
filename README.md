# Wisdom Land Academy Digital Library

## Local setup

Configure a PostgreSQL connection in `.env` as `DATABASE_URL`. Keep `.env` out of source control. Apply checked-in migrations with `npx prisma migrate deploy`, then regenerate the client with `npx prisma generate`.

Create the first administrator from an interactive terminal after migrations are applied:

```sh
npm run db:create-admin
```

This one-time command prompts for username, full name, and a password (minimum 12 characters). Password input is hidden and stored as an Argon2id hash. It refuses to run once an administrator exists. It does not accept a role or password from application users.

Set `BOOK_STORAGE_DIR` to an absolute directory outside the repository's `public/` directory. Store book files there and put only relative paths in `Book.filePath`. Files are served through `/api/books/{id}/file` after session and permission checks; never place book files in `public/` or expose the storage directory through a web server.

Administrators manage PDF textbooks at `/admin/books`. Uploads are limited to 50 MB, checked for PDF MIME type and `%PDF-` signature, and saved under server-generated names. Students see books grouped by grade and subject only after an administrator grants an explicit book permission. Deletion is blocked while reading-progress records exist so progress is preserved. This phase uses the existing `Book`, `Subject`, `Grade`, `BookPermission`, and `ReadingProgress` models and needs no schema migration.

The storage resolver, PDF validation, and access policy are isolated so a future lesson or media resource can reuse the private storage and permission patterns. Live classes and video lessons are not part of this phase.

The login rate limit allows eight attempts per username and client IP in a 15-minute window, stored in PostgreSQL. The IP value uses the first `x-forwarded-for` value (or `x-real-ip`); configure the app behind a trusted proxy that overwrites these headers. User roles are loaded from the database, and protected server functions should call `requireUser()` or `requireRole()` before accessing data.

## Development

```sh
npm run dev
npm run lint
npm run build
```

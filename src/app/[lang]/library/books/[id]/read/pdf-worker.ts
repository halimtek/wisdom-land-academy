// PDF.js worker entry, bundled by Next.js from the installed pdfjs-dist package,
// so the worker version always matches the API version used by book-reader.tsx.
// The legacy build includes polyfills for older iPadOS/iOS Safari and Android
// WebViews; the modern build calls JavaScript APIs those browsers do not have.
// The worker script initialises itself when loaded inside a Worker.
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';

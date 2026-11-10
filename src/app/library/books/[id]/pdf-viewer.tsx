
'use client';

import { useEffect, useRef, useState } from 'react';

export default function PdfViewer({
  fileUrl,
}: {
  fileUrl: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);

  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Opening book...');
  const [error, setError] = useState('');

  // Load the PDF document once.
  useEffect(() => {
    let cancelled = false;
    let loadingTask: any = null;

    async function openPdf() {
      try {
        setStatus('Loading book...');

        const pdfjs = await import('pdfjs-dist');

        pdfjs.GlobalWorkerOptions.workerSrc =
          '/pdf.worker.min.mjs';

        loadingTask = pdfjs.getDocument({
          url: fileUrl,
          rangeChunkSize: 65536,
          disableAutoFetch: true,
          disableStream: true,
        });

        const pdf = await loadingTask.promise;

        if (cancelled) {
          await loadingTask.destroy();
          return;
        }

        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setReady(true);
        setStatus('');
      } catch (err) {
        console.error('PDF loading error:', err);

        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : String(err)
          );
          setStatus('');
        }
      }
    }

    openPdf();

    return () => {
      cancelled = true;
      pdfRef.current = null;

      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      if (loadingTask) {
        void loadingTask.destroy();
      }
    };
  }, [fileUrl]);

  // Render only the selected page.
  useEffect(() => {
    if (!ready || !pdfRef.current || !containerRef.current) {
      return;
    }

    let cancelled = false;

    async function renderPage() {
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const container = containerRef.current;
        const pdf = pdfRef.current;

        if (!container || !pdf) return;

        container.innerHTML = '';
        setStatus(`Rendering page ${pageNumber}...`);
        setError('');

        const page = await pdf.getPage(pageNumber);

        if (cancelled) return;

        const originalViewport = page.getViewport({
          scale: 1,
        });

        const availableWidth = Math.max(
          280,
          container.clientWidth - 32
        );

        const scale =
          (availableWidth / originalViewport.width) * zoom;

        const viewport = page.getViewport({ scale });

        // Limit canvas resolution to protect iPad and PC memory.
        const pixelRatio = Math.min(
          window.devicePixelRatio || 1,
          1.5,
          Math.sqrt(
            12000000 / (viewport.width * viewport.height)
          )
        );

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('Could not create PDF canvas.');
        }

        canvas.width = Math.floor(
          viewport.width * pixelRatio
        );

        canvas.height = Math.floor(
          viewport.height * pixelRatio
        );

        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';

        container.appendChild(canvas);

        if (cancelled) return;

        const renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: [
            pixelRatio, 0,
            0, pixelRatio,
            0, 0,
          ],
        });

        renderTaskRef.current = renderTask;

        await renderTask.promise;

        if (!cancelled) {
          setStatus('');
        }
      } catch (err) {
        if (
          !cancelled &&
          !(err instanceof Error && err.name === 'RenderingCancelledException')
        ) {
          console.error('Page rendering error:', err);
          setError(
            err instanceof Error ? err.message : String(err)
          );
          setStatus('');
        }
      }
    }

    renderPage();

    return () => {
      cancelled = true;

      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [ready, pageNumber, zoom]);

  function previousPage() {
    setPageNumber((current) => Math.max(1, current - 1));
  }

  function nextPage() {
    setPageNumber((current) =>
      Math.min(numPages, current + 1)
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: '#e5e7eb',
      }}
    >
      {/* Reading controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: 10,
          background: '#1f2937',
          color: 'white',
        }}
      >
        <button
          onClick={previousPage}
          disabled={pageNumber <= 1}
          style={buttonStyle}
        >
          ← Previous
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <input
            type="number"
            min={1}
            max={numPages}
            value={pageNumber}
            onChange={(e) => {
              const value = Number(e.target.value);

              if (
                Number.isInteger(value) &&
                value >= 1 &&
                value <= numPages
              ) {
                setPageNumber(value);
              }
            }}
            style={{
              width: 65,
              padding: 8,
              borderRadius: 6,
              color: '#111827',
              textAlign: 'center',
            }}
          />

          <span style={{ fontSize: 14 }}>
            / {numPages || '...'}
          </span>
        </div>

        <button
          onClick={nextPage}
          disabled={pageNumber >= numPages}
          style={buttonStyle}
        >
          Next →
        </button>

        <button
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          style={buttonStyle}
        >
          −
        </button>

        <button
          onClick={() => setZoom(1)}
          style={buttonStyle}
        >
          Fit
        </button>

        <button
          onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
          style={buttonStyle}
        >
          +
        </button>
      </div>

      {/* Page display */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: 12,
        }}
      >
        {status && (
          <div
            style={{
              padding: 20,
              textAlign: 'center',
              color: '#374151',
            }}
          >
            {status}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: 20,
              textAlign: 'center',
              color: '#b91c1c',
              background: 'white',
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        )}

        <div
          ref={containerRef}
          style={{
            width: '100%',
            minHeight: 100,
          }}
        />
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: 6,
  border: '1px solid #4b5563',
  background: '#374151',
  color: 'white',
  fontSize: 13,
  cursor: 'pointer',
};

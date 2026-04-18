import React, { useEffect, useState } from 'react';
const MAX_VALUE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_DOCS        = 100;
const MAX_PAGES       = 500;

type PageItem = {
  page_no: number;
  text?: string;
  signature_stamp?: string;
};

type LcDocumentData = Record<string, PageItem[]>;

type FileItem = {
  file: File;
  done: boolean;
  text: string;
};

type LCDocumentProps = {
  value: string;
  onDocumentExtracted: (text: string) => void;
  generateSample: (type: 'clean' | 'discrepant') => void;
  isGenerating: boolean;
  lifecycle?: string;
  error?: string;
};

const sanitizeString = (input: unknown): string => {
  if (typeof input !== 'string') return '';
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};
const sanitizePageNo = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const isLcDocumentData = (data: unknown): data is LcDocumentData => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);
  for (const key of Object.keys(data as object)) {
    if (dangerousKeys.has(key)) return false;
  }
  return true;
};

const LCDocument = ({ value}: LCDocumentProps) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [demoMode, setDemoMode] = useState<'Y' | 'N'>('N');
  const [demoModeReady, setDemoModeReady] = useState<boolean>(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/lc/control/demo-mode', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Demo-mode fetch failed: ${r.status}`);
        return r.json();
      })
      .then((d) => setDemoMode(d.demomode === 'Y' ? 'Y' : 'N'))
      .catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('[LCDocument] Could not load demo mode:', err.message);
        }
        setDemoMode('N');
      })
      .finally(() => setDemoModeReady(true));
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!value || typeof value !== 'string') {
      setFiles([]);
      return;
    }

    if (value.length > MAX_VALUE_BYTES) {
      console.error(`[LCDocument] Rejected value exceeding ${MAX_VALUE_BYTES} bytes`);
      setFiles([]);
      return;
    }

    setFiles([
      {
        file: new File([value], 'LC_Document.txt', { type: 'text/plain' }),
        done: true,
        text: value
      }
    ]);
  }, [value]);
  const formatLcContent = (input: string): string => {
    try {
      const raw: unknown = JSON.parse(input);

      if (!isLcDocumentData(raw)) return sanitizeString(input); // FIX 2

      const entries = Object.entries(raw);
      if (entries.length > MAX_DOCS) throw new Error(`Too many documents: ${entries.length}`); // FIX 9

      let output = '';

      entries.forEach(([docName, pages]) => {
        output += `\n==============================\n`;
        output += `DOCUMENT: ${sanitizeString(docName).replaceAll('_', ' ').toUpperCase()}\n`; // FIX 4
        output += `==============================\n\n`;

        if (Array.isArray(pages)) {
          if (pages.length > MAX_PAGES) throw new Error(`Too many pages: ${pages.length}`); // FIX 9

          [...pages] // FIX 6: immutable sort — don't mutate original array
            .sort((a, b) => sanitizePageNo(a.page_no) - sanitizePageNo(b.page_no)) // FIX 5
            .forEach((page) => {
              output += `--- Page ${sanitizePageNo(page.page_no)} ---\n`; // FIX 5
              output += `${sanitizeString(page.text)}\n`; // FIX 4

              if (page.signature_stamp) {
                output += `\n[Signature / Stamp]\n${sanitizeString(page.signature_stamp)}\n`; // FIX 4
              }

              output += `\n`;
            });
        }
      });

      return output.trim();
    } catch (err: unknown) {
      console.error('[LCDocument] Failed to parse LC content:', err instanceof Error ? err.message : String(err));
      return sanitizeString(input); // FIX 4: sanitize fallback too
    }
  };

  return (
    <div className="card pb-2.5">
      <div className="card-header p-2 flex justify-between">
        <h3 className="card-title">LC Document</h3>
      </div>

      <div className="p-4">
        {!demoModeReady ? (
          <div className="text-gray-400 text-sm">Loading...</div>
        ) : files.length === 0 ? (
          <div className="text-gray-500 text-sm">No LC document available</div>
        ) : (
          files.map((f, i) => (
            <div key={`${f.file?.name || 'lc'}-${i}`} className='max-h-[550px] scrollable-y'>
            <pre className="bg-gray-50 dark:bg-gray-400 p-4 text-md whitespace-pre-wrap leading-relaxed">
              {formatLcContent(f.text)}
            </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LCDocument;

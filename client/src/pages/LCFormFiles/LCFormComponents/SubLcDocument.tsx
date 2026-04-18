import React, { useMemo } from 'react';
import { Tabs, TabsList, Tab, TabPanel } from '@/components/tabs';
import { normalizeSubDocuments } from '@/utils/subdoc';
const MAX_INPUT_LENGTH = 5 * 1024 * 1024; 
const MAX_ARRAY_ITEMS  = 100;            
type Props = {
  subDocumentText: string | object | unknown[] | null | undefined;
};
const sanitizeString = (input: unknown): string => {
  if (typeof input !== 'string') return '';
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};
const sanitizePageNo = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const isSafeObject = (data: unknown): data is Record<string, unknown> => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const dangerous = new Set(['__proto__', 'constructor', 'prototype']);
  for (const key of Object.keys(data as object)) {
    if (dangerous.has(key)) return false;
  }
  return true;
};
const SubLcDocument: React.FC<Props> = ({ subDocumentText }) => {
  const files = useMemo(() => {
    if (!subDocumentText) return [];
    if (typeof subDocumentText === 'string' && subDocumentText.length > MAX_INPUT_LENGTH) {
      console.error('[SubLcDocument] Rejected oversized subDocumentText input');
      return [];
    }
    const parseStringToFiles = (text: string) => {
      return text
        .split('--- FILE:')
        .filter(Boolean)
        .map((block) => {
          const [fileLine, ...jsonLines] = block.split('\n');
          const fileName = sanitizeString(fileLine.trim().replace('---', ''));
          const jsonString = jsonLines.join('\n').trim();
          let parsed: Record<string, unknown> = {};
          try {
            const raw: unknown = JSON.parse(jsonString);
            if (isSafeObject(raw)) parsed = raw;
          } catch (e) {
            console.error('[SubLcDocument] JSON parse error:', e);
          }
          return {
            fileName,
            documents: normalizeSubDocuments(parsed)
          };
        });
    };
    const docsFromValue = (value: unknown, depth = 0): ReturnType<typeof normalizeSubDocuments> => {
      if (!value || depth > 3) return [];
      if (typeof value === 'string') {
        const trimmed = sanitizeString(value.trim());
        if (!trimmed) return [];
        try {
          const raw: unknown = JSON.parse(trimmed);
          if (isSafeObject(raw)) return normalizeSubDocuments(raw); 
          return [];
        } catch {
          return [
            {
              docType: 'SUBDOCUMENT',
              pages: [{ page_no: 1, text: trimmed }]
            }
          ];
        }
      }
      if (Array.isArray(value)) {
        return value
          .slice(0, MAX_ARRAY_ITEMS) 
          .flatMap((item) => docsFromValue(item, depth + 1));
      }
      if (isSafeObject(value)) {
        return normalizeSubDocuments(value);
      }
      return [];
    };
    if (typeof subDocumentText === 'string' && subDocumentText.includes('--- FILE:')) {
      return parseStringToFiles(subDocumentText);
    }
    if (Array.isArray(subDocumentText)) {
      const files = subDocumentText
        .slice(0, MAX_ARRAY_ITEMS) 
        .flatMap((item) => {
          if (typeof item === 'string' && item.includes('--- FILE:')) {
            return parseStringToFiles(item);
          }
          const docs = docsFromValue(item);
          return docs.length ? [{ fileName: 'SubDocuments', documents: docs }] : [];
        });
      return files;
    }
    const docs = docsFromValue(subDocumentText);
    return docs.length ? [{ fileName: 'SubDocuments', documents: docs }] : [];
  }, [subDocumentText]);
  if (!files.length) {
    return <p className="text-gray-500">No Sub Documents Available</p>;
  }
  return (
    <div className='card p-3'>
    <Tabs defaultValue={0} className="w-full">
      <TabsList className="flex gap-10 border-b mb-4">
        {files.map((file, idx) => (
          <Tab className='text-md' key={idx} value={idx}>
           SubDocuments
          </Tab>
        ))}
      </TabsList>
      {files.map((file, fIdx) => (
        <TabPanel key={fIdx} value={fIdx}>
          <Tabs defaultValue={0} className="w-full">
            <TabsList className="flex flex-wrap gap-2 mb-4 border-b ">
              {file.documents.map((doc, dIdx) => (
                <Tab className='text-md' key={dIdx} value={dIdx}>
                  | {sanitizeString(doc.docType)}  | 
                </Tab>
              ))}
            </TabsList>
            {file.documents.map((doc, dIdx) => (
              <TabPanel key={dIdx} value={dIdx}>
                <div className="space-y-4 max-h-[700px] scrollable-y">
                  {doc.pages.map((page, pIdx) => (
                    <div
                      key={pIdx}
                      className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-400"
                    >
                      <div className="font-semibold mb-2">
                        Page {sanitizePageNo(page.page_no)}
                      </div>

                      <p className="whitespace-pre-wrap text-sm">
                        {sanitizeString(page.text)}
                      </p>

                      {page.signature_stamp && (
                        <div className="mt-2  text-gray-600">
                          <b>Signature / Stamp:</b>{' '}
                          {sanitizeString(page.signature_stamp)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </TabPanel>
            ))}
          </Tabs>
        </TabPanel>
      ))}
    </Tabs>
    </div>
  );
};

export default SubLcDocument;

import React, { useState ,useEffect} from 'react';

type Props = {
  // Security: replaced any with bounded type to prevent prototype pollution from server data
  data: Record<string, unknown>;
  transactionNo: string | number;
  onActionChange?: (issueMap: Record<string, 'REQUIRED' | 'NOT_REQUIRED'>) => void;
  issueStatusMap?: Record<string, 'REQUIRED' | 'NOT_REQUIRED'>;
  extraContent?: React.ReactNode;
  hideActionForIds?: string[];
};

const RenderJsonSummary: React.FC<Props> = ({
  transactionNo: _transactionNo,
  data,
  onActionChange,
  issueStatusMap,
  extraContent,
  hideActionForIds
}) => {
  const [issueStatus, setIssueStatus] = useState<
    Record<string, 'REQUIRED' | 'NOT_REQUIRED' | null>
  >({});

  useEffect(() => {
    if (!issueStatusMap) return;
    setIssueStatus((prev) => ({
      ...prev,
      ...issueStatusMap
    }));
  }, [issueStatusMap]);

  // Security: strict allowlist sanitizer to prevent prototype pollution via crafted IDs
  const sanitizeId = (id: unknown): string => {
    const s = String(id ?? '').trim();
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(s)) return '';
    if (['__proto__', 'constructor', 'prototype'].includes(s)) return '';
    return s;
  };

  // Security: early return placed AFTER all hooks to satisfy Rules of Hooks
  if (!data || typeof data !== 'object') return null;

  const { document_examined, lc_number, discrepancies, summary_statistics } = data;

  const applyStatus = (issueId: string, value: 'REQUIRED' | 'NOT_REQUIRED' | null) => {
    // Security: only apply status for sanitized, non-empty IDs
    if (!issueId) return;
    setIssueStatus((prev) => {
      const updated = {
        ...prev,
        [issueId]: value
      };

      onActionChange?.(
        Object.fromEntries(Object.entries(updated).filter(([_, v]) => v !== null)) as Record<
          string,
          'REQUIRED' | 'NOT_REQUIRED'
        >
      );

      return updated;
    });
  };

  const renderValue = (value: unknown): React.ReactNode => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value) ?? null;
  };

  return (
    <>
      {/* HEADER SUMMARY */}
      <div className="p-4">
        <div className="flex justify-between">
          <h2 className="text-lg font-bold mb-2 text-primary">Document Summary</h2>

          {/* ACTION REQUIRED BUTTON */}
        </div>
        <p className="mb-2 text-blue-500 font-bold text-lg">
          Document Examined:{' '}
          <span className="text-gray-800 font-semibold text-md">
            {renderValue(document_examined)}
          </span>
        </p>

        <p className="text-blue-500 font-bold text-lg">
          LC Number:{' '}
          <span className="text-gray-800 font-semibold text-md">
            {renderValue(lc_number)}
          </span>
        </p>
      </div>

      {/* DISCREPANCY TABLE */}
      <div className="p-4 pt-0">
        <h2 className="text-lg font-bold mb-2 text-primary">Discrepancies</h2>
        <div className="grid">
        <div className="card min-w-full">
          <div className="card-table scrollable-x-auto">
            <table className="table align-middle text-gray-700 font-medium text-sm">
              <thead>
                <tr className="text-left">
                  <th className="px-3 py-2">Discrepancy ID</th>
                  <th className="px-3 py-2">Discrepancy Title</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Severity</th>
                  <th className="px-3 py-2">Source Ref</th>
                  <th className="px-3 py-2">Evidence</th>
                  <th className="px-3 py-2">Remediation</th>
                  <th className="px-3 py-2">Governing Rule</th>
                </tr>
              </thead>

              <tbody>
                {(Array.isArray(discrepancies) ? discrepancies : []).map((d: unknown, i: number) => {
                  const disc = d && typeof d === 'object' ? d as Record<string, unknown> : {};
                  const safeId = sanitizeId(disc.discrepancy_id);
                  return (
                  <tr
                    key={i}
                    className={`text-left ${i % 2 === 0 ? '' : 'bg-gray-100'} hover:bg-gray-100`}
                  >
                    <td className="px-3 py-3">{renderValue(disc.discrepancy_id)}</td>
                    <td className="px-3 py-3">{renderValue(disc.discrepancy_title)}</td>
                    <td className="px-3 py-3">{renderValue(disc.discrepancy_type)}</td>
                    <td className="px-3 py-3">{renderValue(disc.severity_level)}</td>
                    <td className="px-3 py-3">{renderValue(disc.source_reference)}</td>

                    <td className="px-3 py-3">
                      <ul className="m-0 ps-4">
                        {Object.entries(typeof disc.evidence === 'object' && disc.evidence !== null ? disc.evidence as Record<string, unknown> : {}).map(([key, value]) => (
                          <li key={key}>
                            <strong>{key}:</strong> {renderValue(value)}
                          </li>
                        ))}
                      </ul>
                    </td>

                    <td className="px-3 py-3">{renderValue(disc.remediation)}</td>
                    <td className="px-3 py-3">{renderValue(disc.governing_rule)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      </div>

      {/* FULL DETAILED ISSUE BREAKDOWN */}
      {Array.isArray(discrepancies) && discrepancies.length > 0 && (
        <div className="p-4 pb-0">
          {discrepancies.map((dRaw: unknown, index: number) => {
            const d = dRaw && typeof dRaw === 'object' ? dRaw as Record<string, unknown> : {};
            // Security: sanitize discrepancy_id before using as state key or prop
            const safeId = sanitizeId(d.discrepancy_id);
            return (
            <div key={index} className="mb-8">
              {/*  ISSUE TITLE WITH CHECKBOX */}
              <div className="flex items-center gap-6 mb-4 relative z-[9999] pointer-events-auto">
                <h2 className="text-lg font-bold text-primary">ISSUE {index + 1}</h2>

                {safeId && !hideActionForIds?.includes(safeId) && (
                  <>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="checkbox"
                        aria-label="Required"
                        checked={issueStatusMap?.[safeId] === 'REQUIRED'}
                        disabled={issueStatusMap?.[safeId] === 'NOT_REQUIRED'}
                        onChange={() => {
                          if (issueStatus[safeId] === 'REQUIRED') {
                            applyStatus(safeId, null);
                            return;
                          }
                          applyStatus(safeId, 'REQUIRED');
                        }}
                      />

                      <span className="font-semibold text-green-700">Required</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="checkbox"
                        aria-label="Not Required"
                        checked={issueStatusMap?.[safeId] === 'NOT_REQUIRED'}
                        disabled={issueStatusMap?.[safeId] === 'REQUIRED'}
                        onChange={() => {
                          if (issueStatus[safeId] === 'NOT_REQUIRED') {
                            applyStatus(safeId, null);
                            return;
                          }
                          applyStatus(safeId, 'NOT_REQUIRED');
                        }}
                      />
                      <span className="font-semibold text-gray-600">Not Required</span>
                    </label>
                  </>
                )}
              </div>

              <div className="space-y-3 text-gray-800 leading-relaxed">
                <p>
                  <strong>Discrepancy ID:</strong> {renderValue(d.discrepancy_id)}
                </p>
                <p>
                  <strong>Discrepancy Title:</strong> {renderValue(d.discrepancy_title)}
                </p>
                <p>
                  <strong>Validation Rule:</strong> {renderValue(d.validation_rule)}
                </p>
                <p>
                  <strong>Discrepancy Type:</strong> {renderValue(d.discrepancy_type)}
                </p>
                <p>
                  <strong>Severity Level:</strong> {renderValue(d.severity_level)}
                </p>
                <p>
                  <strong>Source Reference:</strong> {renderValue(d.source_reference)}
                </p>

                {d.evidence !== null && d.evidence !== undefined && typeof d.evidence === 'object' && (
                  <div>
                    <strong>Evidence:</strong>
                    <ul className="list-disc ml-6">
                      {Object.entries(d.evidence as Record<string, unknown>).map(([k, v]) => (
                        <li key={k}>
                          <strong>{k}:</strong> {renderValue(v)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p>
                  <strong>The Contradiction/Issue:</strong> {renderValue(d.contradiction_issue)}
                </p>
                <p>
                  <strong>Why This Is Problematic:</strong> {renderValue(d.why_problematic)}
                </p>
                <p>
                  <strong>Impact:</strong> {renderValue(d.impact)}
                </p>
                <p>
                  <strong>Remediation:</strong> {renderValue(d.remediation)}
                </p>
                <p>
                  <strong>Governing Rule:</strong> {renderValue(d.governing_rule)}
                </p>
              </div>
            </div>
            );
          })}
        </div>
      )}
      {/* SUMMARY STATISTICS */}
      {extraContent && <div className="p-4 pt-0">{extraContent}</div>}
      {summary_statistics && typeof summary_statistics === 'object' && (
        <div className="p-4 pt-0">
          <h2 className="text-lg text-primary font-bold mb-2">Summary Statistics</h2>
          {(() => {
            const s = summary_statistics as Record<string, unknown>;
            return (
              <>
                <p>
                  <strong>Critical Issues:</strong> {renderValue(s.critical_issues)}
                </p>
                <p>
                  <strong>High Issues:</strong> {renderValue(s.high_issues)}
                </p>
                <p>
                  <strong>Medium Issues:</strong> {renderValue(s.medium_issues)}
                </p>
                <p>
                  <strong>Low Issues:</strong> {renderValue(s.low_issues)}
                </p>
              </>
            );
          })()}
        </div>
      )}
    </>
  );
};

export default RenderJsonSummary;

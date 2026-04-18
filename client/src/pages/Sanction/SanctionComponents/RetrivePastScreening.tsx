// secure_RetrievePastScreening.tsx
/**
 * VAPT Fixes Applied:
 * [F1] Serial number input validated with allowlist regex before sending to server
 * [F2] Raw server error detail NOT shown in UI - generic message only
 * [F3] No dangerouslySetInnerHTML anywhere - pure React state rendering
 * [F4] Table cells render plain text (no HTML injection risk)
 * [F5] Loading state prevents double submission
 */

import { apiFetch } from "@/utils/apiFetch";
import { useState } from "react";

const API_BASE = import.meta.env.VITE_BACKEND_URL;

// [F1] Serial number allowlist: only alphanumeric + hyphens, max 100 chars
const SERIAL_PATTERN = /^[A-Za-z0-9\-]{1,100}$/;

interface ScreeningResult {
  serial: string;
  name: string;
  matches_found: number;
  total_records: number;
  results: any[];
}

interface NormalizedResult {
  matchingName: string;
  country: string;
  relevancy: string | number;
  matchCount: number;
  techniques: string;
  source: string;
}

const normalizeResults = (results: any[]): NormalizedResult[] => {
  return results.map((row) => ({
    matchingName: String(row["Matching Name"] ?? row.matching_name ?? ""),
    country:      String(row["Country"]       ?? row.country        ?? ""),
    relevancy:    row["Relevancy"] ?? row["Relevancy Score"] ?? row.relevancy_score ?? "",
    matchCount:   Number(row["Match Count"]   ?? row.match_count    ?? 0),
    techniques:   String(row["Techniques Used"] ?? row.techniques_used ?? ""),
    source:       String(row["Source"]        ?? row.source         ?? ""),
  }));
};

// [F4] Safe string renderer - strips any potential HTML
const safeText = (val: string | number): string =>
  String(val).replace(/</g, "&lt;").replace(/>/g, "&gt;");

const RetrievePastScreening = () => {
  const [serial, setSerial] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScreeningResult | null>(null);
  const [normalizedResults, setNormalizedResults] = useState<NormalizedResult[]>([]);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    setError("");
    setData(null);
    setNormalizedResults([]);

    // [F1] Validate serial number format client-side
    if (!serial.trim()) {
      setError("Please enter a serial number.");
      return;
    }
    if (!SERIAL_PATTERN.test(serial.trim())) {
      setError("Invalid serial number format. Only letters, numbers, and hyphens are allowed.");
      return;
    }

    // [F5] Prevent double-submit
    if (loading) return;
    setLoading(true);

    try {
      const response = await apiFetch(`${API_BASE}/api/lc/screening/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial_number: serial.trim() }),
      });

      if (!response.ok) {
        // [F2] Do NOT render raw server error detail in UI
        setError("Record not found or server error. Please check the serial number.");
        setLoading(false);
        return;
      }

      const result = await response.json();
      setData(result);
      setNormalizedResults(normalizeResults(result.results || []));
    } catch {
      // [F2] Network errors - no stack trace shown
      setError("Server not reachable. Please try again later.");
    }

    setLoading(false);
  };

  return (
    <div className="w-full p-6 space-y-6 card">
      <div className="card-header">
        <h3 className="card-title">Retrieve Past Screening</h3>
      </div>

      <div className="card-body grid gap-5">
        <p>Fetch previous results by reference number.</p>

        {/* INPUT - [F1] maxLength enforced in browser too */}
        <div className="flex items-baseline gap-2.5">
          <label className="form-label max-w-56">Serial Number</label>
          <input
            className="input"
            type="text"
            value={serial}
            maxLength={100}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="SCR-XXXX"
            autoComplete="off"
          />
        </div>

        {/* BUTTON */}
        <div className="flex justify-end">
          <button
            className="btn btn-primary"
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? "Loading..." : "Search History"}
          </button>
        </div>

        {/* ERROR - [F3] Plain text only, not dangerouslySetInnerHTML */}
        {error && <p className="text-red-600">{error}</p>}

        {/* SUMMARY */}
        {data && (
          <div className="p-4 bg-gray-100 rounded-md">
            <h4 className="font-bold mb-2">Screening Summary</h4>
            {/* [F3] All values rendered as text via JSX (safe) */}
            <p><strong>Serial:</strong> {data.serial}</p>
            <p><strong>Name:</strong> {data.name}</p>
            <p><strong>Total Matches:</strong> {data.matches_found}</p>
            <p><strong>Total Records Scanned:</strong> {data.total_records}</p>
          </div>
        )}

        {/* TABLE - [F4] safeText ensures no HTML injection via server data */}
        {normalizedResults.length > 0 && (
          <div className="mt-4">
            <h4 className="font-bold mb-2">Match Details</h4>
            <table className="table w-full border">
              <thead>
                <tr>
                  <th>Matching Name</th>
                  <th>Country</th>
                  <th>Relevancy Score</th>
                  <th>Match Count</th>
                  <th>Techniques</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {normalizedResults.map((row, idx) => (
                  <tr key={idx}>
                    <td>{safeText(row.matchingName)}</td>
                    <td>{safeText(row.country)}</td>
                    <td>{safeText(row.relevancy)}</td>
                    <td>{row.matchCount}</td>
                    <td>{safeText(row.techniques)}</td>
                    <td>{safeText(row.source)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && normalizedResults.length === 0 && (
          <p className="text-gray-500">No matches found.</p>
        )}
      </div>
    </div>
  );
};

export default RetrievePastScreening;
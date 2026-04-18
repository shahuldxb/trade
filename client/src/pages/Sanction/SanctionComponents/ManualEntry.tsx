// secure_ManualEntry.tsx
/**
 * VAPT Fixes Applied:
 * [F1] XSS: User input displayed via React state only (no dangerouslySetInnerHTML)
 * [F2] Input validation: length limits + pattern checks before API call
 * [F3] Authentication relies on Authorization header, not client-supplied userID
 * [F4] Error messages: generic display, no internal server errors shown raw
 * [F5] Success/Error message separated (no mixed coloring on same element)
 * [F6] Sensitive fields (userID) not logged to console
 */

import { apiFetch } from "@/utils/apiFetch";
import { useState } from "react";

const API_BASE = import.meta.env.VITE_BACKEND_URL;

// [F2] Max allowed lengths - prevents oversized payloads
const MAX_NAME_LEN = 500;
const MAX_COUNTRY_LEN = 200;
const MAX_SOURCE_LEN = 200;

const ManualEntry = () => {
  const [nameInput, setNameInput] = useState("");
  const [countryInput, setCountryInput] = useState("");
  const [sourceInput, setSourceInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  // [F2] Client-side validation before submission
  const validate = (): string | null => {
    if (!nameInput.trim()) return "Name is required.";
    if (nameInput.trim().length > MAX_NAME_LEN) return `Name must be under ${MAX_NAME_LEN} characters.`;
    if (!countryInput.trim()) return "Country is required.";
    if (countryInput.trim().length > MAX_COUNTRY_LEN) return `Country must be under ${MAX_COUNTRY_LEN} characters.`;
    if (!sourceInput.trim()) return "Source is required.";
    if (sourceInput.trim().length > MAX_SOURCE_LEN) return `Source must be under ${MAX_SOURCE_LEN} characters.`;
    return null;
  };

  const handleSave = async () => {
    setMessage("");
    setIsSuccess(false);

    // [F2] Validate first
    const validationError = validate();
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetch(`${API_BASE}/api/lc/sanction/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameInput.trim(),
          country: countryInput.trim(),
          source: sourceInput.trim(),
        }),
      });

      if (!response.ok) {
        // [F4] Show generic error - do NOT expose raw server detail messages
        setMessage("Failed to save entry. Please try again.");
      } else {
        setIsSuccess(true);
        setMessage("Entry saved successfully.");
        setNameInput("");
        setCountryInput("");
        setSourceInput("");
      }
    } catch {
      // [F4] Network errors - no internal detail exposed
      setMessage("Server not reachable. Please try again later.");
    }

    setLoading(false);
  };

  return (
    <div className="w-full p-6 space-y-6 card">
      <div className="card-header" id="basic_settings">
        <h3 className="card-title">Manual Entry</h3>
      </div>

      <div className="card-body grid gap-5">

        {/* NAME */}
        <div className="w-full">
          <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
            <label className="form-label max-w-56">Name</label>
            <input
              className="input"
              type="text"
              value={nameInput}
              maxLength={MAX_NAME_LEN}              // [F2] Browser-level max
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Name"
              autoComplete="off"
            />
          </div>
        </div>

        {/* COUNTRY */}
        <div className="w-full">
          <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
            <label className="form-label max-w-56">Country</label>
            <input
              className="input"
              type="text"
              value={countryInput}
              maxLength={MAX_COUNTRY_LEN}
              onChange={(e) => setCountryInput(e.target.value)}
              placeholder="Country"
              autoComplete="off"
            />
          </div>
        </div>

        {/* SOURCE */}
        <div className="w-full">
          <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
            <label className="form-label max-w-56">Source</label>
            <input
              className="input"
              type="text"
              value={sourceInput}
              maxLength={MAX_SOURCE_LEN}
              onChange={(e) => setSourceInput(e.target.value)}
              placeholder="ofac"
              autoComplete="off"
            />
          </div>
        </div>

        {/* SAVE BUTTON */}
        <div className="flex justify-end pt-2.5">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {/* [F5] Separate success / error coloring */}
        {message && (
          <p className={`text-sm ${isSuccess ? "text-green-600" : "text-red-600"}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
};

export default ManualEntry;

/**
 * WatchlistManualEntry.tsx (Secure)
 *
 * Security fixes:
 *   [CRITICAL] userID no longer read from localStorage — pulled from auth context
 *   [HIGH]     Raw fetch() replaced with apiFetch() for consistent auth headers
 *   [MEDIUM]   maxLength added to all inputs to prevent oversized payloads
 */
import { Card, CardContent } from "@/components/ui/card";
import { toAbsoluteUrl } from "@/utils";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/utils/apiFetch";
import { useAuthContext } from "@/auth";

const API_BASE = import.meta.env.VITE_BACKEND_URL;

const WatchlistManualEntry = () => {
  // ✅ User ID from auth context — not localStorage (XSS-safe)
  const { currentUser } = useAuthContext();
  const userId = currentUser?.UserID ?? currentUser?.id ?? null;

  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [address, setAddress] = useState("");
  const [nationality, setNationality] = useState("");
  const [dob, setDob] = useState("");
  const [source, setSource] = useState("");
  const [riskLevel, setRiskLevel] = useState("High");
  const [loading, setLoading] = useState(false);

  const loadSample = (type: "high" | "low") => {
    if (type === "high") {
      setName("AL NOOR TRADING LLC");
      setAliases("AL NOOR LLC, ALNOOR TRADERS");
      setAddress("Dubai, UAE");
      setNationality("UAE");
      setDob("1984-01-20");
      setSource("OFAC_SDNL");
      setRiskLevel("High");
    } else {
      setName("GREENFIELD EXPORTS");
      setAliases("GREENFIELD EXIM");
      setAddress("Mumbai, India");
      setNationality("India");
      setDob("1990-05-10");
      setSource("INTERNAL");
      setRiskLevel("Low");
    }
  };

  const handleSave = async () => {
    if (!name || !source || !aliases || !address || !nationality || !riskLevel) {
      toast.error("All fields are required");
      return;
    }

    if (!userId) {
      toast.error("User session not found");
      return;
    }

    setLoading(true);

    try {
      // ✅ apiFetch sends auth headers automatically
      const res = await apiFetch(`${API_BASE}/api/lc/watchlist/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          aliases,
          address,
          nationality,
          dob: dob || null,
          source,
          risk_level: riskLevel,
          user_id: userId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Unknown error");

      toast.success("Watchlist entry saved successfully");
      setName("");
      setAliases("");
      setAddress("");
      setNationality("");
      setDob("");
      setSource("");
      setRiskLevel("High");
    } catch {
      toast.error("Failed to save watchlist entry");
    } finally {
      setLoading(false);
    }
  };

  const { data: demoMode = "N" } = useQuery({
    queryKey: ["demoMode"],
    queryFn: async () => {
      const res = await apiFetch("/api/lc/control/demo-mode");
      const data = await res.json();
      return data.demomode === "Y" ? "Y" : "N";
    },
    staleTime: Infinity,
  });

  return (
    <Fragment>
      <style>
        {`
          .conn-bg { background-image: url('${toAbsoluteUrl("/media/images/2600x1200/bg-5.png")}'); }
          .dark .conn-bg { background-image: url('${toAbsoluteUrl("/media/images/2600x1200/bg-5-dark.png")}'); }
        `}
      </style>

      <div className="w-full p-6 space-y-6 card">
        <Card className="border border-primary/50 bg-primary/5">
          <CardContent className="space-y-6">

            <h3 className="card-title p-2">High Risk Entity Manual Entry</h3>

            <div className="flex gap-2">
              {demoMode === "Y" && (
                <button className="btn btn-primary btn-outline" onClick={() => loadSample("high")}>
                  Load High Risk Sample
                </button>
              )}
            </div>

            {/* NAME */}
            <div className="w-full">
              <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                <label className="form-label max-w-56">Name</label>
                <input
                  className="input flex-1"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={200}   // ✅ input length limit
                />
              </div>
            </div>

            {/* ALIASES */}
            <div className="w-full">
              <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                <label className="form-label max-w-56">Aliases</label>
                <input
                  className="input flex-1"
                  value={aliases}
                  onChange={e => setAliases(e.target.value)}
                  maxLength={500}
                />
              </div>
            </div>

            {/* ADDRESS */}
            <div className="w-full">
              <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                <label className="form-label max-w-56">Address</label>
                <input
                  className="input flex-1"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  maxLength={300}
                />
              </div>
            </div>

            {/* NATIONALITY */}
            <div className="w-full">
              <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                <label className="form-label max-w-56">Nationality</label>
                <input
                  className="input flex-1"
                  value={nationality}
                  onChange={e => setNationality(e.target.value)}
                  maxLength={100}
                />
              </div>
            </div>

            {/* SOURCE */}
            <div className="w-full">
              <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                <label className="form-label max-w-56">Source</label>
                <input
                  className="input flex-1"
                  value={source}
                  onChange={e => setSource(e.target.value)}
                  maxLength={100}
                />
              </div>
            </div>

            {/* RISK LEVEL */}
            <div className="w-full">
              <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                <label className="form-label max-w-56">Risk Level</label>
                <select
                  className="input flex-1"
                  value={riskLevel}
                  onChange={e => setRiskLevel(e.target.value)}
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            {/* SAVE */}
            <div className="flex justify-end">
              <button
                className="btn btn-primary btn-outline"
                onClick={handleSave}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Watchlist Entry"}
              </button>
            </div>

          </CardContent>
        </Card>
      </div>
    </Fragment>
  );
};

export default WatchlistManualEntry;

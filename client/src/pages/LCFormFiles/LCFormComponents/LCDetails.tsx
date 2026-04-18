import React, { useEffect, useState } from 'react';
const LC_NUMBER_MAX_LENGTH = 16;
interface LCFormErrors {
  lcNumber?: string;
  [key: string]: string | undefined;
}
interface LCDetailsProps {
  lcNumber: string;
  onChangeLCNumber: (value: string) => void;
  errors: LCFormErrors; // FIX 2: was `any`
}
const sanitizeMessage = (input: unknown): string => {
  if (typeof input !== 'string') return '';
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
};
const LCDetails: React.FC<LCDetailsProps> = ({
  lcNumber,
  onChangeLCNumber,
  errors,
}) => {
  const [demoMode, setDemoMode]           = useState<'Y' | 'N'>('N');
  const [demoModeReady, setDemoModeReady] = useState<boolean>(false);
  useEffect(() => {
    const controller = new AbortController();
 
    const loadDemoMode = async () => {
      try {
        const res = await fetch('/api/lc/control/demo-mode', {
          credentials: 'same-origin',               
          headers: { Accept: 'application/json' },  
          signal: controller.signal,               
        });
        if (!res.ok) throw new Error(`Demo-mode fetch failed: ${res.status}`);
        const data = (await res.json()) as { demomode: unknown };
        setDemoMode(data.demomode === 'Y' ? 'Y' : 'N');
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('[LCDetails] Failed to load demo mode:', err);
        setDemoMode('N');
      } finally {
        setDemoModeReady(true);
      }
    };
    loadDemoMode();
    return () => controller.abort();
  }, []);
  const handleLcNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = e.target.value
      .replace(/[^a-zA-Z0-9-]/g, '')         
      .slice(0, LC_NUMBER_MAX_LENGTH);          
    onChangeLCNumber(sanitized);
  };
  const lcNumberError = sanitizeMessage(errors.lcNumber);
  return (
    <div className="card pb-2.5">
      <div className="card-header p-2 flex justify-between" id="LCDetails">
        <h3 className="card-title text-md md:text-lg">LC Details</h3>
      </div>
 
      <div className="md:card-body p-2 grid gap-5">
        <div className="w-full">
          <div className="flex items-baseline flex-wrap lg:flex-nowrap">
            <label className="form-label flex items-center gap-1 max-w-40 text-sm md:text-md">
              LC/LG Number:<span className="text-danger text-xl">*</span>
            </label>
            <input
              className="input"
              type="text"
              placeholder="Enter LC/LG Number"
              value={lcNumber}
              maxLength={LC_NUMBER_MAX_LENGTH} 
              onChange={handleLcNumberChange}
              readOnly
            />
          </div>
          <div className="flex items-baseline flex-wrap lg:flex-nowrap">
            <label className="form-label flex items-center gap-1 max-w-40 text-sm md:text-md" />
            {lcNumberError && (
              <p className="text-danger text-xs mt-1">{lcNumberError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
 
export default LCDetails;

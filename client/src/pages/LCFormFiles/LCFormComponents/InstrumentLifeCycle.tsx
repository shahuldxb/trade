import React, { useState, useEffect } from 'react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectItem,
  SelectContent
} from '@/components/ui/select';
import { apiFetch } from '@/utils/apiFetch';


type Instrument = {
  instrument_type: string;
  full_name: string;
};

type LifeCycleStage = {
  lifecycle_stage: string;
  display_name: string;
};

type InstrumentLifeCycleProps = {
  instrument: string;
  lifecycle: string;
  variation?: string;
  caseStatus?: string;
  errors: {
    instrument?: string;
    lifecycle?: string;
  };
  onSelection: (instrument: string, lifecycle: string) => void;
  allowedLifeCycles?: string[];
  isAmendmentOnly?: boolean;
  hideLifecycleSelect?: boolean;
};
const sanitizeString = (input: unknown): string => {
  if (typeof input !== 'string') return '';
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
};
const isValidInstrument = (item: unknown): item is Instrument => {
  if (!item || typeof item !== 'object') return false;
  const obj = item as Record<string, unknown>;
  return typeof obj.instrument_type === 'string' && typeof obj.full_name === 'string';
};
const isValidLifeCycleStage = (item: unknown): item is LifeCycleStage => {
  if (!item || typeof item !== 'object') return false;
  const obj = item as Record<string, unknown>;
  return typeof obj.lifecycle_stage === 'string' && typeof obj.display_name === 'string';
};
const InstrumentLifeCycle = ({
  instrument,
  lifecycle,
  onSelection,
  variation,
  errors,
  allowedLifeCycles,
  caseStatus,
  isAmendmentOnly = false,
  hideLifecycleSelect = false,
}: InstrumentLifeCycleProps) => {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [lifeCycles, setLifeCycles]   = useState<LifeCycleStage[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const loadInstruments = async () => {
      try {
        const res = await apiFetch('/api/lc/instruments', { signal });
        if (!res.ok) throw new Error(`Instruments fetch failed: ${res.status}`);
        const data: unknown = await res.json();
        const validated = Array.isArray(data) ? data.filter(isValidInstrument) : [];
        setInstruments(
          validated.map((item) => ({
            instrument_type: sanitizeString(item.instrument_type),
            full_name: sanitizeString(item.full_name),
          }))
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('[InstrumentLifeCycle] Failed to load instruments:', err);
        setInstruments([]);
      }
    };

    const loadLifeCycles = async () => {
      try {
        const res = await apiFetch('/api/lc/lifecycle-stages', { signal });
        if (!res.ok) throw new Error(`Lifecycle stages fetch failed: ${res.status}`);
        const data: unknown = await res.json();
        const validated = Array.isArray(data) ? data.filter(isValidLifeCycleStage) : [];
        setLifeCycles(
          validated.map((item) => ({
            lifecycle_stage: sanitizeString(item.lifecycle_stage),
            display_name: sanitizeString(item.display_name),
          }))
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('[InstrumentLifeCycle] Failed to load lifecycle stages:', err);
        setLifeCycles([]);
      }
    };

    loadInstruments();
    loadLifeCycles();
    return () => controller.abort();
  }, []);
  const toUpper = (val: unknown): string =>
    typeof val === 'string' ? val.toUpperCase() : '';

  const filteredInstruments = instrument
    ? instruments.filter((i) => i.instrument_type === instrument)
    : instruments;

  const filteredLifeCycles = isAmendmentOnly
    ? lifeCycles.filter((lc) => toUpper(lc.lifecycle_stage) === 'AMENDMENT')
    : allowedLifeCycles && allowedLifeCycles.length > 0
      ? lifeCycles.filter((lc) =>
          allowedLifeCycles.includes(toUpper(lc.lifecycle_stage))
        )
      : lifeCycles;
  const instrumentError = sanitizeString(errors.instrument);
  const lifecycleError  = sanitizeString(errors.lifecycle);
  const safeCaseStatus = sanitizeString(caseStatus ?? '');
  const safeVariation  = sanitizeString(variation ?? '');

  return (
    <div className="card pb-2.5">
      <div className="card-header p-2" id="InstrumentLifeCycle">
        <h3 className="card-title text-md md:text-lg">Instrument and LifeCycle</h3>
      </div>
      <div className="md:card-body p-2 grid gap-5">
        <div className="w-full">
          <div className="flex items-baseline flex-wrap lg:flex-nowrap">
            <label className="form-label max-w-40 text-sm md:text-md">
              Instrument:<span className="text-danger text-xl">*</span>
            </label>
            <div className="flex flex-col w-full">
              <Select
                value={instrument}
                disabled={!!instrument}
                onValueChange={(val) => onSelection(val, lifecycle)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Instrument" />
                </SelectTrigger>
                <SelectContent>
                  {filteredInstruments.map((inst) => (
                    <SelectItem key={inst.instrument_type} value={inst.instrument_type}>
                      {inst.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {instrumentError && (
                <p className="text-danger text-xs mt-1">{instrumentError}</p>
              )}
            </div>
          </div>
        </div>
        {!hideLifecycleSelect && (
          <div className="w-full">
            <div className="flex items-baseline flex-wrap lg:flex-nowrap">
              <label className="form-label max-w-40 text-sm md:text-md">
                Life Cycle:<span className="text-danger text-xl">*</span>
              </label>
              <div className="flex flex-col w-full">
                <Select
                  value={lifecycle}
                  disabled={isAmendmentOnly}
                  onValueChange={(val) => onSelection(instrument, val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Life Cycle" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredLifeCycles.map((item) => (
                      <SelectItem key={item.lifecycle_stage} value={item.lifecycle_stage}>
                        {item.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {lifecycleError && (
                  <p className="text-danger text-xs mt-1">{lifecycleError}</p>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="w-full">
          <div className="flex items-baseline flex-wrap lg:flex-nowrap">
            <label className="form-label max-w-40 text-sm md:text-md">Case Status:</label>
            <div className="flex flex-col w-full">
              <input
                className="input"
                type="text"
                placeholder="Case Status"
                value={safeCaseStatus}
                readOnly
              />
            </div>
          </div>
        </div>
        <div className="w-full">
          <div className="flex items-baseline flex-wrap lg:flex-nowrap">
            <label className="form-label max-w-40 text-sm md:text-md">Variation:</label>
            <div className="flex flex-col w-full">
              <input
                className="input"
                type="text"
                placeholder="Variation"
                value={safeVariation}
                readOnly
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstrumentLifeCycle;

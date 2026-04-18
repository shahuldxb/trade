

import React, { useEffect, useRef, useState } from 'react';
import CustomerDetails from './LCFormComponents/CustomerDetails';
import LCDetails from './LCFormComponents/LCDetails';
import InstrumentLifeCycle from './LCFormComponents/InstrumentLifeCycle';
import Prompt from './LCFormComponents/Prompt';
import LCDocument from './LCFormComponents/LCDocument';
import SubLcDocument from './LCFormComponents/SubLcDocument';
import LCAnalysisResult from './LCFormComponents/LCAnalysisResult';
import { normalizeSubDocuments } from '../../utils/subdoc';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { lcJsonToText } from '@/utils/lcFormatter';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select';
import { toast } from 'sonner';
import { getAuthSessionItem } from '@/auth/_helpers';
type TokensInfo = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

type ModeResult = {
  request: string;
  response: string;
  analysis: string;
  tokens: TokensInfo;
};

type AnalysisResult = {
  success: boolean;
  analysis_id?: number;
  transaction_id?: string | number;
  mode1: ModeResult;
  mode2: ModeResult;
  mode3: ModeResult;
  // Security: replaced any with bounded type to prevent prototype pollution
  mode4?: Record<string, unknown>;
};

type SubDocument = {
  name: string;
  content: string;
  // Security: typed pages array prevents malformed server objects bypassing checks
  pages?: { page_no: number; text: string }[];
};

type FormErrors = {
  customerId: string;
  customerName: string;
  lcNumber: string;
  instruments: string;
  lifecycle: string;
  promptText: string;
  lcDocument: string;
  subLcDocument: string;
};

const sanitizeText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>"'`]/g, '').trim();
};

const isValidInstrument = (value: string): boolean =>
  typeof value === 'string' && /^[A-Za-z0-9 _-]{1,50}$/.test(value.trim());

const computeDocumentHashAsync = async (text: string): Promise<string> => {
  if (!text) return '';
  const encoder = new TextEncoder();
  const data = encoder.encode(text.substring(0, 50000));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `DOC-${hashHex}`;
};

const MAX_PARSE_DEPTH = 5;

const LcForm = () => {
  const { instrument } = useParams();
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [lcNumber, setLcNumber] = useState('');
  const [instruments, setInstrument] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const [promptId, setPromptId] = useState<number | null>(null);
  const [promptText, setPromptText] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isMode23Running, setIsMode23Running] = useState(false);
  const pollTimerRef = useRef<number | null>(null);
  const [availableTabs, setAvailableTabs] = useState<Array<'mode1' | 'mode2' | 'mode3' | 'mode4'>>([
    'mode1',
    'mode2',
    'mode3',
    'mode4'
  ]);
  const [lcDocument, setLcDocument] = useState('');
  const [subLcDocument, setSubLcDocument] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'mode1' | 'mode2' | 'mode3' | 'mode4'>('mode1');
  const [isActive, setIsactive] = useState<boolean | null>(null);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);
  const userID = getAuthSessionItem('userID');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [variation, setVariation] = useState('');
  const [caseLifecycleStatus, setCaseLifecycleStatus] = useState('');
  const [page, setPage] = useState<number>(1);
  const parentRef = useRef<HTMLElement | Document>(document);
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const { data: demoMode = 'N' } = useQuery<'Y' | 'N'>({
    queryKey: ['demoMode'],
    queryFn: async () => {
      const res = await fetch('/api/lc/control/demo-mode');
      const data = await res.json();
      return data.demomode === 'Y' ? 'Y' : 'N';
    },
    staleTime: Infinity
  });
  useEffect(() => {
    if (instrument && isValidInstrument(instrument)) {
      setInstrument(instrument);
    }
  }, [instrument]);

  const [errors, setErrors] = useState<FormErrors>({
    customerId: '',
    customerName: '',
    lcNumber: '',
    instruments: '',
    lifecycle: '',
    promptText: '',
    lcDocument: '',
    subLcDocument: ''
  });
  const lcDocumentToSend = lcDocument;

  const validateForm = () => {
    const newErrors: FormErrors = {
      customerId: '',
      customerName: '',
      lcNumber: '',
      instruments: '',
      lifecycle: '',
      promptText: '',
      lcDocument: '',
      subLcDocument: ''
    };
    if (!customerId.trim()) newErrors.customerId = 'Customer ID is required';
    if (!customerName.trim()) newErrors.customerName = 'Customer Name is required';
    if (!lcNumber.trim()) newErrors.lcNumber = 'LC Number is required';
    const cleanedLc = lcNumber.trim();
    if (!cleanedLc) {
      newErrors.lcNumber = 'LC Number is required';
    } else if (!/^[A-Za-z0-9-]{15}$/.test(cleanedLc)) {
      newErrors.lcNumber = 'Enter correct 16 character LC Number';
    }
    if (!instruments.trim()) newErrors.instruments = 'Instrument is required';
    if (demoMode === 'Y' && !promptText.trim()) newErrors.promptText = 'Prompt is required';

    if (!lcDocument.trim()) newErrors.lcDocument = 'LC Document is required';
    if (!hasSubDocContent(subLcDocument)) newErrors.subLcDocument = 'Sub Document is required';
    setErrors(newErrors);
    return Object.values(newErrors).every((e) => e === '');
  };
  const handleLcNumberChange = (value: string) => {
    setLcNumber(value);

    if (value.length === 0) {
      setErrors((prev) => ({
        ...prev,
        lcNumber: 'LC Number is required'
      }));
    } else if (value.length < 16) {
      setErrors((prev) => ({
        ...prev,
        lcNumber: 'Enter correct 16 digit LC Number'
      }));
    } else {
      setErrors((prev) => ({
        ...prev,
        lcNumber: ''
      }));
    }
  };

  useEffect(() => {
    const scrollableElement = document.getElementById('scrollable_content');
    if (scrollableElement) parentRef.current = scrollableElement;
  }, []);

  const parseSubDocuments = (rawInput: unknown, depth = 0): SubDocument[] => {
    if (!rawInput || depth > MAX_PARSE_DEPTH) return [];

    if (typeof rawInput === 'string') {
      const trimmed = rawInput.trim();
      if (!trimmed) return [];

      if (trimmed.includes('--- FILE:')) {
        if (rawInput.length > 500000) return [{ name: 'subdocument', content: trimmed }];
        const regex = /--- FILE: (.*?) ---\s*([\s\S]*?)(?=--- FILE:|$)/g;
        const results: SubDocument[] = [];

        let match;
        while ((match = regex.exec(rawInput)) !== null) {
          let fileName = match[1].trim();
          fileName = fileName.replace(/\.[^/.]+$/, '');

          results.push({
            name: fileName,
            content: match[2].trim()
          });
        }

        return results;
      }

      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return Object.entries(parsed as Record<string, unknown>).map(([name, pages]) => ({
            name: name.replace(/\.[^/.]+$/, ''),
            content: JSON.stringify({ [name]: pages }),
            pages: Array.isArray(pages) ? (pages as { page_no: number; text: string }[]) : []
          }));
        }
      } catch {
      }

      return [{ name: 'subdocument', content: trimmed }];
    }

    if (Array.isArray(rawInput)) {
      return rawInput.flatMap((item) => parseSubDocuments(item, depth + 1));
    }

    if (typeof rawInput === 'object') {
      return Object.entries(rawInput as Record<string, unknown>).map(([name, pages]) => ({
        name: name.replace(/\.[^/.]+$/, ''),
        content: JSON.stringify({ [name]: pages }),
        pages: Array.isArray(pages) ? (pages as { page_no: number; text: string }[]) : []
      }));
    }

    return [];
  };

  const hasSubDocContent = (rawInput: unknown): boolean => {
    if (typeof rawInput === 'string') return rawInput.trim().length > 0;
    if (Array.isArray(rawInput)) return rawInput.some((item) => hasSubDocContent(item));
    if (rawInput && typeof rawInput === 'object') return Object.keys(rawInput).length > 0;
    return false;
  };
  const parsedSubs = parseSubDocuments(subLcDocument);

  const subDocumentsPayload = parsedSubs.map((doc) => ({
    subdocument_category: doc.name,
    document_name: doc.name,
    sub_document_text: doc.content
  }));
  const fetchPrompt = async (inst: string, life: string) => {
    if (!inst || !life) return;
    try {
      const res = await fetch(
        `/api/lc/prompts?instrument_type=${encodeURIComponent(inst)}&lifecycle_stage=${encodeURIComponent(life)}`
      );
      if (!res.ok) {
        console.error('Failed to fetch prompt, status:', res.status);
        return;
      }
      const data = await res.json();
      setPromptText(data.prompt_text || '');
      setPromptId(data.prompt_id ?? null);
      setIsactive(data.is_active ?? null);
    } catch (err) {
      console.error('Failed to fetch prompt:', err);
    }
  };
  useEffect(() => {
    if (instruments && caseLifecycleStatus) {
      fetchPrompt(instruments, caseLifecycleStatus);
    }
  }, [instruments, caseLifecycleStatus]);

  const isRunAnalysisEnabled = React.useMemo(() => {
    return lcDocument.trim().length > 0 && hasSubDocContent(subLcDocument);
  }, [lcDocument, subLcDocument]);

  const emptyMode: ModeResult = {
    request: '',
    response: '',
    analysis: '',
    tokens: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };

  const getCsrfToken = (): string =>
    document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';

  const runAnalysis = async () => {
    if (!validateForm()) {
      return;
    }
    try {
      setIsAnalyzing(true);
      const parsedSubs = parseSubDocuments(subLcDocument);
      const saveRes = await fetch('/api/lc/save-tool-instrument', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
        body: JSON.stringify({
          lc_number: lcNumber,
          cifno: customerId,
          customer_name: customerName,
          instrument_type: instruments,
          lifecycle: lifecycle,
          prompt_id: promptId,
          prompt_text: promptText,
          document_hash: await computeDocumentHashAsync(lcDocument),
          main_document: lcDocument,
          sub_documents: JSON.stringify(subDocumentsPayload),
          subdocument_category: 'SubDocuments of LC',
          old_document: null,
          given_amendment: null,
          new_document: null,
          extracted_amendment: null,
          verified_amendment: null,
          UserID: userID
        })
      });
      if (!saveRes.ok) {
        console.error('Save instrument failed, status:', saveRes.status);
        toast('Failed to save tool instrument');
        return;
      }
      const saveData = await saveRes.json();
      if (!saveData.success) {
        toast('Failed to save tool instrument');
        return;
      }
      const txnId = saveData.transaction_no;
      const safeTxnId = /^[a-zA-Z0-9_-]+$/.test(String(txnId)) ? String(txnId) : null;
      if (!safeTxnId) {
        toast('Invalid transaction ID received');
        return;
      }
      const subDocsRes = await fetch('/api/lc/subdocuments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
        body: JSON.stringify({
          transaction_no: safeTxnId,
          cifno: customerId,
          instrument_type: instruments,
          lifecycle: lifecycle,
          lc_number: lcNumber,
          UserID: userID,
          documents: subDocumentsPayload
        })
      });
      if (!subDocsRes.ok) {
        console.error('Subdocuments save failed, status:', subDocsRes.status);
      }
      const presentedDocuments = parsedSubs.reduce(
        (acc, doc) => {
          acc[doc.name.toLowerCase()] =
            Array.isArray(doc.pages) && doc.pages.length > 0
              ? doc.pages
              : [{ page_no: 1, text: doc.content }];
          return acc;
        },
        {} as Record<string, unknown[]>
      );

      const mode1Res = await fetch('/api/lc/analyze-lc-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
        body: JSON.stringify({
          transaction_id: safeTxnId,
          cifno: customerId,
          lc_number: lcNumber,
          instrument: instruments,
          lifecycle: lifecycle,
          prompt: promptText,
          lc_document: lcDocumentToSend,
          sub_documents: JSON.stringify(presentedDocuments),
          prompt_id: Number(promptId),
          is_active: isActive,
          UserID: userID
        })
      });

      if (!mode1Res.ok) {
        console.error('Mode 1 analysis request failed, status:', mode1Res.status);
        toast('Mode 1 analysis failed. Please try again.');
        return;
      }
      const mode1Data = await mode1Res.json();

      if (!mode1Data.success) {
        console.error('Mode 1 analysis error:', mode1Data.error);
        toast('Mode 1 analysis failed. Please try again.');
        return;
      }

      setAnalysisResult({
        success: true,
        transaction_id: safeTxnId,
        mode1: mode1Data.mode1,
        mode2: emptyMode,
        mode3: emptyMode,
        mode4: undefined
      });
      setAvailableTabs(['mode1']);
      setActiveTab('mode1');
      setPage(5);
      toast(`Mode 1 completed\nTransaction No: ${safeTxnId}`);

      setIsAnalyzing(false);
      setIsMode23Running(true);

      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
      }
      const pollStartTime = Date.now();
      const MAX_POLL_DURATION_MS = 5 * 60 * 1000;
      pollTimerRef.current = window.setInterval(async () => {
        if (Date.now() - pollStartTime > MAX_POLL_DURATION_MS) {
          console.error('Polling timeout exceeded');
          setIsMode23Running(false);
          if (pollTimerRef.current) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          return;
        }
        try {
          const statusRes = await fetch(`/api/lc/analysis-status/${encodeURIComponent(safeTxnId)}`);
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();
          if (!statusData.success) return;

          const doneMode2 = !!statusData.mode2;
          const doneMode3 = !!statusData.mode3;
          const mode4Done = statusData.mode4_running === false;
          const mode4Error = typeof statusData.mode4_error === 'string' ? statusData.mode4_error : null;
          const safeMode4 =
            statusData.mode4 && typeof statusData.mode4 === 'object' && !Array.isArray(statusData.mode4)
              ? Object.fromEntries(
                Object.entries(statusData.mode4 as Record<string, unknown>).filter(
                  ([k]) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype'
                )
              )
              : null;

          if (statusData.mode2 || statusData.mode3 || safeMode4 || mode4Error) {
            setAnalysisResult((prev) =>
              prev
                ? {
                  ...prev,
                  mode2: statusData.mode2 ?? prev.mode2,
                  mode3: statusData.mode3 ?? prev.mode3,
                  mode4: safeMode4 ?? (mode4Error ? { error: mode4Error } : prev.mode4)
                }
                : {
                  success: true,
                  transaction_id: safeTxnId,
                  mode1: mode1Data.mode1,
                  mode2: statusData.mode2 ?? emptyMode,
                  mode3: statusData.mode3 ?? emptyMode,
                  mode4: safeMode4 ?? (mode4Error ? { error: mode4Error } : undefined)
                }
            );
          }

          if (doneMode2) {
            setAvailableTabs((prev) => (prev.includes('mode2') ? prev : [...prev, 'mode2']));
          }
          if (doneMode3) {
            setAvailableTabs((prev) => (prev.includes('mode3') ? prev : [...prev, 'mode3']));
          }
          if (safeMode4 || mode4Error) {
            setAvailableTabs((prev) => (prev.includes('mode4') ? prev : [...prev, 'mode4']));
          }

          if (doneMode2 && doneMode3 && mode4Done) {
            setIsMode23Running(false);
            await fetch(`/api/lc/update-status/${encodeURIComponent(safeTxnId)}`, {
              method: 'PUT',
              headers: { 'X-CSRF-Token': getCsrfToken() }
            });
            toast(`Analysis completed\nTransaction No: ${safeTxnId}`);
            if (pollTimerRef.current) {
              window.clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
          }
        } catch (err) {
          console.error('Error polling status:', err);
        }
      }, 2500);
    } catch (err) {
      console.error('Error:', err);
      toast('Something went wrong during analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };
  const generateSample = async (sampleType: 'clean' | 'discrepant') => {
    if (!instruments || !lifecycle) {
      toast('Please select Instrument and Life Cycle');
      return;
    }

    try {
      setIsGeneratingSample(true);
      const res = await fetch('/api/lc/sample_generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
        body: JSON.stringify({
          instrument: instruments,
          lifecycle: Number(lifecycle),
          sample_type: sampleType
        })
      });

      const data = await res.json();
      if (!data.success) {
        toast('Sample generation failed');
        return;
      }
      setLcDocument(data.primary_document || '');

      const normalizedSubs = normalizeSubDocuments(data.sub_documents);
      const combined = normalizedSubs
        .map((d) => {
          const content = d.pages.map((p) => p.text || '').join('\n\n');
          return `\n\n--- FILE: ${d.docType} ---\n${content}`;
        })
        .join('');

      setSubLcDocument(combined);
    } catch (err) {
      console.error(err);
      toast('Error generating sample');
    } finally {
      setIsGeneratingSample(false);
    }
  };
  useEffect(() => {
    fetch('/api/lc/cases/ids')
      .then((res) => res.json())
      .then(async (data) => {
        if (data.success) {
          const validated = (data.case_ids as unknown[]).filter(
            (x): x is string => typeof x === 'string'
          );
          const nonAmendmentCaseIds = await Promise.all(
            validated.map(async (caseId: string) => {
              try {
                const safeCaseId = encodeURIComponent(caseId.replace(/[^A-Za-z0-9\-_]/g, ''));
                const res = await fetch(`/api/lc/cases/${safeCaseId}`);
                if (!res.ok) return null;
                const caseData = await res.json();
                const record = caseData.records?.[0];
                return sanitizeText(record?.lifecycle).toUpperCase() !== 'AMENDMENT' ? caseId : null;
              } catch (err) {
                console.error(`Failed to load case details for ${caseId}`, err);
                return null;
              }
            })
          );
          setCaseIds(nonAmendmentCaseIds.filter((id): id is string => typeof id === 'string'));
        }
      })
      .catch((err) => console.error('Failed to load case IDs:', err));
  }, []);

  const handleCaseChange = async (caseId: string) => {
    setSelectedCaseId(caseId);
    if (!caseId || caseId === 'ALL') {
      setLcDocument('');
      setSubLcDocument('');
      return;
    }
    try {
      const safeCaseId = encodeURIComponent(caseId.replace(/[^A-Za-z0-9\-_]/g, ''));
      const res = await fetch(`/api/lc/cases/${safeCaseId}`);
      const data = await res.json();
      if (data.success) {
        const record = data.records?.[0];
        if (!record) return;
        setCustomerId(sanitizeText(record.customer_ID));
        setCustomerName(sanitizeText(record.customer_name));
        setAccountName(sanitizeText(record.accountName));
        setAccountNumber(sanitizeText(record.cifno));
        setVariation(sanitizeText(record.variations));
        setCaseLifecycleStatus(sanitizeText(record.lifecycle));
        setLifecycle(sanitizeText(record.lifecycle));
        setLcNumber(sanitizeText(record.lc_number).replace(/[^A-Za-z0-9-]/g, ''));
        const lcText =
          typeof data.main_document === 'string'
            ? data.main_document
            : lcJsonToText(data.main_document);
        setLcDocument(lcText);
        setSubLcDocument(data.sub_documents || '');
      }
    } catch (err) {
      console.error('Failed to fetch case details', err);
    }
  };
  const nextPage = () => {
    setPage((p) => {
      if (demoMode !== 'Y' && p === 1) return 3;
      return Math.min(p + 1, 6);
    });
  };
  const prevPage = () => {
    setPage((p) => {
      if (demoMode !== 'Y' && p === 3) return 1;
      return Math.max(p - 1, 1);
    });
  };
  const isPage1Valid = () => {
    return (
      selectedCaseId.trim() !== '' &&
      customerId.trim() !== '' &&
      customerName.trim() !== '' &&
      accountName.trim() !== '' &&
      accountNumber.trim() !== '' &&
      /^[A-Za-z0-9-]{15}$/.test(lcNumber.trim()) &&
      instruments.trim() !== '' &&
      lifecycle.trim() !== ''
    );
  };
  const isPage2Valid = () => {
    return promptText.trim() !== '';
  };
  const isPage3Valid = () => {
    return lcDocument.trim() !== '';
  };
  const isPage4Valid = () => {
    return (
      hasSubDocContent(subLcDocument) && analysisResult !== null && analysisResult.success === true
    );
  };
  const canGoNext = React.useMemo(() => {
    switch (page) {
      case 1:
        return isPage1Valid();
      case 2:
        return isPage2Valid();
      case 3:
        return isPage3Valid();
      case 4:
        return isPage4Valid();
      default:
        return false;
    }
  }, [
    page,
    selectedCaseId,
    customerId,
    customerName,
    accountName,
    accountNumber,
    lcNumber,
    instruments,
    lifecycle,
    promptText,
    lcDocument,
    subLcDocument,
    analysisResult
  ]);

  const PageNavigation = () => (
    <div className="flex justify-between mt-6">
      <button disabled={page === 1} onClick={prevPage} className="btn btn-secondary">
        Previous
      </button>

      {page < 6 && page !== 5 && (
        <button
          onClick={nextPage}
          disabled={!canGoNext}
          className={`btn btn-primary ${!canGoNext ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Next
        </button>
      )}
    </div>
  );

  const loadSampleCaseID = () => {
    const sampleId = 'CASE-LC-20260121-0086';
    setSelectedCaseId(sampleId);
    handleCaseChange(sampleId);
  };

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="w-full p-6 space-y-6 card h-full">
      <div className="flex grow gap-5 lg:gap-7.5">
        <div className="flex flex-col items-stretch grow gap-3   lg:gap-3">
          {page === 1 && (
            <div className="space-y-4">
              <div className='card'>
                <div className="md:card-body p-2 grid gap-5">
                  <div className="w-full">
                    <p className="font-bold">This LC Discrepancy Analysis is a validation workspace that captures the Main LC and SUB documents, then detects discrepancies through four layers of review:
                    </p><ol className='list-disc ml-8 mt-2'>
                      <li>Own Standards Validation</li>
                      <li>Cross Document Validation</li>
                      <li>Multihop Intelligent RAG validation</li>
                      <li>MOC validation</li>
                    </ol>
                  </div>
                </div>
              </div>
              <div className="card pb-2.5">
                <div className="card-header p-2" id="InstrumentLifeCycle">
                  <h3 className="card-title text-md md:text-lg">Case ID</h3>
                  {demoMode === 'Y' && (
                    <button
                      type="button"
                      className="btn btn-outline btn-primary"
                      onClick={loadSampleCaseID}
                    >
                      Load Sample CaseID
                    </button>
                  )}
                </div>
                <div className="md:card-body p-2 grid gap-5">
                  <div className="w-full">
                    <div className="flex items-baseline flex-wrap lg:flex-nowrap">
                      <label className="form-label max-w-40 text-sm md:text-md">
                        Case ID:<span className="text-danger text-xl">*</span>
                      </label>
                      <div className="flex flex-col w-full">
                        <Select value={selectedCaseId} onValueChange={handleCaseChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Case ID" />
                          </SelectTrigger>

                          <SelectContent>
                            {caseIds.map((id) => (
                              <SelectItem key={id} value={id}>
                                {id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <CustomerDetails
                  errors={errors}
                  customerId={customerId}
                  customerName={customerName}
                  setCustomerName={setCustomerName}
                  accountName={accountName}
                  accountNumber={accountNumber}
                  setAccountName={setAccountName}
                  setAccountNumber={setAccountNumber}
                  onChange={(field, value) => {
                    if (field === 'customerId') setCustomerId(value);
                    else setCustomerName(value);
                  }}
                />
              </div>
              <div>
                <LCDetails
                  lcNumber={lcNumber}
                  onChangeLCNumber={handleLcNumberChange}
                  errors={errors}
                />
              </div>
              <div>
                <InstrumentLifeCycle
                  instrument={instruments}
                  lifecycle={lifecycle}
                  variation={variation}
                  caseStatus={caseLifecycleStatus}
                  errors={{ instrument: errors.instruments, lifecycle: errors.promptText }}
                  hideLifecycleSelect={true}
                  onSelection={(inst, life) => {
                    setInstrument(inst);
                    setLifecycle(life);
                    setErrors((prev) => ({
                      ...prev,
                      instrument: inst ? '' : prev.instruments,
                      lifecycle: life ? '' : prev.lifecycle
                    }));
                    fetchPrompt(inst, life);
                  }}
                />
              </div>
              <PageNavigation />
            </div>
          )}
          {page === 2 && demoMode === 'Y' && (
            <>
              <div>
                <Prompt promptText={promptText} />
              </div>
              <PageNavigation />
            </>
          )}
          {page === 3 && (
            <>
              <div id="LCDocument">
                <LCDocument
                  value={lcDocument}
                  generateSample={generateSample}
                  isGenerating={isGeneratingSample}
                  onDocumentExtracted={(txt) => {
                    setLcDocument(txt);

                    if (txt.trim()) {
                      setErrors((prev) => ({ ...prev, lcDocument: '' }));
                    }
                  }}
                  lifecycle={lifecycle}
                />
              </div>
              <PageNavigation />
            </>
          )}
          {page === 4 && (
            <>
              <div>
                <SubLcDocument subDocumentText={subLcDocument} />
              </div>

              <div className="flex justify-center">
                <button
                  onClick={runAnalysis}
                  disabled={isAnalyzing || !isRunAnalysisEnabled}
                  className={`btn btn-primary btn-outline font-bold w-auto mt-4 ${isAnalyzing || !isRunAnalysisEnabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                >
                  {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
                </button>
              </div>
              <PageNavigation />
            </>
          )}
          {isAnalyzing && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
              <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent"></div>
                <p className="text-white text-lg font-semibold">Analyzing LC Document...</p>
              </div>
            </div>
          )}
          {page === 5 && (
            <>
              <LCAnalysisResult
                activeTab={activeTab}
                analysisResult={analysisResult}
                setActiveTab={setActiveTab}
                availableTabs={availableTabs}
                isMode23Running={isMode23Running}
                cifno={customerId}
                lcNumber={lcNumber}
                instrument={instruments}
                lifecycle={lifecycle}
                isActive={isActive}
                userId={userID ? Number(userID) : null}
                lcDocument={lcDocument}
                subLcDocument={subLcDocument}
              />
              <PageNavigation />
            </>
          )}
        </div>
      </div>
    </div>

  );
};

export default LcForm;

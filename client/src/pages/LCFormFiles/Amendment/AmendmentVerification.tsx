import CustomerDetails from '../LCFormComponents/CustomerDetails';
import React, { useEffect, useRef, useState } from 'react';
import LCDetails from '../LCFormComponents/LCDetails';
import InstrumentLifeCycle from '../LCFormComponents/InstrumentLifeCycle';
import Prompt from '../LCFormComponents/Prompt';
import LCDocument from '../LCFormComponents/LCDocument';
import SubLcDocument from '../LCFormComponents/SubLcDocument';
import axios from 'axios';
import { normalizeSubDocuments } from '../../../utils/subdoc';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import LCAnalysisResult from '../LCFormComponents/LCAnalysisResult';
import { lcJsonToText } from '@/utils/lcFormatter';
import { toast } from 'sonner';
import { getAuthSessionItem } from '@/auth/_helpers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../../components/ui/select';

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
  mode4?: Record<string, unknown>;
};
type ChangeDetected = {
  field: string;
  old_value: string;
  new_value: string;
  change_type: string;
};
type SubDoc = {
  code: string;
  name: string;
  category: string;
  content: string;
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

const AmendmentVerification = () => {
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
  const [subLcDocument, setSubLcDocument] = useState<any>('');
  const [activeTab, setActiveTab] = useState<'mode1' | 'mode2' | 'mode3' | 'mode4'>('mode1');
  const [isActive, setIsactive] = useState<boolean | null>(null);
  const isIssuance = ['ISSUANCE', 'PAYMENT', 'PRESENTATION'].includes(
    lifecycle?.toUpperCase() ?? ''
  );
  const isAmendment = ['AMENDMENT'].includes(lifecycle?.toUpperCase() ?? '');
  const [newLc, setNewLc] = useState('');
  const [oldLc, setOldLc] = useState('');
  const [subDocsNew, setSubDocsNew] = useState<string[]>([]);
  const [amendment, setAmendment] = useState('');
  const [extracted, setExtracted] = useState<any>(null);
  const [verified, setVerified] = useState<any>(null);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);
  const [subDocsOld, setSubDocsOld] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showNewLc, setShowNewLc] = useState(false);
  const [showVerifyLC, setShowVerifyLC] = useState(false);
  const [isVerificationDone, setIsVerificationDone] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [variation, setVariation] = useState('');
  const [caseLifecycleStatus, setCaseLifecycleStatus] = useState('');
  const [page, setPage] = useState<number>(1);
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
    fetch('/api/lc/cases/ids')
      .then((res) => res.json())
      .then(async (data) => {
        if (data.success && Array.isArray(data.case_ids)) {
          const validCaseIds = data.case_ids.filter((id: unknown): id is string => typeof id === 'string');
          const amendmentCaseIds = await Promise.all(
            validCaseIds.map(async (caseId: string) => {
              try {
                const res = await fetch(`/api/lc/cases/${encodeURIComponent(caseId)}`);
                if (!res.ok) return null;
                const caseData = await res.json();
                const record = caseData.records?.[0];
                return sanitizeText(record?.lifecycle).toUpperCase() === 'AMENDMENT' ? caseId : null;
              } catch (err) {
                console.error(`Failed to load case details for ${caseId}`, err);
                return null;
              }
            })
          );
          setCaseIds(amendmentCaseIds.filter((id): id is string => typeof id === 'string'));
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (instrument && isValidInstrument(instrument)) {
      setInstrument(instrument);
    }
  }, [instrument]);

  useEffect(() => {
    if (instruments && lifecycle) {
      fetchPrompt(instruments, lifecycle);
    }
  }, [instruments, lifecycle]);

  useEffect(() => {
    if (analysisResult?.success) {
      setPage(9);
    }
  }, [analysisResult]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  const isRunAnalysisEnabled = React.useMemo(() => {
    if (isIssuance) {
      return lcDocument.trim().length > 0 && hasSubDocContent(subLcDocument);
    }

    if (isAmendment) {
      return (
        newLc.trim().length > 0 &&
        Array.isArray(subDocsNew) &&
        subDocsNew.some((doc) => doc.trim().length > 0)
      );
    }

    return false;
  }, [isIssuance, isAmendment, lcDocument, subLcDocument, newLc, subDocsNew]);

  const [errors, setErrors] = useState({
    customerId: '',
    customerName: '',
    lcNumber: '',
    instruments: '',
    lifecycle: '',
    promptText: '',
    lcDocument: '',
    subLcDocument: ''
  });
  const lcDocumentToSend = isAmendment ? newLc : lcDocument;
  const emptyMode: ModeResult = {
    request: '',
    response: '',
    analysis: '',
    tokens: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };

  const handleLcNumberChange = (value: string) => {
    setLcNumber(value);

    if (value.length === 0) {
      setErrors((prev) => ({
        ...prev,
        lcNumber: 'LC Number is required'
      }));
    } else if (value.length < 15) {
      setErrors((prev) => ({
        ...prev,
        lcNumber: 'Enter correct 15 digit LC Number'
      }));
    } else {
      setErrors((prev) => ({
        ...prev,
        lcNumber: ''
      }));
    }
  };

  const parentRef = useRef<HTMLElement | Document>(document);

  useEffect(() => {
    const scrollableElement = document.getElementById('scrollable_content');
    if (scrollableElement) parentRef.current = scrollableElement;
  }, []);

  const parseSubDocuments = (rawInput: any, depth = 0): { name: string; content: string; pages?: any[] }[] => {
    if (!rawInput || depth > MAX_PARSE_DEPTH) return [];

    if (typeof rawInput === 'string') {
      const trimmed = rawInput.trim();
      if (!trimmed) return [];

      if (trimmed.includes('--- FILE:')) {
        if (rawInput.length > 500000) return [{ name: 'subdocument', content: trimmed.substring(0, 500000) }];
        const regex = /--- FILE: (.*?) ---\s*([\s\S]*?)(?=--- FILE:|$)/g;
        const results: { name: string; content: string; pages?: any[] }[] = [];

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
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return Object.entries(parsed).map(([name, pages]) => ({
            name: name.replace(/\.[^/.]+$/, ''),
            content: JSON.stringify({ [name]: pages }),
            pages: Array.isArray(pages) ? pages : []
          }));
        }
      } catch {
        // fall through to plain text
      }

      return [{ name: 'subdocument', content: trimmed }];
    }

    if (Array.isArray(rawInput)) {
      return rawInput.flatMap((item) => parseSubDocuments(item, depth + 1));
    }

    if (typeof rawInput === 'object') {
      return Object.entries(rawInput).map(([name, pages]) => ({
        name: name.replace(/\.[^/.]+$/, ''),
        content: JSON.stringify({ [name]: pages }),
        pages: Array.isArray(pages) ? pages : []
      }));
    }

    return [];
  };

  const hasSubDocContent = (rawInput: any): boolean => {
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
      // Security: encode params to prevent query injection
      const params = new URLSearchParams({ instrument_type: inst, lifecycle_stage: life });
      const res = await fetch(`/api/lc/prompts?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch prompt');
      const data = await res.json();
      setPromptText(data.prompt_text || '');
      setPromptId(data.prompt_id ?? null);
      setIsactive(data.is_active ?? null);
    } catch (err) {
      console.error('Failed to fetch prompt', err);
    }
  };

  // Security: validate userID is numeric before use
const userID = getAuthSessionItem('userID');
  const getCsrfToken = (): string =>
    document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';


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

  const handleGenerate = async () => {
    if (!lcDocument || !amendment || isLoading) return;
    const subDocsCombined = parsedSubs.map((d) => d.content).join('\n\n-----END-DOC-----\n\n');
    const payload = {
      instrument_type: 'LC',
      old_lc: lcDocument,
      sub_docs_old: subDocsCombined,
      mt_amendment: amendment
    };
    try {
      setIsLoading(true);
      const resp = await axios.post('/api/lc/generate', payload, {
        headers: { 'X-CSRF-Token': getCsrfToken() }
      });

      const newLcValue = resp.data.new_lc || '';
      setNewLc(newLcValue);
      const generatedSubDocs = Array.isArray(resp.data.sub_docs_new)
        ? resp.data.sub_docs_new
        : resp.data.sub_docs_new
          ? [resp.data.sub_docs_new]
          : [];
      const merged = [...subDocsOld, ...generatedSubDocs];
      const uniqueSubDocs = Array.from(new Set(merged));
      setSubDocsNew(uniqueSubDocs);
      setShowNewLc(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  const loadAmendmentSample = async () => {
    if (!instruments) {
      toast('Please select instrument');
      return;
    }
    if (!isValidInstrument(instruments)) {
      toast('Invalid instrument selected');
      return;
    }
    const url = `/trade_finance_samples/samples/${encodeURIComponent(instruments)}/amendment.txt`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Sample not found');

      const text = await response.text();
      setAmendment(text);
    } catch (err) {
      console.error('Amendment sample load failed', err);
      toast('No amendment sample found for the selected instrument');
    }
  };
  const parseMT = (mt: string) => {
    const lines = mt.split('\n');
    const fields: { tag: string; value: string }[] = [];

    let current: any = null;

    lines.forEach((line) => {
      const match = line.match(/^:(\d+[A-Z]?):\s*(.*)$/);

      if (match) {
        if (current) fields.push(current);
        current = { tag: match[1], value: match[2] };
      } else if (current) {
        current.value += '\n' + line;
      }
    });

    if (current) fields.push(current);
    return fields;
  };
  const handleExtract = async () => {
    if (!lcDocument || !newLc || isExtracting) return;
    const payload = {
      old_lc: oldLc,
      new_lc: newLc,
      instrument_type: 'LC'
    };
    try {
      setIsExtracting(true);

      const resp = await axios.post('/api/lc/extract', payload, {
        headers: { 'X-CSRF-Token': getCsrfToken() }
      });
      const extractedValue = resp.data.extracted || null;
      setExtracted(extractedValue);
      setShowVerifyLC(true);
    } catch (err) {
      console.error('Error extracting amendment:', err);
      toast('Error extracting amendment');
    } finally {
      setIsExtracting(false);
    }
  };
  const handleVerify = async () => {
    if (!amendment || !extracted || isVerifying) return;

    const payload = {
      instrument_type: 'LC',
      old_lc: lcDocument,
      new_lc: newLc,
      mt_amendment: amendment,
      extracted_amendment: extracted
    };
    try {
      setIsVerifying(true);
      const resp = await axios.post('/api/lc/verify', payload, {
        headers: { 'X-CSRF-Token': getCsrfToken() }
      });
      const verifiedValue = resp.data.verified || null;
      setVerified(verifiedValue);
      setIsVerificationDone(true);
    } catch (err) {
      console.error(err);
      toast('Error verifying amendment');
    } finally {
      setIsVerifying(false);
    }
  };
  useEffect(() => {
    setLifecycle('AMENDMENT');
  }, []);
  const runAnalysis = async () => {
    try {
      setIsAnalyzing(true);
      const parsedSubs = parseSubDocuments(subLcDocument);
      const subDocsCombined = parsedSubs.map((d) => d.content).join('\n\n-----END-DOC-----\n\n');
      const lcSubDocumentToSend = isAmendment ? subLcDocument : subDocsCombined || '';
      const combinedLcDocument = `
ORIGINAL LC:
${lcDocument || ''}

--------------------

NEW LC (POST-AMENDMENT):
${newLc || ''}
`.trim();
      const documentHash = await computeDocumentHashAsync(lcDocument);
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
          document_hash: documentHash,
          main_document: combinedLcDocument,
          sub_documents: JSON.stringify(subDocumentsPayload),
          subdocument_category: 'SubDocuments of LC',
          old_document: lcDocument,
          given_amendment: amendment,
          new_document: newLc,
          extracted_amendment: extracted ? JSON.stringify(extracted) : null,
          verified_amendment: verified ? JSON.stringify(verified) : null,
          UserID: userID
        })
      });
      if (!saveRes.ok) {
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
      const subRes = await fetch('/api/lc/subdocuments', {
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
      if (!subRes.ok) {
        console.error('Failed to save subdocuments');
      }
      const presentedDocuments = parsedSubs.reduce(
        (acc, doc) => {
          acc[doc.name.toLowerCase()] =
            Array.isArray(doc.pages) && doc.pages.length > 0
              ? doc.pages
              : [{ page_no: 1, text: doc.content }];
          return acc;
        },
        {} as Record<string, any[]>
      );
      const res = await fetch('/api/lc/analyze-lc-async', {
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
      if (!res.ok) {
        toast('Analysis request failed');
        return;
      }
      const data = await res.json();

      if (!data.success) {
        console.error('Analysis failed:', data.error);
        toast('Analysis failed');
        return;
      }
      setAnalysisResult({
        success: true,
        transaction_id: safeTxnId,
        mode1: data.mode1,
        mode2: emptyMode,
        mode3: emptyMode,
        mode4: undefined
      });
      setAvailableTabs(['mode1']);
      setActiveTab('mode1');
      setPage(8);
      toast(`Mode 1 completed\nTransaction No: ${safeTxnId}`);

      setIsMode23Running(true);

      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
      }
      const pollStartTime = Date.now();
      const MAX_POLL_DURATION_MS = 5 * 60 * 1000;
      pollTimerRef.current = window.setInterval(async () => {
        if (Date.now() - pollStartTime > MAX_POLL_DURATION_MS) {
          console.error('Polling timeout reached');
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
          const mode4Error = statusData.mode4_error;

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
                    mode1: data.mode1,
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

  const loadSampleLC = () => {
    const sampleLC = 'LC202401150001';
    setLcNumber(sampleLC);
    setErrors((prev: any) => ({
      ...prev,
      lcNumber: ''
    }));
  };
  const handleCaseChange = async (caseId: string) => {
    setSelectedCaseId(caseId);

    if (!caseId || caseId === 'ALL') {
      setLcDocument('');
      setSubLcDocument('');
      return;
    }

    try {
      // Security: encode caseId to prevent URL path injection
      const res = await fetch(`/api/lc/cases/${encodeURIComponent(caseId)}`);
      if (!res.ok) throw new Error('Failed to fetch case details');
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
        setLcNumber((sanitizeText(record.lc_number)).replace(/[^A-Za-z0-9-]/g, ''));
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
  const TOTAL_PAGES = 9;

  const nextPage = () => {
    setPage((p) => {
      if (demoMode !== 'Y' && p === 1) return 3;
      return Math.min(p + 1, TOTAL_PAGES);
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
      lcNumber.trim().length === 15 &&
      instruments.trim() !== '' &&
      lifecycle.trim() !== ''
    );
  };

  const canGoNext = React.useMemo(() => {
    switch (page) {
      case 1:
        return isPage1Valid();

      case 2:
        return promptText.trim() !== '';

      case 3:
        return lcDocument.trim() !== '';

      case 4:
        return hasSubDocContent(subLcDocument);

      case 5:
        return showNewLc;

      case 6:
        return extracted !== null;

      case 7:
        return isVerificationDone;

      case 8:
        return analysisResult?.success === true;

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
    lcDocument,
    subLcDocument,
    showNewLc,
    extracted,
    isVerificationDone,
    analysisResult
  ]);

  const PageNavigation = () => (
    <div className="flex justify-between mt-6">
      <button disabled={page === 1} onClick={prevPage} className="btn btn-secondary">
        Previous
      </button>

      {page < TOTAL_PAGES && (
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
    const sampleId = 'CASE-LC-20260121-0088';
    setSelectedCaseId(sampleId);
    handleCaseChange(sampleId);
  };

  return (
    <div className="w-full p-6 space-y-6 card">
      {page === 1 && (
        <div className="space-y-4">
           <div className='card'>
                <div className="md:card-body p-2 grid gap-5">
                  <div className="w-full">
                    <p className="font-bold">Amendment Verification to review and validate revised LC information, identify mismatches, and ensure the amendment is ready for processing.
                    </p>

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
                  Load Sample Case ID
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
          <LCDetails lcNumber={lcNumber} onChangeLCNumber={handleLcNumberChange} errors={errors} />

          <InstrumentLifeCycle
            instrument={instruments}
            lifecycle={lifecycle}
            variation={variation} //  ADD
            caseStatus={caseLifecycleStatus}
            errors={errors}
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
          <LCDocument
            value={lcDocument}
            generateSample={generateSample}
            isGenerating={isGeneratingSample}
            error={errors.lcDocument}
            onDocumentExtracted={(txt) => {
              setLcDocument(txt);

              if (txt.trim()) {
                setErrors((prev) => ({ ...prev, lcDocument: '' }));
              }
            }}
          />
          <PageNavigation />
        </>
      )}
      {page === 4 && (
        <div>
          <SubLcDocument subDocumentText={subLcDocument} />
          <PageNavigation />
        </div>
      )}
      {page === 5 && (
        <>
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle>Amendment</CardTitle>
              <Button onClick={loadAmendmentSample}>Load Sample</Button>
            </CardHeader>
            <CardContent>
              <textarea
                className="textarea"
                value={amendment}
                rows={16}
                onChange={(e) => setAmendment(e.target.value)}
                placeholder="Paste amendment text here..."
              />
              <Button
                disabled={!lcDocument || !amendment || isLoading}
                onClick={async () => {
                  await handleGenerate();
                }}
                className="mt-5"
              >
                {isLoading && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                {isLoading
                  ? `Generating ${instruments || 'None'}...`
                  : `Generate New ${instruments || 'None'}`}
              </Button>
            </CardContent>
          </Card>

          {showNewLc && (
            <Card>
              <CardHeader>
                <CardTitle>New {instruments || 'None'} </CardTitle>
              </CardHeader>
              <CardContent className="flex-row gap-4">
                <div className="flex-1">
                  <textarea
                    className="textarea"
                    value={newLc}
                    rows={16}
                    onChange={(e) => setNewLc(e.target.value)}
                    placeholder={`Generated New ${instruments || 'None'}...`}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <PageNavigation />
        </>
      )}
      {page === 8 && (
        <>
          {showNewLc && (
            <div>
              <SubLcDocument subDocumentText={subLcDocument} />
            </div>
          )}
          <div className="flex justify-center">
            <button
              onClick={runAnalysis}
              className={`btn btn-primary btn-outline font-bold mt-4 ${
                isAnalyzing || !isRunAnalysisEnabled ? 'opacity-50 cursor-not-allowed' : ''
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
      {page === 6 && (
        <>
          {showNewLc && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Extract Amendment</CardTitle>
                <Button disabled={!lcDocument || !newLc || isExtracting} onClick={handleExtract}>
                  {isExtracting && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  {isExtracting ? 'Extracting...' : 'Extract Amendment'}
                </Button>
              </CardHeader>
              <CardContent>
                {extracted?.ll_json &&
                  (() => {
                    let jsonStr = extracted.ll_json.replace(/^```json\s*/, '').replace(/```$/, '');

                    let data: any = {};

                    try {
                      data = JSON.parse(jsonStr);
                    } catch (err) {
                      console.error('Failed to parse amendment JSON:', err);
                    }
                    const mtFields = parseMT(data.mt_format_amendment);
                    const usage = extracted.usage || {};
                    return (
                      <div className="mt-2 p-4 border rounded-lg max-w-full scrollable-x-auto">
                        <p className="font-semibold mb-1 text-primary text-lg">
                          Amendment Summary:
                        </p>
                        <p className="text-md">{data.amendment_summary}</p>
                        <p className="font-semibold mt-3 mb-1 text-primary text-lg">
                          Changes Detected:
                        </p>
                        <ul className="list-disc list-inside text-md">
                          {data.changes_detected?.map((change: ChangeDetected, idx: number) => (
                            <li key={idx}>
                              <span className="font-semibold">{change.field}:</span>{' '}
                              {change.old_value} → {change.new_value} ({change.change_type})
                            </li>
                          ))}
                        </ul>

                        <p className="font-semibold mt-3 mb-1 text-primary text-lg">
                          Verbose Amendment:
                        </p>
                        <p className="text-md">{data.verbose_amendment}</p>

                        <p className="font-semibold mt-3 mb-1 text-primary text-lg">MT Format:</p>
                        <div className="min-w-full mt-3 mb-1 ">
                          <div className="card-table">
                            <table className="table align-middle text-gray-700 font-medium text-sm">
                              <tbody>
                                {mtFields.map((f, i) => (
                                  <tr key={i}>
                                    <td>:{f.tag}:</td>
                                    <td>{f.value}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <p className="font-semibold mt-3 mb-1 text-primary text-lg">Fields Used:</p>
                        <p className="text-md">{data.mt_fields_used?.join(', ')}</p>

                        <p className="font-semibold mt-3 mb-1 text-primary text-lg">
                          Total Changes:
                        </p>
                        <p className="text-md">{data.total_changes}</p>
                        <p className="font-semibold mt-3 mb-1 text-primary text-lg">Confidence:</p>
                        <p className="text-md">{data.confidence}</p>
                        <p className="font-semibold mt-3 mb-1 text-primary text-lg">Token Usage:</p>
                        <ul className="list-disc list-inside text-md">
                          <li className="font-semibold">
                            <span className="text-primary font-bold mr-1">Prompt Tokens:</span>
                            {usage.prompt_tokens ?? 0}
                          </li>
                          <li className="font-semibold">
                            <span className="text-primary font-bold mr-1">Completion Tokens:</span>
                            {usage.completion_tokens ?? 0}
                          </li>
                          <li className="font-semibold">
                            <span className="text-primary font-bold mr-1">Total Tokens:</span>
                            {usage.total_tokens ?? 0}
                          </li>
                        </ul>
                      </div>
                    );
                  })()}
              </CardContent>
            </Card>
          )}

          <PageNavigation />
        </>
      )}
      {page === 7 && (
        <>
          {showVerifyLC && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Verify Amendment</CardTitle>

                <Button
                  disabled={!amendment || !extracted || isVerifying}
                  onClick={async () => {
                    await handleVerify();
                  }}
                >
                  {isVerifying && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  {isVerifying ? 'Verifying...' : 'Verify Amendment'}
                </Button>
              </CardHeader>
              <CardContent>
                {verified && (
                  <div className="mt-2 p-4 border rounded-lg ">
                    <p className="font-semibold mb-1 text-primary text-lg ">
                      Verification Status:{' '}
                      <span className="text-gray-600 text-md font-semibold">
                        {verified.verification_status}
                      </span>
                    </p>
                    <p className="font-semibold mb-1 text-primary text-lg">
                      Overall Confidence:{' '}
                      <span className="text-gray-600 text-md font-semibold">
                        {verified.overall_confidence}
                      </span>
                    </p>
                    <p className="font-semibold mb-1 text-primary text-lg">Verification Report:</p>
                    <p className="whitespace-pre-wrap text-md">{verified.verification_report}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <PageNavigation />
        </>
      )}
      {page === 9 && (
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
  );
};

export default AmendmentVerification;

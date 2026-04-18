import { useState, useEffect } from 'react';
import DataTable from '../FrameworkComponent/DataTable';
import type { Column } from '../FrameworkComponent/DataTable';
import { RefreshCw } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/utils/apiFetch';



const API_BASE = import.meta.env.VITE_BACKEND_URL;
const MAX_DOC_CHARS = 5000;
const SAFE_CASE_ID = /^[\w-]{1,100}$/;



function sanitizeText(value: unknown, maxLen = 200): string {
  return String(value ?? '')
    .replace(/[<>"'`]/g, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, maxLen);
}

function safePositiveInt(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

type DocumentChecklist = {
  docsNeededId: number;
  sampleNo: string | number;
  description: string;
  lcType: string;
  commodity: string | null;
  totalItems: number;
  checkedItems: number;
  fullyCompliant: string;
  userId?: string | number | null;
  category: string; // Added property
  mandatory: string; // Added property to fix error
};

export default function FourtySixA() {
  const [documents, setDocuments] = useState<DocumentChecklist[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [mandatoryFilter, setMandatoryFilter] = useState('all');
  const [documentText, setDocumentText] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all'); // Active / Inactive
  const [lcTypeFilter, setLcTypeFilter] = useState('all'); // LC Type

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [documentNames, setDocumentNames] = useState<string[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [selectedDocumentName, setSelectedDocumentName] = useState('');
  const [prefillLoading, setPrefillLoading] = useState(false);
  const docType = 'MAIN';

  const SAMPLE_DOCUMENT_TEXT = `
       46A Documents - Sight LC - Electronics - Mobile Phones
        Signed Commercial Invoice
        Full set of Clean On Board Bill of Lading
        Insurance Policy in original
        Packing List
        Certificate of Origin
        Manufacturer’s Warranty Certificate
        Pre-shipment Inspection Certificate
        Test Report for Mobile Phones
        Exporter’s Declaration
        Consular Invoice

`;
  const fetchCaseIds = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/lc/magic-box/case-ids`);
      if (!res.ok) throw new Error('Unable to fetch case ids');
      const data = await res.json();
      setCaseIds(Array.isArray(data?.case_ids) ? data.case_ids.map((id) => sanitizeText(id, 100)) : []);
    } catch (err) {
      toast.error(
        `Error fetching case ids: ${err instanceof Error ? err.message : 'Unexpected error'}`
      );
    }
  };

  const fetchDocumentNames = async (caseIdValue: string) => {
    if (!caseIdValue) {
      setDocumentNames([]);
      return;
    }
    if (!SAFE_CASE_ID.test(caseIdValue)) {
      toast.error('Invalid case ID format');
      return;
    }
    try {
      const res = await apiFetch(
        `${API_BASE}/api/lc/magic-box/${encodeURIComponent(caseIdValue)}/document-names?doc_type=${docType}`
      );
      if (!res.ok) throw new Error('Unable to fetch document names');
      const data = await res.json();
      setDocumentNames(
        Array.isArray(data?.document_names)
          ? data.document_names.map((name) => sanitizeText(name, 255))
          : []
      );
    } catch (err) {
      toast.error(
        `Error fetching document names: ${err instanceof Error ? err.message : 'Unexpected error'}`
      );
    }
  };

  const fetchPrefill46A = async (caseIdValue: string, documentNameValue: string) => {
    if (!caseIdValue || !documentNameValue) return;
    if (!SAFE_CASE_ID.test(caseIdValue)) {
      toast.error('Invalid case ID format');
      return;
    }
    try {
      setPrefillLoading(true);
      const qs = new URLSearchParams({
        case_id: caseIdValue,
        doc_type: docType,
        document_name: documentNameValue,
        preferred_doc_key: 'letter_of_credit'
      });
      const res = await apiFetch(`${API_BASE}/api/lc/prefill-46a?${qs.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch 46A text');
      const data = await res.json();
      setDocumentText(sanitizeText(data?.document_text ?? '', MAX_DOC_CHARS));
    } catch (err) {
      toast.error(`Unable to fetch 46A text: ${err instanceof Error ? err.message : 'Error'}`);
    } finally {
      setPrefillLoading(false);
    }
  };

  const loadSample = () => {
    setDocumentText(SAMPLE_DOCUMENT_TEXT.slice(0, MAX_DOC_CHARS));
  };
  const navigate = useNavigate();

  // Fetch documents from FastAPI
  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/lc/documents`);
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      setDocuments(
        Array.isArray(data)
          ? data.map((item: any) => ({
              ...item,
              userId: item?.userId ?? item?.UserID ?? item?.userid ?? null
            }))
          : []
      );
    } catch (err) {
      toast.error(
        `Error fetching documents: ${err instanceof Error ? err.message : 'Unexpected error'}`
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDocuments();
    fetchCaseIds();
  }, []);

  useEffect(() => {
    const refreshPageData = () => {
      if (document.visibilityState === 'visible') {
        fetchDocuments();
        fetchCaseIds();
      }
    };

    window.addEventListener('focus', refreshPageData);
    document.addEventListener('visibilitychange', refreshPageData);

    return () => {
      window.removeEventListener('focus', refreshPageData);
      document.removeEventListener('visibilitychange', refreshPageData);
    };
  }, []);

  // AI Analyze & Import
  const analyzeDocument = async () => {
    const trimmed = documentText.trim();
    if (!trimmed) {
      toast.error('Enter document text to analyze');
      return;
    }
    if (trimmed.length > MAX_DOC_CHARS) {
      toast.error(`Document text must be under ${MAX_DOC_CHARS} characters`);
      return;
    }

    try {
      setAnalyzing(true); // --- SHOW LOADER ---

      const res = await apiFetch(`${API_BASE}/api/lc/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_text: trimmed })
      });
      if (!res.ok) throw new Error('Analyze failed');

      const result = await res.json();

      // alert(`✅ Imported: ${result.description} with ${result.detail_count} sub-documents`);
      toast.success(
        `Successfully imported "${sanitizeText(result?.description, 120)}" (${Number(result?.detail_count) || 0} sub-documents)`,
        {
          position: 'top-right'
        }
      );

      setDocumentText('');
      fetchDocuments();
    } catch (err) {
      // console.error(err);
      toast.error('Error analyzing document');
    } finally {
      setAnalyzing(false); // --- HIDE LOADER ---
    }
  };
  const filteredData = documents.filter((doc) => {
    const matchesSearch =
      search === '' || doc.description.toLowerCase().includes(search.toLowerCase());

    const matchesCategory = categoryFilter === 'all' || doc.category === categoryFilter;

    const matchesMandatory = mandatoryFilter === 'all' || doc.mandatory === mandatoryFilter;

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'Active' && doc.fullyCompliant === 'Y') ||
      (statusFilter === 'Inactive' && doc.fullyCompliant !== 'Y');

    const matchesLcType = lcTypeFilter === 'all' || doc.lcType === lcTypeFilter;

    return matchesSearch && matchesCategory && matchesMandatory && matchesStatus && matchesLcType;
  });

  const paginatedData = filteredData.slice((page - 1) * limit, page * limit);

  const totalPages = Math.ceil(filteredData.length / limit);

  const handleDelete = async (docId: number) => {
    const safeDocId = safePositiveInt(docId);
    if (!safeDocId) {
      toast.error('Invalid document ID');
      return;
    }

    const ok = window.confirm('Are you sure you want to delete this document?');
    if (!ok) return;

    try {
      const res = await apiFetch(`${API_BASE}/api/lc/documents/${safeDocId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Delete failed');

      toast.success('🗑️ Document deleted!');
      fetchDocuments(); // refresh table
    } catch (err) {
      // console.error(err);
      toast.error('❌ Error deleting document');
    }
  };

  // DataTable columns
  const columns: Column<DocumentChecklist>[] = [
    {
      key: 'view',
      label: 'View',
      render: (row) => (
        <button
          className="text-blue-600 hover:text-blue-800 font-semibold underline"
          onClick={() => {
            const safeDocId = safePositiveInt(row.docsNeededId);
            if (!safeDocId) {
              toast.error('Invalid document reference');
              return;
            }

            navigate(`/form/documents/${safeDocId}`, {
              state: {
                description: sanitizeText(row.description, 255),
                sampleNo: sanitizeText(row.sampleNo, 50),
                lcType: sanitizeText(row.lcType, 50),
                commodity: row.commodity ? sanitizeText(row.commodity, 100) : null,
                fullyCompliant: row.fullyCompliant === 'Y' ? 'Y' : 'N'
              }
            });
          }}
        >
          View
        </button>
      )
    },
    {
      key: 'delete',
      label: 'Delete',
      render: (row) => (
        <button
          className="text-red-600 hover:text-red-800"
          onClick={() => handleDelete(row.docsNeededId)}
        >
          <Trash2 className="h-5 w-5" />
        </button>
      )
    },

    { key: 'sampleNo', label: 'Sample No' },
    { key: 'description', label: 'Description' },
    //    {
    //   key: 'lcNumber',
    //   label: 'LC Number',
    //   render: () => <span className="font-semibold">LC1012</span>
    // },

    { key: 'lcType', label: 'LC Type' },
    { key: 'commodity', label: 'Commodity' },
    { key: 'checkedItems', label: 'Checked' },
    { key: 'totalItems', label: 'Total' },
    // {
    //   key: 'user',
    //   label: 'User',
    //   render: () => <span className="font-semibold">3005</span>
    // },
    { key: 'userId', label: 'UserID' },
    {
      key: 'fullyCompliant',
      label: 'Status',
      render: (row) => (
        <span
          className={`px-2 py-1 rounded-full  text-sm ${
            row.fullyCompliant === 'Y'
              ? 'bg-success-clarity text-success-active px-3 py-1'
              : 'bg-danger-clarity text-danger-active px-2 py-1'
          }`}
        >
          {row.fullyCompliant === 'Y' ? 'Active' : 'Inactive'}
        </span>
      )
    }
  ];

  return (
    <div className="w-full p-6 space-y-6  card dark:border-blue-950">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Document Checklist</h1>
          <p className="text-gray-500">Select a document to view its checklist</p>
        </div>
        <button className="btn btn-primary btn-outline hover:bg-blue-600" onClick={fetchDocuments}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* AI Document Import */}
      <div className="shadow rounded-xl border p-6 space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <span className="text-yellow-500 text-xl"></span>
          AI Document Import
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            value={selectedCaseId}
            onValueChange={(value) => {
              setSelectedCaseId(value);
              setSelectedDocumentName('');
              setDocumentText('');
              setDocumentNames([]);
              fetchDocumentNames(value);
            }}
          >
            <SelectTrigger className="w-full" size="sm">
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

          <div className="flex gap-3">
            <Select
              value={selectedDocumentName}
              onValueChange={(value) => {
                setSelectedDocumentName(value);
                fetchPrefill46A(selectedCaseId, value);
              }}
              disabled={!selectedCaseId}
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder="Select Document Name" />
              </SelectTrigger>
              <SelectContent>
                {documentNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button
              className="btn btn-primary btn-outline btn-sm hover:bg-blue-600 whitespace-nowrap"
              onClick={loadSample}
              type="button"
            >
              Load Sample
            </button>
          </div>
        </div>
        <Textarea
          className="w-full border rounded-lg p-3 h-60 text-sm text-gray-700 mt-1"
          placeholder="46A Documents - Electronics - Mobile Phones..."
          value={documentText}
          maxLength={MAX_DOC_CHARS}
          onChange={(e) => setDocumentText(e.target.value.slice(0, MAX_DOC_CHARS))}
        />
        <div className="flex gap-3 flex justify-center items-center">
          <button
            className="btn btn-primary btn-outline hover:bg-blue-600 flex justify-center items-center gap-2"
            onClick={analyzeDocument}
            disabled={analyzing || prefillLoading}
          >
            {analyzing || prefillLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin text-green-500" />
            ) : (
              'Analyze & Import'
            )}
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="card rounded-xl shadow px-6 py-4 flex flex-col lg:flex-row items-center gap-4 justify-between ">
        <div className="input input-sm max-w-lg">
          <input
            className="pl-3 pr-3 py-2 border rounded-lg w-full focus:outline-blue-600"
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" size="sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <Select value={lcTypeFilter} onValueChange={setLcTypeFilter}>
            <SelectTrigger className="w-40" size="sm">
              <SelectValue placeholder="LC Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="Sight">Sight</SelectItem>
              <SelectItem value="Usance">Usance</SelectItem>
              <SelectItem value="Deferred">Deferred</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* DataTable */}
      {loading ? (
        <div className="w-full flex justify-center items-center py-10">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : (
        <div className="card p-2">
          <div className="card min-w-full">
            <div className="card-table scrollable-x-auto">
              <DataTable
                data={paginatedData}
                columns={columns}
                isLoading={loading}
                page={page}
                limit={limit}
                total={filteredData.length}
                onPageChange={(newPage: any) => setPage(newPage)}
              />

            </div>
          </div>
          {/* Pagination Toolbar */}
          <div className="flex justify-between items-center border-t p-4 text-sm text-gray-700">
            {/* Show per page */}
            <div className="flex items-center gap-2">
              Show
              <select
                className="border rounded-md p-1 w-16"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1); // reset page
                }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
              </select>
              per page
            </div>

            {/* Page X of Y */}
            <span>
              Page {page} of {totalPages === 0 ? 1 : totalPages}
            </span>

            {/* Prev / Next buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1 border rounded-md disabled:opacity-50"
              >
                Prev
              </button>

              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1 border rounded-md disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

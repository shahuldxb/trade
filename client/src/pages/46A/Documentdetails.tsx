import { Fragment, useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { KeenIcon } from '@/components';
import { Textarea } from '@/components/ui/textarea';
import { toAbsoluteUrl } from '@/utils/Assets';
import { toast } from 'sonner';
import { apiFetch } from '@/utils/apiFetch';

// const API_BASE = 'http://localhost:8000/api/lc';
const API_BASE = import.meta.env.VITE_BACKEND_URL;
const MAX_NARRATION_CHARS = 1000;

function sanitizeText(value: unknown, maxLen = 500): string {
  return String(value ?? '')
    .replace(/[<>"'`]/g, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, maxLen);
}

function safePositiveInt(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}


type Detail = {
  detailId: number;
  lineNo: number;
  documentText: string;
  checked: number;
  narration: string;
  status: 'YES' | 'NO' | 'PARTIAL';
};

const DocumentDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const docId = safePositiveInt(id);

  const [details, setDetails] = useState<Detail[]>([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const docInfo = location.state;

  const fetchDetails = async () => {
    if (!docId) {
      toast.error('Invalid document reference');
      navigate('/form/46A');
      return;
    }

    try {
      const res = await apiFetch(`${API_BASE}/api/lc/documents/${docId}/details`);
      if (!res.ok) throw new Error('Failed to load details');
      const data = await res.json();
      const formatted = Array.isArray(data)
        ? data.map((d: any) => ({
            detailId: Number(d?.detailId),
            lineNo: Number(d?.lineNo),
            documentText: sanitizeText(d?.documentText, 500),
            checked: d?.checked === 1 ? 1 : 0,
            narration: sanitizeText(d?.narration, MAX_NARRATION_CHARS),
            status: d?.checked === 1 ? 'YES' : 'NO'
          }))
        : [];
      setDetails(formatted);
    } catch (err) {
      toast.error('Unable to fetch document details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const updateDetail = async (detailId: number, checked: boolean, narration: string) => {
    if (!docId) return;
    const safeDetailId = safePositiveInt(detailId);
    if (!safeDetailId) return;

    try {
      const res = await apiFetch(`${API_BASE}/api/lc/documents/${docId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detailId: safeDetailId,
          checked,
          narration: sanitizeText(narration, MAX_NARRATION_CHARS)
        })
      });
      if (!res.ok) throw new Error('Failed to update');
    } catch (err) {
      toast.error('Failed to update document item');
    }
  };

  // const handleCheckbox = (detailId: number) => {
  //   const updated = details.map((d) =>
  //     d.detailId === detailId ? { ...d, checked: d.checked === 1 ? 0 : 1 } : d
  //   );
  //   setDetails(updated);

  //   const item = updated.find((d) => d.detailId === detailId);
  //   updateDetail(detailId, item!.checked === 1, item!.narration);
  // };

  const handleStatusChange = (detailId: number, value: 'YES' | 'NO' | 'PARTIAL') => {
    const updated = details.map((d) => {
      if (d.detailId !== detailId) return d;

      // RULE:
      // NO → unchecked
      // YES / PARTIAL → checked
      const checked = value === 'NO' ? 0 : 1;

      return { ...d, status: value, checked };
    });

    setDetails(updated);

    const item = updated.find((d) => d.detailId === detailId)!;
    updateDetail(detailId, item.checked === 1, item.narration);
  };

  const handleCheckbox = (detailId: number) => {
    const updated = details.map((d) => {
      if (d.detailId !== detailId) return d;

      // If status is NO → checkbox should not change
      if (d.status === 'NO') return d;

      const newChecked = d.checked === 1 ? 0 : 1;

      return {
        ...d,
        checked: newChecked,
        status: newChecked === 1 ? d.status : 'NO'
      };
    });

    setDetails(updated);

    const item = updated.find((d) => d.detailId === detailId)!;
    updateDetail(detailId, item.checked === 1, item.narration);
  };

  const handleNarration = (detailId: number, value: string) => {
    const safeNarration = value.slice(0, MAX_NARRATION_CHARS);
    const updated = details.map((d) =>
      d.detailId === detailId ? { ...d, narration: safeNarration } : d
    );
    setDetails(updated);

    const item = updated.find((d) => d.detailId === detailId);
    updateDetail(detailId, item!.checked === 1, safeNarration);
  };

  const handleSave = () => {
    // alert("Document details saved successfully!");
    toast.success('Document details saved successfully');
    navigate('/form/46A');
  };

  const docStats = [
    {
      // icon: "/media/images/FrameworkImages/doc-file.png",
      info: docInfo?.sampleNo ?? 'N/A',
      desc: 'Sample No',
      bg: '/media/images/2600x1600/bg-4.png',
      bgDark: '',
      color: 'bg-blue-500'
    },
    {
      // icon: "/media/images/FrameworkImages/lc-type.png",
      info: docInfo?.lcType ?? 'N/A',
      desc: 'LC Type',
      bg: '/media/images/2600x1600/bg-4.png',
      bgDark: '',
      color: 'bg-green-500'
    },
    {
      // icon: "/media/images/FrameworkImages/commodity.png",
      info: docInfo?.commodity ?? 'N/A',
      desc: 'Commodity',
      bg: '/media/images/2600x1600/bg-5.png',
      bgDark: '',
      color: 'bg-purple-500'
    },
    {
      // icon: "/media/images/FrameworkImages/status.png",
      info: docInfo?.fullyCompliant === 'Y' ? 'Active' : 'Inactive',
      desc: 'Fully Compliant',
      bg: '/media/images/2600x1600/bg-6.png',
      bgDark: '',
      color: docInfo?.fullyCompliant === 'Y' ? 'bg-success' : 'bg-danger'
    }
  ];

  return (
    <Fragment>
      <style>
        {`
          .branding-bg {
            background-image: url('${toAbsoluteUrl('/media/images/2600x1200/bg-10.png')}');
          }
          .dark .branding-bg {
            background-image: url('${toAbsoluteUrl('/media/images/2600x1200/bg-10-dark.png')}');
          }
        `}
      </style>

      <div className="card min-w-full ">
        {/* HEADER */}
        <div className="card-header gap-2 flex justify-between">
          <h3 className="card-title flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="btn btn-sm btn-primary btn-outline flex items-center gap-1"
            >
              <KeenIcon icon="arrow-left" className="text-base " /> Back to List
            </button>
            Document Details
          </h3>
        </div>

        <div className="card-body lg:py-7.5 py-5 ">
          {/* DOCUMENT CATEGORY */}
          <div className="flex flex-wrap justify-between gap-5 ">
            <div className="flex flex-col">
              {/* <div className="text-gray-900 text-sm font-medium">Document Category</div> */}
              <span className="text-xl font-semibold text-blue-700">
                {sanitizeText(docInfo?.description, 255)}
              </span>
              <span className="text-gray-700 text-2sm">
                Overview of the selected 46A document group
              </span>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap gap-5 lg:gap-7.5 max-w-md w-full">
              <img
                // src={toAbsoluteUrl("/media/brand-logos/hex-lab.svg")}
                src={toAbsoluteUrl('/media/images/FrameworkImages/46A.png')}
                className="h-[50px] mt-2"
                alt="Document Logo"
              />

              <div className="flex bg-center w-full p-5 lg:p-7 bg-no-repeat bg-[length:550px] border border-gray-300 rounded-xl border-dashed branding-bg ">
                <div className="flex flex-col place-items-center place-content-center text-center rounded-xl w-full">
                  <div className="flex items-center mb-2.5">
                    <div className="relative size-20 shrink-1 ">
                      <svg
                        className="w-full h-full stroke-brand-clarity fill-light"
                        width="44"
                        height="48"
                      >
                        <path d="M16 2.4641C19.7 0.32 24.3 0.32 28 2.46L37.65 8.03C41.36 10.17 43.65 14.14 43.65 18.43V29.57C43.65 33.86 41.36 37.82 37.65 39.96L28 45.53C24.28 47.67 19.71 47.67 16 45.53L6.34 39.96C2.63 37.82 0.35 33.86 0.35 29.57V18.42C0.35 14.14 2.63 10.17 6.34 8.03L16 2.46Z" />
                      </svg>

                      <div className="absolute leading-none left-2/4 top-2/4 -translate-y-2/4 -translate-x-2/4">
                        <img
                          src={toAbsoluteUrl('/media/images/FrameworkImages/doc-file.png')}
                          alt=""
                        />
                      </div>
                    </div>
                  </div>

                  <span className="text-2xs text-gray-700 text-nowrap">
                    Uploaded 46A Document Information
                  </span>
                </div>
              </div>
            </div>
            {/* documents */}
            {/* <div className="mt-3 text-sm text-gray-800 flex gap-4 flex-wrap">
                            <div><strong>Sample No:</strong> {docInfo?.sampleNo ?? "N/A"}</div>
                            <div><strong>LC Type:</strong> {docInfo?.lcType ?? "N/A"}</div>
                            <div><strong>Commodity:</strong> {docInfo?.commodity ?? "N/A"}</div>
                            <div>
                                <strong>Fully Compliant:</strong>{" "}
                                {docInfo?.fullyCompliant === "Y" ? "✔️ Yes" : "❌ No"}
                            </div>
                        </div> */}
          </div>

          <div className="border-t border-gray-300 my-7.5"></div>

          {/* DOCUMENT SUMMARY */}
          <div className="flex  justify-between gap-1  items-center">
            <div className="flex flex-col  w-1/3">
              <div className="text-gray-900 text-sm font-medium">Document Summary</div>
              <span className="text-gray-700 text-2sm">
                Key reference or internal tracking reference
              </span>
            </div>

            {/* <label className="input sm:max-w-full xl:max-w-96 w-full">
                            <KeenIcon icon="mouse-square" className="text-success" style="solid" />
                            <input
                                type="text"
                                value={brandColorInput}
                                onChange={(e) => setBrandColorInput(e.target.value)}
                            />
                        </label> */}

            <div className="mt-3 text-sm text-gray-800 flex gap-1 flex-wrap  w-full justify-evenly">
              <div>
                <strong>Sample No:</strong> {sanitizeText(docInfo?.sampleNo ?? 'N/A', 50)}
              </div>
              <div>
                <strong>LC Type:</strong> {sanitizeText(docInfo?.lcType ?? 'N/A', 50)}
              </div>
              <div>
                <strong>Commodity:</strong> {sanitizeText(docInfo?.commodity ?? 'N/A', 100)}
              </div>
              <div>
                <strong>Fully Compliant:</strong>{' '}
                {docInfo?.fullyCompliant === 'Y' ? '✔️ Yes' : '❌ No'}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-300 my-7.5"></div>

          {/* CHECKLIST SECTION */}
          <div className="flex flex-col gap-4 p-5 border rounded-xl card  ">
            {loading ? (
              <p>Loading document details...</p>
            ) : (
              details.map((item) => (
                <div
                  key={item.detailId}
                  className="grid
    grid-cols-[1fr_60px_120px_1fr]
    items-center
    gap-4
    border-b
    py-3 "
                >
                  {/* <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-1/2 items-center  ">
                    
                    

              
                    <div>
                      <span className="text-gray-900 font-medium flex-1">{item.documentText}</span>
                    </div>

                    <div>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={item.checked === 1}
                        disabled={item.status === 'NO'} // 🔥 NO → user cannot tick
                        onChange={() => handleCheckbox(item.detailId)}
                      />
                    </div>

       
                    <div className="w-full sm:w-[120px] ">
                      {' '}
                      <select
                        className="select select-sm border border-gray-300 "
                        value={item.status}
                        onChange={(e) => handleStatusChange(item.detailId, e.target.value as any)}
                      >
                        <option value="YES">full</option>
                        <option value="PARTIAL">Partial</option>
                        <option value="NO">Null</option>
                      </select>
                    </div>
                  </div> */}
                  <div className="text-gray-900 font-medium">
  {item.documentText}
</div>

<div className="flex justify-end">
  <input
    type="checkbox"
    className="checkbox checkbox-sm"
    checked={item.checked === 1}
    disabled={item.status === 'NO'}
    onChange={() => handleCheckbox(item.detailId)}
  />
</div>
<div>
  <select
    className="select select-sm border border-gray-300 w-full"
    value={item.status}
    onChange={(e) =>
      handleStatusChange(item.detailId, e.target.value as any)
    }
  >
    <option value="YES">Full</option>
    <option value="PARTIAL">Partial</option>
    <option value="NO">Null</option>
  </select>
</div>

<div>
  <Textarea
    value={item.narration}
    maxLength={MAX_NARRATION_CHARS}
    onChange={(e) => handleNarration(item.detailId, e.target.value)}
    placeholder="Add note..."
    rows={2}
    className="w-full text-sm resize-none min-h-[36px] max-h-[50px] px-4 py-1 leading-tight"
  />
</div>
                  {/* <div className="w-full sm:w-1/3">
                    <Textarea
                      value={item.narration}
                      onChange={(e) => handleNarration(item.detailId, e.target.value)}
                      placeholder="Add note..."
                      rows={2}
                      className="w-full text-sm resize-none min-h-[38px] max-h-[60px] px-2 py-1 leading-tight"
                    />
                  </div> */}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-gray-300 my-7.5"></div>

          {/* SAVE */}
          <div className="flex justify-end">
            <button className="btn btn-primary" onClick={handleSave}>
              Save Document Details
            </button>
          </div>
        </div>
      </div>
    </Fragment>
  );
};

export default DocumentDetails;

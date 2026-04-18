
import React, { useEffect, useRef, useState } from "react";
import { KeenIcon } from "@/components";
import { toAbsoluteUrl } from "@/utils";
import { toast } from "sonner";

// ── Constants ──
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; 
const MAX_SUBJECT_LENGTH = 998; 
const MAX_BODY_LENGTH = 100_000;

// ── Helpers ──
function getCsrfToken(): string {
  return (
    document
      .querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
      ?.getAttribute("content") ?? ""
  );
}

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

// ── Types ──
type Props = {
  open: boolean;
  onClose: () => void;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  attachmentFile?: File | null;
};

// ── Component ──
export const ComposeEmail: React.FC<Props> = ({
  open,
  onClose,
  defaultTo = "",
  defaultSubject = "",
  defaultBody = "",
  attachmentFile = null,
}) => {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState<string>("");
  const [sending, setSending] = useState(false);
  const blobUrlRef = useRef<string>("");

  // ── Sync props → state when dialog opens ──
  useEffect(() => {
    if (!open) return;
    setTo(defaultTo ?? "");
    setSubject(defaultSubject ?? "");
    setBody(defaultBody ?? "");
  }, [open, defaultTo, defaultSubject, defaultBody]);

  // ── Blob URL lifecycle ──.
  useEffect(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = "";
    }
    if (!attachmentFile) {
      setAttachmentUrl("");
      return;
    }
    const url = URL.createObjectURL(attachmentFile);
    blobUrlRef.current = url;
    setAttachmentUrl(url);

    return () => {
      URL.revokeObjectURL(url);
      blobUrlRef.current = "";
    };
  }, [attachmentFile]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  if (!open) return null;

  // ── Validation ──
  const validate = (): boolean => {
    const trimmedTo = to.trim();
    if (!trimmedTo) {
      toast.error("Recipient email is required.");
      return false;
    }
    if (!EMAIL_REGEX.test(trimmedTo)) {
      toast.error("Please enter a valid email address.");
      return false;
    }

    if (subject.length > MAX_SUBJECT_LENGTH) {
      toast.error(`Subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.`);
      return false;
    }
    if (body.length > MAX_BODY_LENGTH) {
      toast.error("Message body is too long.");
      return false;
    }

    if (attachmentFile) {
      if (!ALLOWED_MIME_TYPES.includes(attachmentFile.type)) {
        toast.error(
          `Unsupported file type "${attachmentFile.type}". Allowed: PDF, PNG, JPEG, WEBP.`
        );
        return false;
      }
      if (attachmentFile.size > MAX_ATTACHMENT_BYTES) {
        toast.error("Attachment exceeds the 10 MB limit.");
        return false;
      }
    }

    return true;
  };

  // ── Send ──
  const handleSend = async () => {
    if (sending) return;
    if (!validate()) return;
    try {
      setSending(true);

      const attachmentPayload = attachmentFile
        ? {
            filename: attachmentFile.name,
            content_type: attachmentFile.type,
            data_base64: await toBase64(attachmentFile),
          }
        : null;

      const res = await fetch("/api/lc/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({
          to: to.trim(),
          subject,
          body,
          attachment: attachmentPayload,
        }),
      });

      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok || !(data as any)?.success) {
        console.error("[ComposeEmail] send failed:", { status: res.status, data });
        throw new Error("EMAIL_SEND_FAILED");
      }

      toast.success("Email sent successfully.");
      onClose();
    } catch (err: unknown) {
      const isKnown =
        err instanceof Error && err.message === "EMAIL_SEND_FAILED";
      toast.error(
        isKnown
          ? "Failed to send email. Please try again."
          : "An unexpected error occurred. Please try again."
      );
      console.error("[ComposeEmail] unexpected error:", err);
    } finally {
      setSending(false);
    }
  };

  // ── Render ──
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compose new email"
        className="card relative w-[420px] rounded shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="font-bold">New Message</div>
          <button
            onClick={onClose}
            aria-label="Close compose window"
            type="button"
          >
            <KeenIcon icon="cross" />
          </button>
        </div>

        {/* Fields */}
        <div className="p-3 space-y-2">
          <input
            type="email"
            className="input bg-gray-100"
            placeholder="To"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Recipient email"
            maxLength={320} 
          />

          <input
            type="text"
            className="input w-full"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-label="Subject"
            maxLength={MAX_SUBJECT_LENGTH}
          />

          <textarea
            className="input w-full min-h-[120px] p-2"
            placeholder="Write your message..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Message body"
            maxLength={MAX_BODY_LENGTH}
          />

          {attachmentFile ? (
            <div className="text-xs text-gray-600 card rounded p-2">
              <div>
                Attachment:{" "}
                <span className="font-semibold">{attachmentFile.name}</span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSend}
            disabled={sending}
            aria-busy={sending}
          >
            {sending ? "Sending…" : "Send"}
          </button>

          <img
            src={toAbsoluteUrl("/media/avatars/300-2.png")}
            className="rounded-full size-[28px]"
            alt="Your avatar"
          />
        </div>
      </div>
    </div>
  );
};


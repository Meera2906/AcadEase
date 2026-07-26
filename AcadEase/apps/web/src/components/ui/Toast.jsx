import { useEffect, useState } from "react";
import { CheckCircle, XCircle, X } from "lucide-react";

export function useToast() {
  const [toast, setToast] = useState(null);
  function showToast(message, type = "success") {
    setToast({ message, type });
  }
  return { toast, showToast, clearToast: () => setToast(null) };
}

export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;

  const isSuccess = toast.type === "success";
  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-start gap-3 px-4 py-3 rounded-card shadow-lift border max-w-sm ${
        isSuccess
          ? "bg-[#E9FCE0] border-[#b6f0cc] text-success"
          : "bg-[#FFE7E9] border-[#ffc0c7] text-danger"
      }`}
    >
      {isSuccess
        ? <CheckCircle size={16} className="mt-0.5 shrink-0" />
        : <XCircle size={16} className="mt-0.5 shrink-0" />}
      <p className="text-sm flex-1">{toast.message}</p>
      <button onClick={onClose} className="opacity-60 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}

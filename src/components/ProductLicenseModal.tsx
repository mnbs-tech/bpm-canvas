"use client";

import { PRODUCT_LICENSE_NAME, PRODUCT_LICENSE_TEXT } from "@/lib/productLicense";

interface ProductLicenseModalProps {
  onClose: () => void;
}

/** This app's own license text. See `src/lib/productLicense.ts` for upkeep notes. */
export default function ProductLicenseModal({ onClose }: ProductLicenseModalProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      // Stops here rather than bubbling: this modal can be opened from inside
      // LicensesModal, which has its own backdrop-click-to-close a level up -
      // without this, closing this modal on backdrop click would close that
      // one too.
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="flex max-h-[75vh] w-[640px] max-w-[92vw] flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-800">{PRODUCT_LICENSE_NAME} のライセンス</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            ✕
          </button>
        </div>

        <pre className="flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-3 font-mono text-xs text-zinc-700">
          {PRODUCT_LICENSE_TEXT}
        </pre>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { LICENSES } from "@/lib/licenses";
import { PRODUCT_LICENSE_NAME } from "@/lib/productLicense";
import ProductLicenseModal from "./ProductLicenseModal";

interface LicensesModalProps {
  onClose: () => void;
}

/** OSS packages this app depends on. See `src/lib/licenses.ts` for upkeep notes. */
export default function LicensesModal({ onClose }: LicensesModalProps) {
  const [showProductLicense, setShowProductLicense] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="flex max-h-[75vh] w-[640px] max-w-[92vw] flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-800">ライセンス</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            ✕
          </button>
        </div>

        <div className="border-b border-zinc-200 px-2 py-2">
          <button
            onClick={() => setShowProductLicense(true)}
            className="block w-full rounded-md px-2 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50"
          >
            {PRODUCT_LICENSE_NAME} のライセンス
            <span className="block text-xs text-zinc-400">このアプリ自体のライセンス（MIT）</span>
          </button>
        </div>

        <ol className="flex-1 overflow-y-auto px-2 py-2">
          {LICENSES.map((entry) => (
            <li key={entry.name} className="flex gap-3 rounded-md px-2 py-2 hover:bg-zinc-50">
              <div className="w-20 shrink-0 pt-0.5">
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
                  {entry.license}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-zinc-800 hover:underline"
                >
                  {entry.name}
                </a>
                <span className="ml-2 text-xs text-zinc-400">v{entry.version}</span>
              </div>
            </li>
          ))}
        </ol>

        <div className="border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500">
          このアプリが使用しているOSSパッケージの一覧です（直接の依存のみ、開発時だけ使うものは含みません）。
        </div>
      </div>

      {showProductLicense && (
        <ProductLicenseModal onClose={() => setShowProductLicense(false)} />
      )}
    </div>
  );
}

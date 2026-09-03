"use client";

import { useEffect, useState } from "react";
import ChangelogModal from "./ChangelogModal";
import LicensesModal from "./LicensesModal";
import { BASE_PATH } from "@/lib/basePath";
import { useDropdownPlacement } from "@/lib/dropdownPlacement";

// Values are inlined at build time via next.config.ts's `env` field - see
// there for how they're derived (package.json version + git commit hash).
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "?";
const COMMIT = process.env.NEXT_PUBLIC_GIT_COMMIT ?? "?";
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME;

function formatBuildTime(iso: string | undefined): string {
  if (!iso) return "?";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  return d.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
}

function formatKitSize(bytes: number | undefined): string {
  if (!bytes) return "?";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface KitInfo {
  available: boolean;
  filename?: string;
  size?: number;
  builtAt?: string;
}

/**
 * The ⚙️ menu at the top right: this build's version, the app's changelog, the
 * JSON format spec, and the release kit download. All of it used to sit in the
 * sidebar footer (BuildInfo), where it competed for space with the palette and
 * the validation list; none of it is per-document, so it belongs to the app
 * chrome instead.
 *
 * Deliberately outside Toolbar's `previewing` fieldset: reading the version or
 * the changelog changes nothing about the document, so there is no reason to
 * disable it while an AI proposal is on screen.
 */
export default function AppInfoMenu({ onOpen }: { onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showLicenses, setShowLicenses] = useState(false);
  const [kit, setKit] = useState<KitInfo | null>(null);
  // Right-aligned with the ⚙️ button where there is room; pulled back inside
  // the window when the toolbar has wrapped and put the button on the left.
  const { anchorRef: wrapperRef, menuRef, style: menuStyle } = useDropdownPlacement(open, "right");

  // Asked for on each open rather than at mount: a kit can be built while the
  // page is sitting there, and this way the menu never advertises a download
  // that isn't on disk (they are built on request only, so absent is normal).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`${BASE_PATH}/api/release-kit`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<KitInfo>) : { available: false }))
      .catch(() => ({ available: false }))
      .then((info) => {
        if (!cancelled) setKit(info);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Capture phase, same reason as Toolbar's menus: React Flow's pane stops
    // mousedown from propagating, so a bubble-phase listener never sees a click
    // on the canvas and the menu would stay open over it.
    window.addEventListener("mousedown", close, true);
    return () => window.removeEventListener("mousedown", close, true);
  }, [open, wrapperRef]);

  return (
    <>
      <div ref={wrapperRef} className="relative flex items-center">
        <button
          onClick={() =>
            setOpen((v) => {
              // Toolbar's own dropdowns close on a mousedown outside the header,
              // which this button is not - tell it to close them itself.
              if (!v) onOpen?.();
              return !v;
            })
          }
          className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
          title="バージョン情報・変更履歴"
          aria-label="設定とアプリ情報"
          aria-expanded={open}
        >
          ⚙️
        </button>

        {open && (
          <div
            ref={menuRef}
            style={menuStyle}
            className="absolute right-0 top-full z-30 mt-1 w-64 rounded border border-zinc-200 bg-white py-1 shadow-lg"
          >
            <div className="px-3 py-2">
              <div className="text-sm font-semibold text-zinc-800">
                bpm-canvas v{VERSION}
              </div>
              <div className="mt-0.5 text-xs text-zinc-400">
                コミット {COMMIT}
                <br />
                ビルド日時 {formatBuildTime(BUILD_TIME)}
              </div>
            </div>

            <div className="my-1 border-t border-zinc-200" />

            <button
              onClick={() => {
                setOpen(false);
                setShowChangelog(true);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100"
            >
              変更履歴…
              <span className="block text-xs text-zinc-400">
                このアプリのこれまでの更新内容
              </span>
            </button>

            <button
              onClick={() => {
                setOpen(false);
                setShowLicenses(true);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100"
            >
              ライセンス…
              <span className="block text-xs text-zinc-400">使用しているOSS一覧</span>
            </button>

            <a
              href={`${BASE_PATH}/workflow-format.md`}
              download
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              JSON仕様書をダウンロード
              <span className="block text-xs text-zinc-400">
                AIにフローを生成させる際に渡します
              </span>
            </a>

            {kit?.available ? (
              <a
                href={`${BASE_PATH}/api/release-kit/download`}
                download
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                一式をダウンロード（ZIP）
                <span className="block text-xs text-zinc-400">
                  自分のPCで動かすための一式。展開して docs/LOCAL_RUNBOOK.md の手順へ
                  <br />
                  {formatKitSize(kit.size)}・{formatBuildTime(kit.builtAt)} 作成
                </span>
              </a>
            ) : (
              <div className="px-3 py-2 text-sm text-zinc-400">
                一式をダウンロード（ZIP）
                <span className="block text-xs text-zinc-400">
                  未作成です（管理者が `npm run kit` を実行すると出ます）
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
      {showLicenses && <LicensesModal onClose={() => setShowLicenses(false)} />}
    </>
  );
}

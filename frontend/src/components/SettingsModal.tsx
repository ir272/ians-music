"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCookieStatus, uploadCookieFile, deleteCookieFile, type CookieStatus } from "@/lib/api";

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const [status, setStatus] = useState<CookieStatus | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await getCookieStatus());
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setFeedback(null);
    try {
      await uploadCookieFile(file);
      setFeedback({ type: "ok", msg: "Cookies uploaded — YouTube imports should work now." });
      await load();
    } catch (err) {
      setFeedback({ type: "err", msg: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [load]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    setFeedback(null);
    try {
      await deleteCookieFile();
      setFeedback({ type: "ok", msg: "Cookie file removed." });
      await load();
    } catch (err) {
      setFeedback({ type: "err", msg: err instanceof Error ? err.message : "Delete failed" });
    } finally {
      setIsDeleting(false);
    }
  }, [load]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#18181A] border border-white/10 rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-white/60 text-xl">settings</span>
            <span className="text-sm font-semibold text-white tracking-tight">Settings</span>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors material-symbols-outlined text-xl"
          >
            close
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* YouTube Cookies section */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-white/90 uppercase tracking-widest">YouTube Cookies</span>
              {status?.is_set && (
                <span className="text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Active
                </span>
              )}
            </div>
            <p className="text-xs text-white/45 leading-relaxed mb-4">
              YouTube blocks requests from cloud servers unless you provide real browser cookies.
              Export your cookies from a logged-in YouTube session and upload the file here.
              The cookies stay on the server and are reused for all imports.
            </p>

            {/* How-to steps */}
            <div className="bg-white/4 border border-white/8 rounded-xl p-4 mb-4 space-y-2">
              <p className="text-[11px] font-semibold text-white/70 mb-2">How to export cookies</p>
              {[
                { n: "1", text: 'Install the "Get cookies.txt LOCALLY" Chrome extension' },
                { n: "2", text: "Go to youtube.com and make sure you're signed in" },
                { n: "3", text: 'Click the extension icon → select "youtube.com" → export as .txt' },
                { n: "4", text: "Upload the downloaded file below" },
              ].map(({ n, text }) => (
                <div key={n} className="flex gap-3 items-start">
                  <span className="text-[10px] font-bold text-white/30 w-4 shrink-0 mt-0.5">{n}</span>
                  <span className="text-[11px] text-white/55 leading-relaxed">{text}</span>
                </div>
              ))}
            </div>

            {/* Current status */}
            {status?.is_set && (
              <div className="flex items-center justify-between bg-emerald-500/8 border border-emerald-500/15 rounded-lg px-4 py-3 mb-3">
                <div>
                  <p className="text-xs font-medium text-emerald-400">Cookie file active</p>
                  {status.updated_at && (
                    <p className="text-[11px] text-white/40 mt-0.5">
                      Updated {new Date(status.updated_at).toLocaleString()}
                      {" · "}{(status.size_bytes / 1024).toFixed(1)} KB
                    </p>
                  )}
                </div>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-[11px] font-medium text-red-400/70 hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  {isDeleting ? "Removing..." : "Remove"}
                </button>
              </div>
            )}

            {/* Upload button */}
            <input
              ref={fileRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={handleFile}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={isUploading}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-white/6 hover:bg-white/10 border border-white/10 hover:border-white/20 text-sm font-medium text-white/80 hover:text-white transition-all disabled:opacity-40 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              {isUploading ? "Uploading..." : status?.is_set ? "Replace cookie file" : "Upload cookies.txt"}
            </button>

            {/* Feedback */}
            {feedback && (
              <div className={`mt-3 flex items-start gap-2 text-xs rounded-lg px-3 py-2.5 ${
                feedback.type === "ok"
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 border border-red-500/20 text-red-400"
              }`}>
                <span className="material-symbols-outlined text-[14px] mt-0.5 shrink-0">
                  {feedback.type === "ok" ? "check_circle" : "error"}
                </span>
                {feedback.msg}
              </div>
            )}
          </div>

          {/* Note on expiry */}
          <div className="flex items-start gap-2 text-[11px] text-white/30 border-t border-white/6 pt-4">
            <span className="material-symbols-outlined text-[13px] mt-0.5 shrink-0">info</span>
            <span>
              Cookies typically expire after a few weeks. If YouTube imports stop working, export and re-upload fresh cookies.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

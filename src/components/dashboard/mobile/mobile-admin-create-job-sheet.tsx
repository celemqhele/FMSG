"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { X, Link, Search, Loader2, Check, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Tab = "paste" | "search";

interface ScrapedJob {
  job_title: string;
  company: string;
  location: string;
  estimated_salary: string;
  snippet: string;
  full_description: string;
  paraphrased_description: string;
  apply_url: string;
  source: string;
}

interface SearchResult {
  title: string;
  company_name: string;
  location: string;
  description: string;
  link: string;
  source: string;
  selected?: boolean;
}

interface PublishedJob {
  slug: string;
  url: string;
  title: string;
}

interface MobileAdminCreateJobSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileAdminCreateJobSheet({ isOpen, onClose }: MobileAdminCreateJobSheetProps) {
  const [tab, setTab] = useState<Tab>("paste");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");
  const [scrapedJob, setScrapedJob] = useState<ScrapedJob | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const searchRanRef = useRef(false);
  const [published, setPublished] = useState<PublishedJob[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [dragY, setDragY] = useState(0);

  const reset = useCallback(() => {
    setPasteUrl(""); setScrapedJob(null); setSearchResults([]); setPublished([]);
    setError(""); setLoading(false); setPublishing(false); searchRanRef.current = false;
  }, []);

  const handleClose = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  useEffect(() => {
    if (tab !== "search" || searchRanRef.current || isOpen === false) return;
    searchRanRef.current = true;
    const runSearch = async () => {
      setLoading(true); setError("");
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setError("Not authenticated"); setLoading(false); return; }
        const res = await fetch("/api/admin/search-jobs", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) { const data = await res.json(); setError(data.error || "Search failed"); setLoading(false); return; }
        const data = await res.json();
        setSearchResults((data.results || []).map((r: SearchResult) => ({ ...r, selected: true })));
      } catch { setError("Network error. Please try again."); }
      setLoading(false);
    };
    runSearch();
  }, [tab, isOpen]);

  const handleScrape = async () => {
    if (!pasteUrl.trim()) return;
    setLoading(true); setError(""); setScrapedJob(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Not authenticated"); setLoading(false); return; }
      const res = await fetch("/api/admin/create-job-post", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: pasteUrl }),
      });
      if (!res.ok) { const data = await res.json(); setError(data.error || "Failed to scrape"); setLoading(false); return; }
      const data = await res.json(); setScrapedJob(data);
    } catch { setError("Network error. Please try again."); }
    setLoading(false);
  };

  const handlePublishPaste = async () => {
    if (!scrapedJob) return;
    setPublishing(true); setError("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Not authenticated"); setPublishing(false); return; }
      const res = await fetch("/api/admin/create-job-post", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", job: scrapedJob }),
      });
      if (!res.ok) { const data = await res.json(); setError(data.error || "Failed to publish"); setPublishing(false); return; }
      const data = await res.json(); setPublished([data]); setScrapedJob(null); setPasteUrl("");
    } catch { setError("Network error. Please try again."); }
    setPublishing(false);
  };

  const toggleResult = (index: number) => {
    setSearchResults((prev) => {
      const updated = [...prev];
      if (!updated[index].selected && updated.filter((r) => r.selected).length >= 5) return prev;
      updated[index] = { ...updated[index], selected: !updated[index].selected };
      return updated;
    });
  };

  const handlePublishBatch = async () => {
    const selected = searchResults.filter((r) => r.selected);
    if (selected.length === 0) return;
    setPublishing(true); setError("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Not authenticated"); setPublishing(false); return; }
      const res = await fetch("/api/admin/publish-jobs", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: selected }),
      });
      if (!res.ok) { const data = await res.json(); setError(data.error || "Failed to publish"); setPublishing(false); return; }
      const data = await res.json(); setPublished(data.published || []); setSearchResults([]); searchRanRef.current = false;
    } catch { setError("Network error. Please try again."); }
    setPublishing(false);
  };

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    setDragY(Math.max(0, dy));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragY > 100) handleClose();
    else setDragY(0);
  }, [dragY, handleClose]);

  if (!isOpen) return null;

  const selectedCount = searchResults.filter((r) => r.selected).length;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div
        className="relative bg-[#1C1C1E] rounded-t-[19px] overflow-hidden flex flex-col"
        style={{ height: "calc(100dvh - 2.5rem)", transform: `translateY(${dragY > 0 ? dragY : 0}px)`, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex justify-center pt-2.5 pb-1.5 shrink-0">
          <div className="w-7 h-[5px] rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2.5 shrink-0 border-b border-white/[0.06]">
          <h2 className="text-[14px] font-semibold text-white">Create Job Post</h2>
          <button onClick={handleClose} className="w-9 h-9 flex items-center justify-center text-white/60 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {published.length > 0 ? (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check size={13} className="text-emerald-600" />
              </div>
              <p className="text-[11px] font-medium text-white">{published.length} job post{published.length > 1 ? "s" : ""} created</p>
            </div>
            <div className="space-y-1.5">
              {published.map((p) => (
                <div key={p.slug} className="flex items-center justify-between p-2.5 rounded-[7px] bg-white/5 border border-white/10">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-white truncate">{p.title}</p>
                    <p className="text-[10px] text-white/50 font-mono">{p.url}</p>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}${p.url}`)}
                    className="ml-3 px-2.5 py-1 text-[10px] font-medium text-indigo-400 bg-indigo-500/10 rounded-[7px] shrink-0"
                  >
                    Copy
                  </button>
                </div>
              ))}
            </div>
            <button onClick={reset} className="mt-3 w-full h-10 flex items-center justify-center text-[11px] font-medium text-indigo-400 border border-indigo-500/30 rounded-[10px]">
              Create Another
            </button>
          </div>
        ) : (
          <>
            <div className="flex border-b border-white/[0.06] shrink-0">
              <button
                onClick={() => { setTab("paste"); searchRanRef.current = false; }}
                className={`flex-1 flex items-center justify-center gap-1.5 h-10 text-[11px] font-medium transition-colors ${tab === "paste" ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]" : "text-white/50"}`}
              >
                <Link size={11} /> Paste Link
              </button>
              <button
                onClick={() => setTab("search")}
                className={`flex-1 flex items-center justify-center gap-1.5 h-10 text-[11px] font-medium transition-colors ${tab === "search" ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]" : "text-white/50"}`}
              >
                <Search size={11} /> Search Jobs
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {error && <div className="mb-3 p-2.5 rounded-[7px] bg-red-500/10 border border-red-500/20 text-[11px] text-red-400">{error}</div>}

              {tab === "paste" && !scrapedJob && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-white mb-1.5">Job URL</label>
                    <input type="url" value={pasteUrl} onChange={(e) => setPasteUrl(e.target.value)} placeholder="https://linkedin.com/jobs/..."
                      className="w-full h-10 px-3 text-[11px] text-white placeholder-white/30 border border-white/10 rounded-[10px] bg-white/5 focus:outline-none focus:border-[var(--color-accent)]" />
                  </div>
                  <button onClick={handleScrape} disabled={loading || !pasteUrl.trim()}
                    className="w-full h-10 flex items-center justify-center gap-1.5 text-[11px] font-medium text-white bg-indigo-600 rounded-[10px] disabled:opacity-50">
                    {loading ? <Loader2 size={11} className="animate-spin" /> : <Link size={11} />}
                    {loading ? "Scraping..." : "Scrape & Paraphrase"}
                  </button>
                </div>
              )}

              {tab === "paste" && scrapedJob && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-medium text-white/50 mb-0.5">Job Title</label>
                    <input type="text" value={scrapedJob.job_title} onChange={(e) => setScrapedJob({ ...scrapedJob, job_title: e.target.value })}
                      className="w-full h-10 px-2.5 text-[11px] text-white border border-white/10 rounded-[10px] bg-white/5 focus:outline-none focus:border-[var(--color-accent)]" />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-medium text-white/50 mb-0.5">Company</label>
                      <input type="text" value={scrapedJob.company} onChange={(e) => setScrapedJob({ ...scrapedJob, company: e.target.value })}
                        className="w-full h-10 px-2.5 text-[11px] text-white border border-white/10 rounded-[10px] bg-white/5 focus:outline-none focus:border-[var(--color-accent)]" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-white/50 mb-0.5">Location</label>
                      <input type="text" value={scrapedJob.location} onChange={(e) => setScrapedJob({ ...scrapedJob, location: e.target.value })}
                        className="w-full h-10 px-2.5 text-[11px] text-white border border-white/10 rounded-[10px] bg-white/5 focus:outline-none focus:border-[var(--color-accent)]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-white/50 mb-0.5">Paraphrased Description</label>
                    <textarea value={scrapedJob.paraphrased_description} onChange={(e) => setScrapedJob({ ...scrapedJob, paraphrased_description: e.target.value })}
                      rows={8}
                      className="w-full px-2.5 py-1.5 text-[11px] text-white border border-white/10 rounded-[10px] bg-white/5 focus:outline-none focus:border-[var(--color-accent)] resize-none" />
                  </div>
                  <button onClick={handlePublishPaste} disabled={publishing}
                    className="w-full h-10 flex items-center justify-center gap-1.5 text-[11px] font-medium text-white bg-emerald-600 rounded-[10px] disabled:opacity-50">
                    {publishing ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    {publishing ? "Publishing..." : "Publish"}
                  </button>
                </div>
              )}

              {tab === "search" && loading && (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Loader2 size={25} className="animate-spin text-indigo-400" />
                  <div className="text-center">
                    <p className="text-[11px] font-medium text-white">Searching high-demand jobs in Gauteng...</p>
                    <p className="text-[10px] text-white/50 mt-1">AI is selecting the top 5 most popular roles</p>
                  </div>
                </div>
              )}

              {tab === "search" && !loading && searchResults.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] text-white/50">AI picked these {searchResults.length} high-application jobs. Uncheck any you don&apos;t want, then publish.</p>
                  <div className="space-y-1.5">
                    {searchResults.map((r, i) => (
                      <button key={i} onClick={() => toggleResult(i)}
                        className={`w-full text-left p-2.5 rounded-[10px] border transition-colors ${r.selected ? "border-indigo-500 bg-indigo-500/10" : "border-white/10 bg-white/5"}`}>
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-white truncate">{r.title}</p>
                            <p className="text-[10px] text-white/50">{r.company_name}, {r.location || "Gauteng"}</p>
                          </div>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${r.selected ? "border-indigo-500 bg-indigo-500" : "border-white/30"}`}>
                            {r.selected && <Check size={10} className="text-white" />}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <button onClick={handlePublishBatch} disabled={publishing || selectedCount === 0}
                    className="w-full h-10 flex items-center justify-center gap-1.5 text-[11px] font-medium text-white bg-emerald-600 rounded-[10px] disabled:opacity-50">
                    {publishing ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                    {publishing ? "Paraphrasing & Publishing..." : `Publish ${selectedCount} Selected`}
                  </button>
                </div>
              )}

              {tab === "search" && !loading && searchResults.length === 0 && !error && (
                <div className="text-center py-10"><p className="text-[11px] text-white/50">No results found. Try again later.</p></div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

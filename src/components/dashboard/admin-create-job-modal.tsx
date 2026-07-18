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

interface AdminCreateJobModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminCreateJobModal({ isOpen, onClose }: AdminCreateJobModalProps) {
  const [tab, setTab] = useState<Tab>("paste");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [pasteUrl, setPasteUrl] = useState("");
  const [scrapedJob, setScrapedJob] = useState<ScrapedJob | null>(null);

  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const searchRanRef = useRef(false);

  const [published, setPublished] = useState<PublishedJob[]>([]);
  const [publishing, setPublishing] = useState(false);

  const reset = useCallback(() => {
    setPasteUrl("");
    setScrapedJob(null);
    setSearchResults([]);
    setPublished([]);
    setError("");
    setLoading(false);
    setPublishing(false);
    searchRanRef.current = false;
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleTabChange = useCallback((newTab: Tab) => {
    setTab(newTab);
  }, []);

  // Auto-search when switching to search tab
  useEffect(() => {
    if (tab !== "search" || searchRanRef.current || isOpen === false) return;
    searchRanRef.current = true;

    const runSearch = async () => {
      setLoading(true);
      setError("");

      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setError("Not authenticated"); setLoading(false); return; }

        const res = await fetch("/api/admin/search-jobs", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Search failed");
          setLoading(false);
          return;
        }

        const data = await res.json();
        setSearchResults((data.results || []).map((r: SearchResult) => ({ ...r, selected: true })));
      } catch {
        setError("Network error. Please try again.");
      }
      setLoading(false);
    };

    runSearch();
  }, [tab, isOpen]);

  const handleScrape = async () => {
    if (!pasteUrl.trim()) return;
    setLoading(true);
    setError("");
    setScrapedJob(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Not authenticated"); setLoading(false); return; }

      const res = await fetch("/api/admin/create-job-post", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: pasteUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to scrape job page");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setScrapedJob(data);
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  const handlePublishPaste = async () => {
    if (!scrapedJob) return;
    setPublishing(true);
    setError("");

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Not authenticated"); setPublishing(false); return; }

      const res = await fetch("/api/admin/create-job-post", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "publish", job: scrapedJob }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to publish");
        setPublishing(false);
        return;
      }

      const data = await res.json();
      setPublished([data]);
      setScrapedJob(null);
      setPasteUrl("");
    } catch {
      setError("Network error. Please try again.");
    }
    setPublishing(false);
  };

  const toggleResult = (index: number) => {
    setSearchResults((prev) => {
      const updated = [...prev];
      const currentlySelected = updated.filter((r) => r.selected).length;
      if (!updated[index].selected && currentlySelected >= 5) return prev;
      updated[index] = { ...updated[index], selected: !updated[index].selected };
      return updated;
    });
  };

  const handlePublishBatch = async () => {
    const selected = searchResults.filter((r) => r.selected);
    if (selected.length === 0) return;
    setPublishing(true);
    setError("");

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Not authenticated"); setPublishing(false); return; }

      const res = await fetch("/api/admin/publish-jobs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jobs: selected }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to publish batch");
        setPublishing(false);
        return;
      }

      const data = await res.json();
      setPublished(data.published || []);
      setSearchResults([]);
      searchRanRef.current = false;
    } catch {
      setError("Network error. Please try again.");
    }
    setPublishing(false);
  };

  if (!isOpen) return null;

  const selectedCount = searchResults.filter((r) => r.selected).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className="relative w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Create Job Post</h2>
          <button onClick={handleClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {published.length > 0 ? (
          <div className="p-6 overflow-y-auto max-h-[calc(85vh-64px)]">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check size={16} className="text-emerald-600" />
              </div>
              <p className="text-sm font-medium text-gray-900">{published.length} job post{published.length > 1 ? "s" : ""} created</p>
            </div>
            <div className="space-y-2">
              {published.map((p) => (
                <div key={p.slug} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
                    <p className="text-xs text-gray-500 font-mono">{p.url}</p>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}${p.url}`)}
                    className="ml-3 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors shrink-0"
                  >
                    Copy Link
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={reset}
              className="mt-4 w-full px-4 py-2.5 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              Create Another
            </button>
          </div>
        ) : (
          <>
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => handleTabChange("paste")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  tab === "paste"
                    ? "text-indigo-600 border-b-2 border-indigo-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Link size={14} />
                Paste Link
              </button>
              <button
                onClick={() => handleTabChange("search")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  tab === "search"
                    ? "text-indigo-600 border-b-2 border-indigo-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Search size={14} />
                Search Jobs
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(85vh-130px)]">
              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </div>
              )}

              {tab === "paste" && !scrapedJob && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Job URL</label>
                    <input
                      type="url"
                      value={pasteUrl}
                      onChange={(e) => setPasteUrl(e.target.value)}
                      placeholder="https://linkedin.com/jobs/..."
                      className="w-full px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <button
                    onClick={handleScrape}
                    disabled={loading || !pasteUrl.trim()}
                    className="w-full px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Link size={14} />}
                    {loading ? "Scraping..." : "Scrape & Paraphrase"}
                  </button>
                </div>
              )}

              {tab === "paste" && scrapedJob && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Job Title</label>
                    <input
                      type="text"
                      value={scrapedJob.job_title}
                      onChange={(e) => setScrapedJob({ ...scrapedJob, job_title: e.target.value })}
                      className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
                      <input
                        type="text"
                        value={scrapedJob.company}
                        onChange={(e) => setScrapedJob({ ...scrapedJob, company: e.target.value })}
                        className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                      <input
                        type="text"
                        value={scrapedJob.location}
                        onChange={(e) => setScrapedJob({ ...scrapedJob, location: e.target.value })}
                        className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Paraphrased Description</label>
                    <textarea
                      value={scrapedJob.paraphrased_description}
                      onChange={(e) => setScrapedJob({ ...scrapedJob, paraphrased_description: e.target.value })}
                      rows={12}
                      className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                    />
                  </div>
                  <button
                    onClick={handlePublishPaste}
                    disabled={publishing}
                    className="w-full px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {publishing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {publishing ? "Publishing..." : "Publish"}
                  </button>
                </div>
              )}

              {tab === "search" && loading && (
                <div className="flex flex-col items-center gap-4 py-12">
                  <Loader2 size={32} className="animate-spin text-indigo-600" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-900">Searching high-demand jobs in Gauteng...</p>
                    <p className="text-xs text-gray-500 mt-1">AI is selecting the top 5 most popular roles</p>
                  </div>
                </div>
              )}

              {tab === "search" && !loading && searchResults.length > 0 && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500">
                    AI picked these {searchResults.length} high-application jobs. Uncheck any you don&apos;t want, then publish.
                  </p>
                  <div className="space-y-2">
                    {searchResults.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => toggleResult(i)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          r.selected
                            ? "border-indigo-500 bg-indigo-50"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                            <p className="text-xs text-gray-500">{r.company_name}, {r.location || "Gauteng"}</p>
                          </div>
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                            r.selected ? "border-indigo-500 bg-indigo-500" : "border-gray-300"
                          }`}>
                            {r.selected && <Check size={12} className="text-white" />}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handlePublishBatch}
                    disabled={publishing || selectedCount === 0}
                    className="w-full px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {publishing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    {publishing
                      ? "Paraphrasing & Publishing..."
                      : `Publish ${selectedCount} Selected`}
                  </button>
                </div>
              )}

              {tab === "search" && !loading && searchResults.length === 0 && !error && (
                <div className="text-center py-12">
                  <p className="text-sm text-gray-500">No results found. Try again later.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

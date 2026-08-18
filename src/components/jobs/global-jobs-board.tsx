"use client";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { JobResultCard } from "@/components/dashboard/job-result-card";
import { MobileJobCard } from "@/components/dashboard/mobile/mobile-job-card";
import { useIsMobile } from "@/hooks/use-mobile";
import type { JobBoard, JobCard } from "@/data/jobs/types";

function toCardProps(job: JobCard, boardSlug: string) {
  return {
    id: job.slug,
    jobTitle: job.title,
    company: job.company,
    location: job.location,
    salary: job.salary,
    snippet: job.snippet,
    description: job.description,
    jobUrl: job.applyUrl,
    detailHref: `/jobs/${boardSlug}/${job.slug}`,
  };
}

function BoardTag({ name }: { name: string }) {
  return (
    <span className="inline-block mb-2 text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-white/10 text-white/60 border border-white/10">
      {name}
    </span>
  );
}

export function GlobalJobsBoard({ boards }: { boards: JobBoard[] }) {
  const isMobile = useIsMobile();

  const totalJobs = boards.reduce((sum, b) => sum + b.jobs.length, 0);

  return (
    <DashboardLayout guest onGuestSignUp={() => {}}>
      <div className={`max-w-4xl mx-auto space-y-8 ${isMobile ? "pt-2" : "pt-8"}`}>
        <div className={isMobile ? "space-y-0.5" : "text-center mb-1"}>
          <h1 className="text-base md:text-lg font-semibold text-white">
            All Job Cards
          </h1>
          <p className="text-sm text-white/70">
            {totalJobs} curated roles across {boards.length} sectors
          </p>
        </div>

        {boards.map((board) => (
          <div key={board.slug} className="space-y-3">
            <h2 className="text-sm font-semibold text-white/90">
              {board.name}
              <span className="ml-2 text-xs font-normal text-white/50">
                {board.jobs.length} {board.jobs.length === 1 ? "role" : "roles"}
              </span>
            </h2>
            {board.jobs.length > 0 ? (
              board.jobs.map((job) => (
                <div key={job.slug} className="flex flex-col">
                  <BoardTag name={board.name} />
                  {isMobile ? (
                    <MobileJobCard
                      {...toCardProps(job, board.slug)}
                      matchScore={0}
                      fullDescription=""
                      onDelete={() => {}}
                      onGenerateCv={() => {}}
                      onViewJob={() => {
                        try { localStorage.setItem("fmsg-view-job-from", "/jobs/global"); } catch {}
                      }}
                      guest
                      gold={job.featured}
                    />
                  ) : (
                    <JobResultCard
                      {...toCardProps(job, board.slug)}
                      matchScore={0}
                      fullDescription=""
                      onDelete={() => {}}
                      onGenerateCv={() => {}}
                      onViewJob={() => {
                        try { localStorage.setItem("fmsg-view-job-from", "/jobs/global"); } catch {}
                      }}
                      guest
                      gold={job.featured}
                    />
                  )}
                </div>
              ))
            ) : (
              <div className="liquid-glass rounded-xl p-5 text-center">
                <p className="text-sm text-white/70">
                  More {board.name.toLowerCase()} roles coming soon.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}

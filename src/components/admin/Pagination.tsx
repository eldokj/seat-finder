import Link from "next/link";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  basePath: string;
  /** Other query params to preserve across page links (e.g. filters). */
  searchParams?: Record<string, string>;
}

/** Phase 10 — shared offset pagination for the admin list pages that could
 * grow unbounded over years of use (Rooms, Daily Exam Sessions, Reports).
 * Renders nothing for a single page, so it's safe to always include. */
export function Pagination({ currentPage, totalPages, totalCount, pageSize, basePath, searchParams = {} }: PaginationProps) {
  if (totalPages <= 1) return null;

  function hrefFor(page: number) {
    const params = new URLSearchParams({ ...searchParams, page: String(page) });
    return `${basePath}?${params.toString()}`;
  }

  const firstOnPage = (currentPage - 1) * pageSize + 1;
  const lastOnPage = Math.min(currentPage * pageSize, totalCount);

  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      {currentPage > 1 ? (
        <Link href={hrefFor(currentPage - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
          ← Previous
        </Link>
      ) : (
        <span aria-disabled="true" className="cursor-not-allowed rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-300">
          ← Previous
        </span>
      )}

      <span className="text-slate-500">
        Showing {firstOnPage}–{lastOnPage} of {totalCount} · Page {currentPage} of {totalPages}
      </span>

      {currentPage < totalPages ? (
        <Link href={hrefFor(currentPage + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
          Next →
        </Link>
      ) : (
        <span aria-disabled="true" className="cursor-not-allowed rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-300">
          Next →
        </span>
      )}
    </nav>
  );
}

export const DEFAULT_PAGE_SIZE = 20;

/** Parses a `?page=` search param into a valid 1-based page number. */
export function parsePageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

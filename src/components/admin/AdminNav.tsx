"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  /** false = shown but not yet built; renders as a disabled, non-clickable item. */
  enabled: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin", enabled: true },
  { label: "Examination Periods", href: "/admin/examination-periods", enabled: true },
  { label: "Daily Exam Sessions", href: "/admin/daily-events", enabled: true },
  // The only exam-data import workflow — the old separate Master Timetable
  // and Student Roster upload screens were removed as a product decision.
  { label: "Consolidated Exam + Student Import", href: "/admin/exam-data", enabled: true },
  { label: "Rooms", href: "/admin/rooms", enabled: true },
  { label: "Seating Allocation", href: "/admin/seating", enabled: true },
  { label: "Seating Rules", href: "/admin/seating-rules", enabled: true },
  { label: "Search Student", href: "/admin/search", enabled: false },
  { label: "Reports", href: "/admin/reports", enabled: true },
  { label: "Settings", href: "/admin/settings", enabled: false },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-t border-slate-800 bg-slate-900">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-x-1 gap-y-1 px-2 py-1.5">
        {NAV_ITEMS.map((item) => {
          if (!item.enabled) {
            return (
              <span
                key={item.href}
                title="Not available yet"
                className="flex cursor-not-allowed items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-600"
              >
                {item.label}
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Soon
                </span>
              </span>
            );
          }

          const isActive =
            pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                isActive ? "bg-white text-slate-900" : "text-slate-200 hover:bg-slate-800"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

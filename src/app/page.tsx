import { SeatFinder } from "@/components/student/SeatFinder";
import { branding } from "@/lib/config/branding";

export default function StudentHomePage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-6 text-center">
        {branding.collegeLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo URL is admin-configured, arbitrary host
          <img
            src={branding.collegeLogoUrl}
            alt={`${branding.collegeName} logo`}
            className="mx-auto mb-3 h-14 w-auto object-contain"
          />
        ) : null}
        <p className="text-sm font-semibold text-slate-500">{branding.collegeName}</p>
      </header>

      <main className="flex flex-1 flex-col items-center px-5 py-10 sm:py-16">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Exam Seat Finder
            </h1>
            <p className="mt-2 text-base text-slate-600">Find your examination hall and seat</p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
            <SeatFinder />
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-6 text-center text-sm text-slate-500">
        <p className="font-semibold text-slate-700">{branding.coeOfficeName}</p>
        <p>{branding.collegeName}</p>
      </footer>
    </div>
  );
}

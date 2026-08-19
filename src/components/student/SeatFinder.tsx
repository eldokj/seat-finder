"use client";

import { useState, type FormEvent } from "react";
import { isValidRegisterNumberInput } from "@/lib/utils/register-number";
import { formatLongDate } from "@/lib/utils/date";
import { STUDENT_MESSAGES } from "@/lib/config/messages";
import type { PublicSeatResult } from "@/types/database";

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; results: PublicSeatResult[] };

export function SeatFinder() {
  const [registerNumber, setRegisterNumber] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isValidRegisterNumberInput(registerNumber)) {
      setState({ status: "error", message: STUDENT_MESSAGES.emptyRegisterNumber });
      return;
    }

    setState({ status: "loading" });

    try {
      const response = await fetch("/api/public/seat-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registerNumber }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setState({
          status: "error",
          message: (data && typeof data.error === "string" && data.error) || STUDENT_MESSAGES.genericError,
        });
        return;
      }

      const results = Array.isArray(data?.results) ? (data.results as PublicSeatResult[]) : [];
      if (results.length === 0) {
        setState({ status: "error", message: STUDENT_MESSAGES.notFound });
        return;
      }

      setState({ status: "success", results });
    } catch {
      setState({ status: "error", message: STUDENT_MESSAGES.genericError });
    }
  }

  function handleSearchAgain() {
    setState({ status: "idle" });
    setRegisterNumber("");
  }

  if (state.status === "success") {
    return <SeatResults results={state.results} onSearchAgain={handleSearchAgain} />;
  }

  return (
    <form onSubmit={handleSubmit} className="w-full" noValidate>
      <label htmlFor="registerNumber" className="mb-2 block text-sm font-semibold text-slate-700">
        Register Number
      </label>
      <input
        id="registerNumber"
        name="registerNumber"
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        placeholder="e.g. 25BCS034"
        value={registerNumber}
        onChange={(e) => setRegisterNumber(e.target.value)}
        disabled={state.status === "loading"}
        aria-invalid={state.status === "error"}
        aria-describedby={state.status === "error" ? "registerNumber-error" : undefined}
        className="w-full rounded-xl border-2 border-slate-300 px-5 py-4 text-xl font-medium tracking-wide text-slate-900 shadow-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100"
      />

      {state.status === "error" && (
        <p id="registerNumber-error" role="alert" className="mt-3 text-base font-medium text-red-600">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={state.status === "loading"}
        className="mt-5 w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-bold uppercase tracking-wide text-white shadow-md transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        {state.status === "loading" ? "Searching…" : "Find My Seat"}
      </button>
    </form>
  );
}

/** Renders 1 or 2 results (a student can have both an FN and an AN exam on
 * the same day) — each in its own card, sharing one register/name header
 * since that's identical across every result for a single search. */
function SeatResults({ results, onSearchAgain }: { results: PublicSeatResult[]; onSearchAgain: () => void }) {
  const [first] = results;

  return (
    <div className="w-full">
      <h2 className="mb-4 text-center text-sm font-bold uppercase tracking-widest text-slate-500">
        {results.length > 1 ? `Exam Seat Details — ${results.length} Exams Today` : "Exam Seat Details"}
      </h2>

      <dl className="mb-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white text-base">
        <Row label="Register Number" value={first.registerNo} />
        <Row label="Student Name" value={first.studentName} />
        {first.programme && <Row label="Programme" value={first.programme} />}
        <Row label="Date" value={formatLongDate(first.examDate)} />
      </dl>

      <div className="space-y-4">
        {results.map((result) => (
          <SeatCard key={`${result.session}-${result.roomName}-${result.seatNo}`} result={result} />
        ))}
      </div>

      <p className="mt-6 text-center text-sm text-slate-600">{STUDENT_MESSAGES.reportInstruction}</p>

      <button
        type="button"
        onClick={onSearchAgain}
        className="mt-6 w-full rounded-xl border-2 border-slate-300 px-6 py-3 text-base font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        Search Another Register Number
      </button>
    </div>
  );
}

const SESSION_LABEL: Record<PublicSeatResult["session"], string> = {
  FN: "Forenoon (FN)",
  AN: "Afternoon (AN)",
};

function SeatCard({ result }: { result: PublicSeatResult }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-2.5">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{SESSION_LABEL[result.session]}</p>
        <p className="text-sm font-semibold text-slate-800">
          {result.courseName} <span className="font-normal text-slate-400">({result.courseCode})</span>
        </p>
      </div>
      <div className="bg-blue-700 px-6 py-8 text-center text-white">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-100">Your Exam Seat</p>
        <p className="mt-3 text-3xl font-extrabold uppercase tracking-wide">{result.roomName}</p>
        <p className="mt-2 text-2xl font-bold">
          Seat <span className="tracking-widest">{result.seatNo}</span>
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

import { ExaminationPeriodForm } from "../ExaminationPeriodForm";
import { createExaminationPeriodAction } from "../actions";

export default function NewExaminationPeriodPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-slate-900">New Examination Period</h1>
      <p className="mt-1 text-sm text-slate-500">
        Represents the complete examination (e.g. Mid Semester Examination, 18–22 Aug 2026) — not a
        single day or course. Daily Exam Sessions are created automatically once you upload its
        Master Timetable.
      </p>

      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <ExaminationPeriodForm mode="create" action={createExaminationPeriodAction} />
      </div>
    </div>
  );
}

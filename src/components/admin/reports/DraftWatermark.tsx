/** Shown on both screen AND print (never print:hidden) whenever the
 * underlying event isn't published yet — internal reports stay usable
 * before publish, but must never be mistaken for a final, distributable
 * document. */
export function DraftWatermark() {
  return (
    <div className="mb-4 rounded-lg border-2 border-dashed border-red-500 bg-red-50 px-4 py-2 text-center print:border-red-600 print:bg-white">
      <p className="text-sm font-extrabold uppercase tracking-widest text-red-700">DRAFT — INTERNAL USE ONLY</p>
    </div>
  );
}

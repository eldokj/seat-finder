/**
 * Centralized user-facing copy for the student seat lookup flow.
 * Kept in one place so the Phase 1 UI and the Phase 6 API route (and its
 * tests) always show/expect exactly the same wording.
 */
export const STUDENT_MESSAGES = {
  emptyRegisterNumber: "Please enter your Register Number.",
  notFound: "Seat allocation not found.",
  notPublished:
    "Today's examination seating has not been published yet. Please contact the COE Office.",
  closed: "Today's examination seating is no longer available.",
  reportInstruction: "Please report to your examination hall before the examination begins.",
  genericError: "Unable to process your request right now. Please try again shortly.",
  tooManyRequests: "Too many attempts. Please wait a moment and try again.",
} as const;

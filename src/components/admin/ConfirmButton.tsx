"use client";

import type { ButtonHTMLAttributes } from "react";

interface ConfirmButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  confirmMessage: string;
}

/**
 * A submit button that shows a native browser confirm() dialog before the
 * enclosing form actually submits — used for every status-changing action
 * (publish/unpublish/close/delete/deactivate) per the spec's requirement
 * that publishing (and similar irreversible-ish actions) show an "Are you
 * sure?" prompt first.
 */
export function ConfirmButton({ confirmMessage, onClick, ...props }: ConfirmButtonProps) {
  return (
    <button
      {...props}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    />
  );
}

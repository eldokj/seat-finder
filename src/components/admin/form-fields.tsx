import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

interface FieldWrapperProps {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}

function FieldWrapper({ label, htmlFor, error, children }: FieldWrapperProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="mt-1 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClassName =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-base text-slate-900 outline-none transition focus:border-slate-600 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  error?: string;
};

export function TextField({ label, name, error, className, ...props }: TextFieldProps) {
  return (
    <FieldWrapper label={label} htmlFor={name} error={error}>
      <input id={name} name={name} className={className ?? inputClassName} {...props} />
    </FieldWrapper>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  name: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
};

export function SelectField({
  label,
  name,
  error,
  options,
  placeholder,
  className,
  ...props
}: SelectFieldProps) {
  return (
    <FieldWrapper label={label} htmlFor={name} error={error}>
      <select id={name} name={name} className={className ?? inputClassName} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

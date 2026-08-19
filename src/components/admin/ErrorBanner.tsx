export function ErrorBanner({ message }: { message: string }) {
  return (
    <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
      {message}
    </p>
  );
}

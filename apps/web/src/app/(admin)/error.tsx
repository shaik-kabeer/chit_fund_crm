'use client';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-center max-w-md">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Admin panel error</h1>
        <p className="text-gray-500 mb-6">{error.message || 'Something went wrong loading this page.'}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

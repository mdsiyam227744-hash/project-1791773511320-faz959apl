import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-start px-4 py-24">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-2 text-navy-600">
        The page you are looking for does not exist or is not published yet.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-[var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
      >
        Back to home
      </Link>
    </div>
  );
}

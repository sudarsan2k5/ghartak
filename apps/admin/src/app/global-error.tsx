"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-[#F6F4EE] text-[#1C1914]">
        <main className="grid min-h-screen place-items-center px-6">
          <section className="max-w-md rounded-2xl border border-[#E4DFD4] bg-white p-6">
            <h1 className="text-xl font-extrabold">The dashboard could not load</h1>
            <p className="mt-3 text-sm leading-6">Try again. If this continues, sign in from the login page.</p>
            <button type="button" className="mt-5 rounded-xl bg-[#1C1914] px-4 py-2 text-sm font-medium text-white" onClick={() => reset()}>
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}

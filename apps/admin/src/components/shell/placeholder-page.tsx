export function PlaceholderPage({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="max-w-2xl rounded-2xl border border-line bg-white p-6 shadow-card">
      <h2 className="font-display text-lg font-extrabold">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-secondary">{detail}</p>
    </section>
  );
}

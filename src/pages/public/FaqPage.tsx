import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { PublicLayout } from "@/layouts/PublicLayout";
import { EmptyState, SearchInput, SegmentedFilter } from "@/components/common/Primitives";
import { FAQ_ITEMS } from "@/data/publicContent";
import type { FaqItem } from "@/types/domain";

export function FaqPage() {
  const [category, setCategory] = useState<"ALL" | FaqItem["category"]>("ALL");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(FAQ_ITEMS[0]?.id ?? null);

  const filtered = FAQ_ITEMS.filter((item) => {
    const matchesCat = category === "ALL" || item.category === category;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q || item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q);
    return matchesCat && matchesQuery;
  });

  const hasActiveFilter = category !== "ALL" || query.trim().length > 0;

  return (
    <PublicLayout>
      <section className="border-b border-border bg-card py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-medium text-muted-foreground">Knowledge Base</p>
          <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-foreground">
            Frequently Asked Questions
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Clear documentation on Naira wallet funding, investment risks, maturity settlements, and
            account security.
          </p>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search questions..."
              ariaLabel="Search frequently asked questions"
              className="w-full max-w-md flex-1"
            />
            <SegmentedFilter
              ariaLabel="Filter questions by category"
              value={category}
              onChange={setCategory}
              options={[
                { label: "All", value: "ALL" },
                { label: "General", value: "General" },
                { label: "Wallet & Funding", value: "Wallet & Funding" },
                { label: "Investments & Risk", value: "Investments & Risk" },
                { label: "Referrals & Security", value: "Referrals & Security" },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <p aria-live="polite" className="mb-4 text-xs text-muted-foreground">
          Showing {filtered.length} of {FAQ_ITEMS.length} documented answers
          {hasActiveFilter ? " matching your filter." : "."}
        </p>

        {filtered.length === 0 ? (
          <EmptyState
            title="No matching questions"
            description="No FAQ entries matched your current search term or category filter."
            action={
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCategory("ALL");
                }}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:bg-secondary"
              >
                Clear Search & Filters
              </button>
            }
          />
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {filtered.map((item) => {
              const isOpen = openId === item.id;
              const panelId = `faq-panel-${item.id}`;
              return (
                <div key={item.id} className="py-5">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                    className="flex w-full items-start justify-between gap-4 text-left"
                  >
                    <div>
                      <p className="text-xs text-muted-foreground">{item.category}</p>
                      <p className="mt-1 text-base font-semibold text-foreground">{item.question}</p>
                    </div>
                    <ChevronDown
                      className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                  {isOpen && (
                    <p
                      id={panelId}
                      className="mt-3 text-sm leading-relaxed text-muted-foreground"
                    >
                      {item.answer}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </PublicLayout>
  );
}

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { PublicLayout } from "@/layouts/PublicLayout";
import { SegmentedFilter } from "@/components/common/Primitives";
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
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search questions..."
                className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <SegmentedFilter
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
        <div className="divide-y divide-border border-y border-border">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No questions matched your filter. Try clearing the search term.
            </p>
          ) : (
            filtered.map((item) => {
              const isOpen = openId === item.id;
              return (
                <div key={item.id} className="py-5">
                  <button
                    type="button"
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
                    />
                  </button>
                  {isOpen && (
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {item.answer}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </PublicLayout>
  );
}

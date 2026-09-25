import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Drawer } from '@/components/ui';
import { pageGuideContent, type GuideContent, type PageGuide } from '@/content/pageGuides';

/**
 * Written guides, in a drawer from the right so the page stays in view behind
 * them: the "Page guide" in each page header (what is on the page and what
 * each part does), and "How it works" on the Scenarios section. Written
 * content (see `content/pageGuides.ts`), not AI: they describe the page and
 * its rules, never its figures.
 */
export function GuideDrawer({
  open,
  onClose,
  title,
  subtitle,
  content,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  content: GuideContent;
}) {
  return (
    <Drawer open={open} onClose={onClose} title={title} subtitle={subtitle} width={460}>
      <p className="text-prose leading-relaxed text-foreground">{content.intro}</p>
      {content.sections.map((section) => (
        <section key={section.heading}>
          <h3 className="mono mt-5 text-note font-bold uppercase tracking-[0.11em] text-muted-foreground">
            {section.heading}
          </h3>
          {section.entries.every((e) => e.name) ? (
            <dl className="mt-2 divide-y divide-border border-y border-border">
              {section.entries.map((e) => (
                <div key={e.name} className="py-2.5">
                  <dt className="text-body font-semibold text-foreground">{e.name}</dt>
                  <dd className="mt-0.5 text-body leading-relaxed text-muted-foreground">
                    {e.text}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-body leading-relaxed text-muted-foreground">
              {section.entries.map((e) => (
                <li key={e.text}>{e.text}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </Drawer>
  );
}

/** The "Page guide" button in the page header, beside "Ask the data". */
export function PageGuideButton({ guide, page }: { guide: PageGuide; page: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="What is on this page, and what each part does"
        aria-label="Page guide"
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-input px-2 text-body font-semibold text-foreground transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-3"
      >
        <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden whitespace-nowrap sm:inline">Page guide</span>
      </button>
      <GuideDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={`${page}: page guide`}
        subtitle="What is on this page, and what each part does"
        content={pageGuideContent(guide)}
      />
    </>
  );
}

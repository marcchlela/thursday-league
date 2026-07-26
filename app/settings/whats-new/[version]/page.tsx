import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { releaseByVersion, releaseNotes } from "@/content/whatsNew";
import { ReleaseLevelBadge } from "@/components/ReleaseLevelBadge";
import { SettingsHeader } from "@/components/SettingsComponents";

export function generateStaticParams() {
  return releaseNotes.map(release => ({ version: release.version }));
}

function releaseDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export default async function ReleaseNotesPage({ params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  const release = releaseByVersion(decodeURIComponent(version));
  if (!release) notFound();

  return (
    <article className="mx-auto max-w-3xl space-y-5">
      <SettingsHeader title={release.title} description={release.summary} backHref="/settings/whats-new" backLabel="What’s New" />

      <section className="overflow-hidden rounded-[1.35rem] border border-league-gold/25 bg-ink-850 shadow-[0_9px_24px_rgba(0,0,0,.12)]">
        <header className="border-b border-league-gold/15 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-black text-league-gold">Version {release.version}</span>
            <ReleaseLevelBadge level={release.level} />
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-chalk/35">
            <CalendarDays size={13} />
            Released {releaseDate(release.releasedAt)}
          </div>
        </header>

        <div className="divide-y divide-league-gold/15">
          {release.sections.map(section => (
            <section key={section.title} className="p-4 sm:p-5">
              <h2 className="font-display text-2xl uppercase text-chalk sm:text-3xl">{section.title}</h2>
              {section.paragraphs?.map(paragraph => <p key={paragraph} className="mt-3 text-sm leading-7 text-chalk/55">{paragraph}</p>)}
              {section.items?.length ? (
                <ul className="mt-3 space-y-2.5">
                  {section.items.map(item => (
                    <li key={item} className="flex gap-3 text-sm leading-6 text-chalk/55">
                      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-league-gold" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </section>
    </article>
  );
}

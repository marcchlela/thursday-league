import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import leagueLogo from "../../Thursday League logo (no bg).png";

const legalLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/support", label: "Support" },
  { href: "/delete-account", label: "Delete account" }
];

export function LegalLayout({
  eyebrow,
  title,
  intro,
  children
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100svh] bg-ink-900 bg-turfMuted text-chalk">
      <header className="border-b border-league-gold/15">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4 sm:px-6">
          <Link href="/welcome" className="flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold">
            <Image src={leagueLogo} alt="" priority className="h-11 w-11 object-contain" />
            <span>
              <span className="block font-display text-xl uppercase tracking-wide">Thursday League</span>
              <span className="block text-[9px] font-black uppercase tracking-[.18em] text-league-gold/65">Official information</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-xs font-bold text-chalk/40 transition hover:text-league-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold">
          <ArrowLeft size={14} />
          Settings
        </Link>
        <div className="mt-4 text-[10px] font-black uppercase tracking-[.2em] text-league-gold/70">{eyebrow}</div>
        <h1 className="mt-2 max-w-3xl font-display text-5xl uppercase leading-[.95] sm:text-6xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-chalk/60 sm:text-lg">{intro}</p>
        <div className="mt-9 space-y-5 text-sm leading-7 text-chalk/65 sm:text-base">{children}</div>
      </main>

      <footer className="border-t border-league-gold/12">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-6 text-xs text-chalk/40 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} Thursday League</span>
          <nav aria-label="Legal and support" className="flex flex-wrap gap-x-4 gap-y-2">
            {legalLinks.map(link => <Link key={link.href} href={link.href} className="transition hover:text-league-gold">{link.label}</Link>)}
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[1.35rem] border border-league-gold/18 bg-ink-850/80 p-5 sm:p-6">
      <h2 className="font-display text-2xl uppercase text-chalk">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-2xl place-items-center">
      <Card className="w-full">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-league-gold/20 bg-league-gold/[.055] text-league-gold">
            <KeyRound size={20} />
          </span>
          <div>
            <div className="text-[9px] font-black uppercase tracking-[.18em] text-league-gold/65">Account recovery</div>
            <h1 className="mt-1 font-display text-4xl uppercase">Forgot password?</h1>
          </div>
        </div>

        <div className="mt-5 flex gap-3 rounded-2xl border border-league-gold/20 bg-black/15 p-4">
          <ShieldCheck className="mt-0.5 shrink-0 text-league-gold" size={19} />
          <div>
            <p className="text-sm leading-relaxed text-chalk/70">
              Contact the app owner through your usual private channel. Recovery requests never reset a password automatically because a username alone does not prove account ownership.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-chalk/40">
              Secure email recovery will replace this manual process before public release.
            </p>
          </div>
        </div>

        <Link href="/login" className="mt-5 inline-flex rounded-2xl border border-league-gold/25 bg-black/15 px-4 py-2.5 text-sm font-bold text-chalk/70 transition hover:border-league-gold/50 hover:text-league-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-league-gold">Back to login</Link>
      </Card>
    </div>
  );
}

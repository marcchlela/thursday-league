const defaultSupportEmail = "thursdayleagueapp@gmail.com";
const configuredSupportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || defaultSupportEmail;

export const publicContact = {
  supportEmail: configuredSupportEmail,
  appName: "Thursday League",
  website: process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://thursday-league.vercel.app"
};

"use client";

import { supabase } from "./supabase";
import type { UserOnboarding } from "./types";

export const ONBOARDING_VERSION = 1;
export const INTRODUCTION_STORAGE_KEY = "thursday-league:introduction:v1";
export const POST_AUTH_PATH_KEY = "thursday-league-post-auth-path";

export function introductionWasSeen() {
  return window.localStorage.getItem(INTRODUCTION_STORAGE_KEY) === "completed";
}

export function saveIntroductionSeen() {
  window.localStorage.setItem(INTRODUCTION_STORAGE_KEY, "completed");
}

export async function readOnboardingProgress(userId: string) {
  const { data, error } = await supabase
    .from("user_onboarding")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as UserOnboarding | null;
}

export async function saveIntroductionProgress(userId: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("user_onboarding")
    .upsert({
      user_id: userId,
      onboarding_version: ONBOARDING_VERSION,
      introduction_completed_at: now
    }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function completeOnboarding(userId: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("user_onboarding")
    .upsert({
      user_id: userId,
      onboarding_version: ONBOARDING_VERSION,
      completed_at: now
    }, { onConflict: "user_id" });
  if (error) throw error;
}

export function savePostAuthPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) return;
  window.sessionStorage.setItem(POST_AUTH_PATH_KEY, path);
}

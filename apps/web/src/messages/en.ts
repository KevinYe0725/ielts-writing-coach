import type { Messages } from "./zh-CN";

export const en = {
  brand: "IELTS Writing",
  brandTagline: "Turn every recurring error into a reusable skill",
  nav: {
    today: "Today",
    write: "Writing room",
    feedback: "Feedback",
    lesson: "Focused lesson",
    rewrite: "Delayed rewrite",
    compare: "Version comparison",
    growth: "Growth",
    settings: "Settings",
    admin: "System status",
  },
  common: {
    loading: "Preparing your learning content…",
    retry: "Try again",
    save: "Save",
    saved: "Saved",
    continue: "Continue",
    backToday: "Back to today",
    minutes: "min",
    details: "View details",
    close: "Close",
  },
} as const satisfies Messages;

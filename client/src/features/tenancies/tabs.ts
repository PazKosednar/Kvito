export type TabBadgeKind = "unread" | "charges" | "contract";

/** Tabs of a tenancy, in order of everyday use. `path` is relative to /najemi/:id. */
export const TENANCY_TABS: { path: string; label: string; landlordOnly?: boolean; badge?: TabBadgeKind }[] = [
  { path: "", label: "tabs.charges", badge: "charges" },
  { path: "sporocila", label: "tabs.messages", badge: "unread" },
  { path: "pogodba", label: "tabs.contract", badge: "contract" },
  { path: "okvare", label: "tabs.issues" },
  { path: "stevci", label: "tabs.meters" },
  { path: "dokumenti", label: "tabs.documents" },
  { path: "primopredaja", label: "tabs.handover" },
  { path: "podatki", label: "tabs.details" },
];

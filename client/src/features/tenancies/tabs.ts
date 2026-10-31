/** Tabs of a tenancy, in order of everyday use. `path` is relative to /najemi/:id. */
export const TENANCY_TABS: { path: string; label: string; landlordOnly?: boolean; badge?: "unread" }[] = [
  { path: "", label: "tabs.charges" },
  { path: "sporocila", label: "tabs.messages", badge: "unread" },
  { path: "okvare", label: "tabs.issues" },
  { path: "stevci", label: "tabs.meters" },
  { path: "dokumenti", label: "tabs.documents" },
  { path: "primopredaja", label: "tabs.handover" },
  { path: "podatki", label: "tabs.details" },
];
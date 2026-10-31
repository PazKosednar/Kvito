/** Two-letter initials from a name, falling back to the e-mail's local part. */
export function initials(name: string | null | undefined, email: string): string {
  const source = name?.trim() || email.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : source.slice(0, 2);
  return letters.toLocaleUpperCase("sl");
}

export function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] ?? null;
}

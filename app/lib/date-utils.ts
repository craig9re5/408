export function formatDateShort(value: string): string {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length >= 3) {
    return `${parts[1]}/${parts[2]}`;
  }
  return value;
}

export function parseFlexibleDate(input: string): string | null {
  const normalized = input
    .trim()
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[／－．。]/g, "-")
    .replace(/年|月/g, "-")
    .replace(/[日号]$/u, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!normalized) return "";

  const currentYear = new Date().getFullYear();
  let year = currentYear;
  let month = 0;
  let day = 0;

  const ymdMatch = normalized.match(/^(\d{4})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])$/);
  if (ymdMatch) {
    year = parseInt(ymdMatch[1], 10);
    month = parseInt(ymdMatch[2], 10);
    day = parseInt(ymdMatch[3], 10);
  } else {
    const mdMatch = normalized.match(/^(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])$/);
    if (mdMatch) {
      month = parseInt(mdMatch[1], 10);
      day = parseInt(mdMatch[2], 10);
    } else if (/^\d{4}$/.test(normalized)) {
      month = parseInt(normalized.slice(0, 2), 10);
      day = parseInt(normalized.slice(2, 4), 10);
    } else if (/^\d{3}$/.test(normalized)) {
      month = parseInt(normalized.slice(0, 1), 10);
      day = parseInt(normalized.slice(1, 3), 10);
    } else {
      return null;
    }
  }

  if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      const mStr = String(month).padStart(2, "0");
      const dStr = String(day).padStart(2, "0");
      return `${year}-${mStr}-${dStr}`;
    }
  }

  return null;
}

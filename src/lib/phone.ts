const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizeDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

export function normalizePhoneNumber(value: string) {
  let phone = normalizeDigits(value).trim().replace(/[\s\-()]/g, "");

  if (phone.startsWith("+98")) {
    phone = `0${phone.slice(3)}`;
  } else if (phone.startsWith("0098")) {
    phone = `0${phone.slice(4)}`;
  } else if (phone.startsWith("98") && phone.length === 12) {
    phone = `0${phone.slice(2)}`;
  } else if (phone.startsWith("9") && phone.length === 10) {
    phone = `0${phone}`;
  }

  return phone;
}

export function normalizeLoginIdentifier(value: string) {
  const normalized = normalizeDigits(value).trim();
  const phone = normalizePhoneNumber(normalized);

  if (/^09\d{9}$/.test(phone)) {
    return phone;
  }

  return normalized;
}

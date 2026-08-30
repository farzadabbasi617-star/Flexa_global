import { z } from "zod";
import { normalizeLoginIdentifier, normalizePhoneNumber } from "@/lib/phone";
import { isRealEmail } from "@/lib/disposable-email";

// Email is now required at registration: the mobile number is still
// mandatory (used as an identifier/contact + login), but the OTP that
// confirms the account is sent to this address instead of by SMS.
//
// Coerces a missing/non-string value to an empty string first (instead of
// passing `undefined` straight into z.string(), which would surface zod's
// generic English "expected string, received undefined" message instead of
// our Persian "ایمیل الزامی است" one).
const requiredEmail = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : ""),
  z
    .string()
    .min(1, "ایمیل الزامی است")
    .email("ایمیل وارد شده معتبر نیست")
    .refine(isRealEmail, "استفاده از ایمیل‌های موقت/یک‌بارمصرف مجاز نیست. لطفاً یک ایمیل واقعی وارد کنید")
);

// Strong password policy: at least 10 characters, one uppercase letter, one
// lowercase letter, one digit and one special character. Enforced both on
// the client (for instant feedback) and here on the server (source of
// truth) so the rule can never be bypassed by calling the API directly.
export const PASSWORD_MIN_LENGTH = 10;
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `رمز عبور باید حداقل ${PASSWORD_MIN_LENGTH} کاراکتر باشد`)
  .max(128, "رمز عبور بیش از حد طولانی است")
  .regex(/[a-z]/, "رمز عبور باید حداقل یک حرف کوچک انگلیسی داشته باشد")
  .regex(/[A-Z]/, "رمز عبور باید حداقل یک حرف بزرگ انگلیسی داشته باشد")
  .regex(/[0-9]/, "رمز عبور باید حداقل یک عدد داشته باشد")
  .regex(/[^a-zA-Z0-9]/, "رمز عبور باید حداقل یک کاراکتر خاص (مثل !@#$%) داشته باشد");

/**
 * Validates an Iranian national ID (کد ملی) including the checksum digit.
 * Defined up here (before RegisterSchema) because both signup and KYC
 * submission share it.
 */
export function isValidIranianNationalId(value: string): boolean {
  const code = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(code)) return false;
  // Reject all-equal-digit codes (e.g. 0000000000) which pass the checksum but are invalid.
  if (/^(\d)\1{9}$/.test(code)) return false;
  const check = Number(code[9]);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(code[i]) * (10 - i);
  const remainder = sum % 11;
  return remainder < 2 ? check === remainder : check === 11 - remainder;
}

const nationalIdSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/\D/g, "") : v),
  z.string().refine(isValidIranianNationalId, "کد ملی وارد شده معتبر نیست")
);

// Birth date at signup: Gregorian ISO (YYYY-MM-DD). We ONLY accept a
// well-formed past date. Paid flows use it as identity metadata; there is no
// hard 18+ server-side block anymore. Users acknowledge the age/risk statement
// separately via `riskAndAgeAccepted`.
const registerBirthDateSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ تولد باید به فرمت YYYY-MM-DD (میلادی) باشد")
    .refine((v) => {
      const [y, m, d] = v.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return (
        dt.getUTCFullYear() === y &&
        dt.getUTCMonth() === m - 1 &&
        dt.getUTCDate() === d &&
        dt.getTime() < Date.now()
      );
    }, "تاریخ تولد وارد شده معتبر نیست")
);

export const RegisterSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "نام کاربری باید حداقل ۳ کاراکتر باشد")
    .max(20, "نام کاربری نباید بیشتر از ۲۰ کاراکتر باشد")
    .regex(/^[\p{L}\p{N}_.-]+$/u, "نام کاربری فقط می‌تواند شامل حروف، عدد، نقطه، خط تیره و آندرلاین باشد"),
  phoneNumber: z.preprocess(
    (value) => (typeof value === "string" ? normalizePhoneNumber(value) : value),
    z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست (مثال: 09123456789)")
  ),
  email: requiredEmail,
  password: passwordSchema,
  firstName: z.string().trim().min(2, "نام الزامی است").max(50, "نام بیش از حد طولانی است"),
  lastName: z.string().trim().min(2, "نام خانوادگی الزامی است").max(50, "نام خانوادگی بیش از حد طولانی است"),
  // Age-gate fields (see src/lib/age-gate.ts). Collected at signup so we
  // never have to interrupt a user mid-payment to ask for them.
  birthDate: registerBirthDateSchema,
  nationalId: nationalIdSchema,
  termsAccepted: z.boolean().refine((value) => value === true, "پذیرش قوانین و مقررات Flexa الزامی است"),
  riskAndAgeAccepted: z.boolean().refine((value) => value === true, "تأیید هشدارها، محدودیت‌ها و اعلام مسئولیت سنی الزامی است"),
});

export const EmailOtpRequestSchema = z.object({
  email: requiredEmail,
});

export const EmailOtpVerifySchema = z.object({
  email: requiredEmail,
  code: z.string().trim().regex(/^\d{6}$/, "کد تایید باید ۶ رقم باشد"),
});

export const PasswordResetRequestSchema = z.object({
  email: requiredEmail,
});

export const PasswordResetConfirmSchema = z.object({
  email: requiredEmail,
  code: z.string().trim().regex(/^\d{6}$/, "کد بازیابی باید ۶ رقم باشد"),
  password: passwordSchema,
});

export const LoginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "شماره موبایل، ایمیل یا نام کاربری الزامی است")
    .transform(normalizeLoginIdentifier),
  password: z.string().min(1, "رمز عبور الزامی است"),
  rememberMe: z.boolean().optional().default(false),
});

export const AIAnalyzePlayerSchema = z.object({
  playerId: z.string().uuid("ID بازیکن معتبر نیست"),
  stats: z.any().optional(),
});

export const AIAssistantSchema = z.object({
  message: z.string().min(1, "پیام نمی‌تواند خالی باشد").max(1000, "پیام بیش از حد طولانی است"),
});

export const AIModerateSchema = z.object({
  content: z.string().min(1, "محتوا برای بررسی الزامی است").max(5000),
});

// ===========================================================================
// STORE / MARKETPLACE & KYC
// ===========================================================================

// Accepts either a normal http(s) image URL (e.g. Cloudinary) OR an inline
// base64 data-image URL (used as a fallback when Cloudinary isn't configured,
// e.g. uploading the national-ID card / selfie / listing photos from the phone
// gallery). Data URLs are long, so they get a much larger length cap.
const imageRefSchema = z
  .string()
  .trim()
  .min(1, "تصویر الزامی است")
  .max(10_000_000, "حجم تصویر بیش از حد مجاز است")
  .refine(
    (v) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(v) || /^https?:\/\//i.test(v),
    "آدرس تصویر معتبر نیست"
  );

export const KycSubmitSchema = z.object({
  fullName: z.string().trim().min(3, "نام و نام خانوادگی الزامی است").max(150),
  nationalId: nationalIdSchema,
  birthDate: z
    .string()
    .trim()
    .regex(/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/, "تاریخ تولد معتبر نیست (مثال: 1375/03/21)")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  idCardImageUrl: imageRefSchema,
  // Selfies are no longer requested. Still accepted (and ignored) so an older
  // cached client bundle posting one does not fail validation.
  selfieImageUrl: imageRefSchema.optional(),
});

export const KycReviewSchema = z.object({
  decision: z.enum(["verified", "rejected"]),
  rejectionReason: z.string().trim().max(500).optional(),
});

const STORE_KINDS = ["currency", "account", "item", "service"] as const;
const STORE_GAMES = ["clash_royale", "cod_mobile", "fortnite"] as const;
const CURRENCY_KINDS = ["gem", "cp", "uc", "vbucks", "coin", "gold", "other"] as const;

// Price entered by users in TOMAN; converted to RIAL on the server.
const priceTomanSchema = z.coerce
  .number()
  .int("قیمت باید عدد صحیح باشد")
  .min(1000, "حداقل قیمت ۱۰۰۰ USDT است")
  .max(2_000_000_000, "قیمت بیش از حد مجاز است");

export const StoreListingCreateSchema = z
  .object({
    kind: z.enum(STORE_KINDS, { message: "نوع کالا معتبر نیست" }),
    game: z.enum(STORE_GAMES).optional(),
    title: z.string().trim().min(3, "عنوان الزامی است").max(200),
    description: z.string().trim().max(5000).optional(),
    priceToman: priceTomanSchema,
    currencyKind: z.enum(CURRENCY_KINDS).optional(),
    currencyAmount: z.coerce.number().int().min(1).max(100_000_000).optional(),
    stock: z.coerce.number().int().min(1, "موجودی حداقل ۱").max(100000).default(1),
    images: z.array(imageRefSchema).max(8, "حداکثر ۸ تصویر").default([]),
    deliveryNotes: z.string().trim().max(5000).optional(),
    warrantyDays: z.coerce.number().int().min(0).max(365).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (d) => d.kind !== "currency" || (d.currencyKind && d.currencyAmount),
    { message: "برای ارز داخل بازی، نوع و مقدار ارز الزامی است", path: ["currencyAmount"] }
  )
  // Unique account sales should not allow stock > 1 unless explicitly an item batch.
  .refine((d) => d.kind !== "account" || d.stock === 1, {
    message: "برای فروش اکانت، موجودی باید ۱ باشد",
    path: ["stock"],
  });

export const StoreOrderCreateSchema = z.object({
  listingId: z.string().uuid("شناسه آگهی معتبر نیست"),
  quantity: z.coerce.number().int().min(1).max(1000).default(1),
  buyerNote: z.string().trim().max(1000).optional(),
});

export const StoreOrderActionSchema = z.object({
  action: z.enum(["deliver", "confirm", "dispute", "cancel"]),
  reason: z.string().trim().max(1000).optional(),
});

export const StoreOfferCreateSchema = z.object({
  listingId: z.string().uuid("شناسه آگهی معتبر نیست"),
  offerToman: priceTomanSchema,
  message: z.string().trim().max(500).optional(),
});

export const StoreOfferActionSchema = z.object({
  action: z.enum(["accept", "reject", "withdraw"]),
});

export const StoreListingReviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  rejectionReason: z.string().trim().max(500).optional(),
});

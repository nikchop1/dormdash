import { z } from "zod";

// ---------- primitives ----------

/** Normalize a US phone number to E.164 (+1XXXXXXXXXX), or null if it isn't valid. */
export function normalizeUsPhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  // NANP: area code and exchange can't start with 0 or 1.
  if (!/[2-9]/.test(digits[0]) || !/[2-9]/.test(digits[3])) return null;
  // 555-01XX are fictional; everything else in 555 is fine.
  return `+1${digits}`;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = e164.replace(/^\+1/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

export function emailDomainAllowed(email: string, allowed: string[]): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return allowed.some((d) => domain === d);
}

export type PasswordCheck = { ok: boolean; score: 0 | 1 | 2 | 3 | 4; label: string; problems: string[] };

/** Rules: 8+ chars, at least one letter and one number. Score drives the strength meter. */
export function checkPassword(pw: string): PasswordCheck {
  const problems: string[] = [];
  if (pw.length < 8) problems.push("At least 8 characters");
  if (!/[A-Za-z]/.test(pw)) problems.push("At least one letter");
  if (!/[0-9]/.test(pw)) problems.push("At least one number");
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Za-z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) score++;
  if (problems.length) score = Math.min(score, 1);
  const labels = ["Too short", "Weak", "Okay", "Good", "Strong"];
  return { ok: problems.length === 0, score: score as PasswordCheck["score"], label: pw ? labels[score] : "", problems };
}

const password = z.string().max(128, "That's a long password. Keep it under 128 characters.").superRefine((pw, ctx) => {
  const c = checkPassword(pw);
  if (!c.ok) ctx.addIssue({ code: "custom", message: `Password needs: ${c.problems.join(", ").toLowerCase()}.` });
});

const emailBase = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

export const nyuEmail = (allowed: string[]) =>
  emailBase.refine((e) => emailDomainAllowed(e, allowed), {
    message: `Use your ${allowed.map((d) => "@" + d).join(" or ")} email. Dormdash is students only.`,
  });

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required.")
  .transform((v, ctx) => {
    const n = normalizeUsPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a 10-digit US phone number, like (212) 555-0142." });
      return z.NEVER;
    }
    return n;
  });

const uuid = z.string().uuid("Pick an option from the list.");
const floor = z.coerce.number().int("Floor should be a whole number.").min(1, "Floor starts at 1.").max(80);
const room = z.string().trim().min(1, "Room number is required.").max(12, "Room numbers are short. Check this one.");
const fullName = z.string().trim().min(2, "Enter your full name.").max(80);

// ---------- auth ----------

export const signupSchema = (allowed: string[]) =>
  z
    .object({
      fullName,
      email: nyuEmail(allowed),
      phone: phoneSchema,
      password,
      confirmPassword: z.string(),
      buildingId: uuid,
      floor,
      room,
      agreeTerms: z.literal(true, { message: "You need to agree to the Terms and Privacy Policy." }),
    })
    .refine((v) => v.password === v.confirmPassword, {
      path: ["confirmPassword"],
      message: "Passwords don't match.",
    });

export const loginSchema = z.object({
  email: emailBase,
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export const forgotSchema = z.object({ email: emailBase });
export const resetSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match." });

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Enter your current password."), password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match." })
  .refine((v) => v.password !== v.currentPassword, { path: ["password"], message: "Pick a password you haven't used here." });

export const changeEmailSchema = (allowed: string[]) => z.object({ email: nyuEmail(allowed) });

export const profileSchema = z.object({ fullName, phone: phoneSchema, buildingId: uuid, floor, room });

export const notificationPrefsSchema = z.object({
  push_order_updates: z.boolean(),
  push_new_jobs: z.boolean(),
  push_disputes: z.boolean(),
  push_account: z.boolean(),
  email_order_updates: z.boolean(),
  email_disputes: z.boolean(),
  email_account: z.boolean(),
});

export const deleteAccountSchema = z.object({
  confirm: z.literal("DELETE", { message: 'Type DELETE in capitals to confirm.' }),
});

// ---------- runners ----------

export const runnerApplicationSchema = z.object({
  legalName: fullName,
  nyuIdNumber: z.string().trim().toUpperCase().regex(/^N\d{8}$/, "Your NYU ID number looks like N12345678."),
  homeBuildingId: uuid,
  agree: z.literal(true, { message: "You need to agree to the Runner Agreement." }),
});

export const shiftsSchema = z.object({
  slots: z.array(z.object({ day: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23) })).max(168),
});

// ---------- orders ----------

export const createOrderSchema = z.object({
  spotId: uuid,
  pickupName: z.string().trim().min(1, "Whose name is the order under?").max(40),
  orderNumber: z.string().trim().max(40).default(""),
  buildingId: uuid,
  floor,
  room,
  notes: z.string().trim().max(200).default(""),
  tipCents: z.coerce.number().int().min(0).max(5000, "Tips top out at $50."),
  foodValueCents: z.coerce.number().int().min(1, "Enter the food total from your receipt.").max(50000, "That's a big order. Food totals top out at $500."),
  bags: z.coerce.number().int().min(1).max(4).default(1),
  useCredit: z.boolean().default(true),
  scheduledFor: z.string().datetime({ offset: true }).nullable().default(null),
  confirmationPhotoId: uuid,
});

export const quoteSchema = z.object({
  spotId: uuid,
  buildingId: uuid,
  floor,
  tipCents: z.coerce.number().int().min(0).max(5000).default(0),
  foodValueCents: z.coerce.number().int().min(0).max(50000).default(0),
  bags: z.coerce.number().int().min(1).max(4).default(1),
  useCredit: z.boolean().default(true),
});

/** PIN is the only way to complete a delivery. There is no photo or drop-off path. */
export const deliverSchema = z.object({ pin: z.string().regex(/^\d{4}$/, "The PIN is 4 digits.") });

export const problemSchema = z.object({
  reason: z.enum(["restaurant_not_ready", "wrong_order", "spilled_damaged", "cant_enter_building"]),
  note: z.string().trim().min(5, "Add a short note (5+ characters).").max(1000),
  photoId: z.string().uuid("Take a live photo first."),
});

export const caseOpenSchema = z.object({
  type: z.enum(["missing_delivery", "pin_no_food", "customer_claim"]),
  reason: z.enum(["never_received", "stolen", "wrong_items", "other"]).optional(),
  description: z.string().trim().max(2000).default(""),
  photoId: z.string().uuid().nullable().default(null),
});

export const caseMessageSchema = z.object({ body: z.string().trim().min(1, "Write a message.").max(2000) });

export const caseResolveSchema = z.object({
  outcome: z.enum(["confirm_theft", "runner_at_fault", "customer_at_fault", "accident_refund", "no_fault", "dismiss"]),
  note: z.string().trim().max(1000).default(""),
});

export const lawEnforcementSchema = z.object({
  agency: z.string().trim().min(2).max(120),
  officer: z.string().trim().min(2).max(120),
  reference: z.string().trim().min(1).max(120),
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
  shared: z.string().trim().min(2).max(2000),
  caseId: z.string().uuid().nullable().default(null),
});

export const ratingSchema = z.object({
  stars: z.coerce.number().int().min(1, "Pick 1 to 5 stars.").max(5),
  comment: z.string().trim().max(500).default(""),
});

export const caseResponseSchema = z.object({ response: z.string().trim().min(5, "Add a sentence or two.").max(2000) });


// ---------- admin ----------

export const buildingSchema = z.object({
  name: z.string().trim().min(2).max(80),
  shortName: z.string().trim().min(1).max(24),
  address: z.string().trim().min(3).max(160),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  floorCount: z.coerce.number().int().min(1).max(80),
  doorRequiresResident: z.boolean(),
  handoffRadiusM: z.coerce.number().int().min(10).max(1000).default(75),
  active: z.boolean(),
});

export const spotSchema = z.object({
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().min(3).max(160),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  type: z.enum(["restaurant", "cafe", "convenience", "dining_hall"]),
  active: z.boolean(),
  pickupNotes: z.string().trim().max(300).default(""),
  verifyBeforeLaunch: z.boolean().default(true),
});

const cents = z.coerce.number().int().min(0).max(10000);

export const pricingSchema = z.object({
  baseFeeCents: cents,
  distanceTiers: z.array(z.object({ maxMiles: z.coerce.number().min(0).max(5), addCents: cents })).min(1).max(8),
  floorTiers: z.array(z.object({ maxFloor: z.coerce.number().int().min(1).max(80).nullable(), addCents: cents })).min(1).max(8),
  maxRadiusMiles: z.coerce.number().min(0.01).max(5),
  weatherSurgeOn: z.boolean(),
  weatherMultiplier: z.coerce.number().min(1).max(3),
  platformFeePct: z.coerce.number().min(0).max(0.9),
  cancelFeeCents: cents,
  lateGraceMinutes: z.coerce.number().int().min(1).max(120),
  unclaimedPingMinutes: z.coerce.number().int().min(1).max(120),
  unclaimedCancelMinutes: z.coerce.number().int().min(1).max(240),
  strikeThreshold: z.coerce.number().int().min(1).max(20),
  maxActiveOrders: z.coerce.number().int().min(1).max(10),
  freeUnclaimsPerWeek: z.coerce.number().int().min(0).max(20),
  tipPresets: z.array(cents).min(1).max(6),
  sizeTiers: z.array(z.object({ maxCents: z.coerce.number().int().min(0).max(100000).nullable(), addCents: cents })).min(1).max(8),
  bagFeeCents: cents,
  maxBags: z.coerce.number().int().min(1).max(4),
  guaranteeCents: cents,
  doorCountdownSeconds: z.coerce.number().int().min(5).max(1800),
  runnerAbsentGraceSeconds: z.coerce.number().int().min(5).max(1800),
  presentWindowAfterSeconds: z.coerce.number().int().min(0).max(3600),
  pinClaimWindowSeconds: z.coerce.number().int().min(30).max(3600),
  missingDeliveryMinutes: z.coerce.number().int().min(0).max(240),
  headingHomeRadiusMiles: z.coerce.number().min(0.01).max(2),
  levelTiers: z.array(z.object({ minDeliveries: z.coerce.number().int().min(0).max(10000), maxFoodCents: z.coerce.number().int().min(0).max(100000).nullable() })).min(1).max(6),
  noShowWarnCount: z.coerce.number().int().min(1).max(20),
  noShowReviewCount: z.coerce.number().int().min(1).max(20),
  noShowWindowDays: z.coerce.number().int().min(1).max(365),
  patternWindowDays: z.coerce.number().int().min(1).max(365),
  patternCounterparties: z.coerce.number().int().min(2).max(20),
  noShowRatePct: z.coerce.number().int().min(1).max(100),
  noShowRateMinOrders: z.coerce.number().int().min(1).max(100),
  freeProblemReportsPer30d: z.coerce.number().int().min(0).max(20),
  caseResponseHours: z.coerce.number().int().min(1).max(168),
  refundTargetHours: z.coerce.number().int().min(1).max(168),
  appealDays: z.coerce.number().int().min(1).max(60),
  evidenceRetentionDays: z.coerce.number().int().min(7).max(3650),
});

export const surgeWindowSchema = z.object({
  label: z.string().trim().min(2).max(40),
  days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day."),
  startMinute: z.coerce.number().int().min(0).max(1439),
  endMinute: z.coerce.number().int().min(0).max(1440),
  multiplier: z.coerce.number().min(1).max(3),
  active: z.boolean(),
});

import { describe, expect, it } from "vitest";
import { checkPassword, normalizeUsPhone, signupSchema } from "@/lib/validation";

const valid = {
  fullName: "Jordan Lee",
  email: "jl1234@nyu.edu",
  phone: "(212) 555-0142",
  password: "elevator14",
  confirmPassword: "elevator14",
  buildingId: "8b0e4d56-5d1c-4b62-9b0b-6a0f3d1a2c11",
  floor: "14",
  room: "1412",
  agreeTerms: true,
};
const schema = signupSchema(["nyu.edu"]);
const errorsFor = (input: object) => {
  const r = schema.safeParse(input);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("signup validation", () => {
  it("accepts a valid signup and normalizes the phone", () => {
    const r = schema.safeParse(valid);
    expect(r.success).toBe(true);
    expect(r.success && r.data.phone).toBe("+12125550142");
    expect(r.success && r.data.floor).toBe(14);
  });

  it("rejects non-NYU emails", () => {
    expect(errorsFor({ ...valid, email: "jordan@gmail.com" }).email).toMatch(/@nyu\.edu/);
    expect(errorsFor({ ...valid, email: "jordan@nyu.edu.evil.com" }).email).toMatch(/@nyu\.edu/);
    expect(errorsFor({ ...valid, email: "jordan@stern.nyu.edu" }).email).toMatch(/@nyu\.edu/);
  });

  it("allows a configurable domain list", () => {
    expect(signupSchema(["nyu.edu", "stern.nyu.edu"]).safeParse({ ...valid, email: "a@stern.nyu.edu" }).success).toBe(true);
  });

  it("rejects bad phone numbers", () => {
    for (const phone of ["555-0142", "123-456-7890", "(212) 055-0142", "+44 20 7946 0958", "abc", ""]) {
      expect(errorsFor({ ...valid, phone }).phone, phone).toBeTruthy();
    }
  });

  it("rejects weak passwords", () => {
    expect(errorsFor({ ...valid, password: "short1", confirmPassword: "short1" }).password).toMatch(/8 characters/);
    expect(errorsFor({ ...valid, password: "allletters", confirmPassword: "allletters" }).password).toMatch(/number/);
    expect(errorsFor({ ...valid, password: "1234567890", confirmPassword: "1234567890" }).password).toMatch(/letter/);
  });

  it("requires matching passwords", () => {
    expect(errorsFor({ ...valid, confirmPassword: "elevator15" }).confirmPassword).toMatch(/match/);
  });

  it("requires the terms checkbox, building, floor and room", () => {
    const e = errorsFor({ ...valid, agreeTerms: false, buildingId: "", floor: "0", room: "" });
    expect(e.agreeTerms).toBeTruthy();
    expect(e.buildingId).toBeTruthy();
    expect(e.floor).toBeTruthy();
    expect(e.room).toBeTruthy();
  });
});

describe("phone normalization", () => {
  it.each([
    ["2125550142", "+12125550142"],
    ["(212) 555-0142", "+12125550142"],
    ["+1 212 555 0142", "+12125550142"],
    ["1-212-555-0142", "+12125550142"],
    ["212.555.0142", "+12125550142"],
  ])("%s -> %s", (input, out) => expect(normalizeUsPhone(input)).toBe(out));
  it("rejects invalid area codes and lengths", () => {
    expect(normalizeUsPhone("012-555-0142")).toBeNull();
    expect(normalizeUsPhone("212-155-0142")).toBeNull();
    expect(normalizeUsPhone("21255501")).toBeNull();
  });
});

describe("password strength meter", () => {
  it("scores and labels", () => {
    expect(checkPassword("").label).toBe("");
    expect(checkPassword("abc").ok).toBe(false);
    expect(checkPassword("abcdefg1").ok).toBe(true);
    expect(checkPassword("abcdefg1").score).toBe(2);
    expect(checkPassword("Elevator-Fourteen-14").score).toBe(4);
  });
});

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, PasswordInput, Select } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { api, ClientApiError } from "@/lib/client/api";
import { checkPassword, emailDomainAllowed, normalizeUsPhone } from "@/lib/validation";

type B = { id: string; name: string; floors: number };

function formatPhoneInput(v: string) {
  const d = v.replace(/\D/g, "").replace(/^1(?=\d{10})/, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function SignupForm({ buildings, domains }: { buildings: B[]; domains: string[] }) {
  const router = useRouter();
  const [v, setV] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    buildingId: "",
    floor: "",
    room: "",
    agreeTerms: false,
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const building = useMemo(() => buildings.find((b) => b.id === v.buildingId), [buildings, v.buildingId]);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value;
    setV((s) => ({ ...s, [k]: k === "phone" ? formatPhoneInput(String(value)) : value }));
    if (fields[k]) setFields((f) => ({ ...f, [k]: "" }));
  };

  function validate() {
    const f: Record<string, string> = {};
    if (v.fullName.trim().length < 2) f.fullName = "Enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(v.email)) f.email = "Enter a valid email address.";
    else if (!emailDomainAllowed(v.email, domains)) f.email = `Use your ${domains.map((d) => "@" + d).join(" or ")} email. FloorDrop is students only.`;
    if (!normalizeUsPhone(v.phone)) f.phone = "Enter a 10-digit US phone number, like (212) 555-0142.";
    const pw = checkPassword(v.password);
    if (!pw.ok) f.password = `Password needs: ${pw.problems.join(", ").toLowerCase()}.`;
    if (v.confirmPassword !== v.password) f.confirmPassword = "Passwords don't match.";
    if (!v.buildingId) f.buildingId = "Pick your building.";
    const floor = Number(v.floor);
    if (!v.floor || !Number.isInteger(floor) || floor < 1) f.floor = "Enter your floor number.";
    else if (building && floor > building.floors) f.floor = `${building.name} has ${building.floors} floors.`;
    if (!v.room.trim()) f.room = "Room number is required.";
    if (!v.agreeTerms) f.agreeTerms = "You need to agree to the Terms and Privacy Policy.";
    return f;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    const f = validate();
    setFields(f);
    if (Object.keys(f).length) {
      document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ next: string }>("/api/auth/signup", { body: { ...v, floor: Number(v.floor) } });
      router.replace(res.next);
    } catch (err) {
      const e2 = err as ClientApiError;
      setFields(e2.fields ?? {});
      if (!e2.fields) setError(e2.message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {error && (
        <Notice tone="danger" icon={<TriangleAlert />}>
          <span className="text-ink">{error}</span>
        </Notice>
      )}
      <Input label="Full name" name="fullName" autoComplete="name" value={v.fullName} onChange={set("fullName")} error={fields.fullName} />
      <Input
        label="NYU email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="netid@nyu.edu"
        value={v.email}
        onChange={set("email")}
        error={fields.email}
        hint={
          fields.email?.includes("already exists") ? undefined : "We'll send a link to confirm it's you."
        }
      />
      {fields.email?.includes("already exists") && (
        <p className="-mt-3 text-small">
          <Link href="/login" className="link font-semibold">Log in instead</Link>
        </p>
      )}
      <Input
        label="Phone"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="(212) 555-0142"
        value={v.phone}
        onChange={set("phone")}
        error={fields.phone}
        hint="Your runner can text you if the lobby gets confusing."
      />
      <PasswordInput
        label="Password"
        name="password"
        autoComplete="new-password"
        value={v.password}
        onChange={set("password")}
        error={fields.password}
        hint="8+ characters with at least one letter and one number."
        showStrength
      />
      <PasswordInput label="Confirm password" name="confirmPassword" autoComplete="new-password" value={v.confirmPassword} onChange={set("confirmPassword")} error={fields.confirmPassword} />

      <fieldset className="mt-2 flex flex-col gap-5 border-t-2 border-line-strong pt-4">
        <legend className="sr-only">Where we deliver</legend>
        <p className="text-heading font-semibold">Where we bring it</p>
        <Select label="Dorm building" name="buildingId" value={v.buildingId} onChange={set("buildingId")} error={fields.buildingId}>
          <option value="">Pick your building</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Floor"
            name="floor"
            inputMode="numeric"
            pattern="[0-9]*"
            value={v.floor}
            onChange={set("floor")}
            error={fields.floor}
            hint={building ? `1 to ${building.floors}` : undefined}
          />
          <Input label="Room" name="room" autoComplete="off" value={v.room} onChange={set("room")} error={fields.room} placeholder="1412" />
        </div>
      </fieldset>

      <Checkbox
        name="agreeTerms"
        checked={v.agreeTerms}
        onChange={set("agreeTerms")}
        error={fields.agreeTerms}
        label={
          <>
            I agree to the{" "}
            <Link href="/legal/terms" target="_blank" className="link">Terms of Service</Link> and{" "}
            <Link href="/legal/privacy" target="_blank" className="link">Privacy Policy</Link>.
          </>
        }
      />
      <Button type="submit" size="lg" block loading={loading}>
        Create account
      </Button>
      <p className="text-small text-ink-2">
        Already have one? <Link href="/login" className="link font-semibold text-ink">Log in</Link>
      </p>
    </form>
  );
}

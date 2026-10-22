"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { api, ClientApiError } from "@/lib/client/api";

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(initialError);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setFields({});
    if (!email || !password) {
      setFields({ ...(email ? {} : { email: "Enter your email." }), ...(password ? {} : { password: "Enter your password." }) });
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ ok: boolean; next: string; verify?: boolean }>("/api/auth/login", { body: { email, password, next } });
      router.replace(res.next);
      router.refresh();
    } catch (err) {
      const e2 = err as ClientApiError;
      setError(e2.message);
      setFields(e2.fields ?? {});
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
      <Input
        label="NYU email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        placeholder="netid@nyu.edu"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fields.email}
      />
      <div>
        <PasswordInput
          label="Password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fields.password}
        />
        <Link href="/forgot-password" className="link mt-2 inline-block text-small text-ink-2">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" block loading={loading}>
        Log in
      </Button>
      <p className="text-small text-ink-2">
        New here?{" "}
        <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="link font-semibold text-ink">
          Make an account
        </Link>
      </p>
    </form>
  );
}

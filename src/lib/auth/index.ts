import "server-only";
import { authMode } from "@/lib/env";
import type { AuthProvider } from "./types";
import { localAuth } from "./local";
import { supabaseAuth } from "./supabase";

export function getAuth(): AuthProvider {
  return authMode === "supabase" ? supabaseAuth : localAuth;
}

export type { AuthUser, AuthProvider, TokenType } from "./types";

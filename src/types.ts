export const PROVIDER_ID = "univibe";

export type ModelProtocol = "anthropic" | "openai" | "google";

export interface PlanConfig {
  supplement_limit: number;
  hourly_supplement: number;
}

export interface CreditSummary {
  plan_type: string;
  current_credits: string | number;
  last_recovery_at: string | null;
  last_reset_date: string | null;
  subscription_expires_at: string | null;
  plan_config: PlanConfig;
}

export interface WeeklyLimit {
  limit: number;
  base_limit: number;
  bonus_limit: number;
  used: number;
  current_cycle_start: string | null;
  next_cycle_start: string | null;
  updated_at?: string | null;
}

export interface CreditDetail {
  credit: CreditSummary;
  weekly_limit: WeeklyLimit | null;
  claude_route?: {
    is_enabled?: boolean;
    is_force_enabled?: boolean;
    is_weekly_limit_reached?: boolean;
  } | null;
  all_weekly_limits?: Record<
    string,
    {
      plan_type?: string;
      weekly_limit?: number;
    }
  >;
}

export interface UnivibeUser {
  id?: string | number;
  name?: string | null;
  nickname?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface UnivibeMetadata {
  phone?: string;
  password?: string;
  token?: string;
  user?: UnivibeUser;
}

export interface StoredAuth {
  type?: string;
  key?: string;
  metadata?: UnivibeMetadata;
  [key: string]: unknown;
}

export interface LoginResult {
  token: string;
  user?: UnivibeUser;
}

export interface UsageWindow {
  name: string;
  used?: number;
  resetsAt?: string;
  span?: number;
  display?: string;
  amount?: number;
  limit?: number;
  unit?: string;
  model?: string;
  aside?: boolean;
  balance?: number;
}

export interface UsageResult {
  plan?: string;
  user?: string;
  until?: string;
  renew?: "auto" | "off";
  balance?: string;
  error?: string;
  windows?: UsageWindow[];
  signIn?: "kept" | "expired" | "renewed";
}

export type CheckinOutcome = "claimed" | "done" | "ineligible" | "inactive" | "captcha" | "failed";

export interface CheckinResult {
  outcome: CheckinOutcome;
  credit?: number;
  streak?: number;
  message?: string;
  until?: string;
}

export interface ModelLimit {
  context: number;
  input?: number;
  output: number;
}

export interface ModelCapabilities {
  temperature: boolean;
  reasoning: boolean;
  attachment: boolean;
  toolcall: boolean;
  input: {
    text: boolean;
    image: boolean;
    audio: boolean;
    video: boolean;
    pdf: boolean;
  };
  output: {
    text: boolean;
    image: boolean;
    audio: boolean;
    video: boolean;
    pdf: boolean;
  };
  interleaved: boolean;
}

export interface ProviderModel {
  id: string;
  providerID?: string;
  name: string;
  api: {
    id: string;
    url: string;
    npm: string;
  };
  status: "active";
  headers: Record<string, string>;
  options: Record<string, unknown>;
  cost: {
    input: number;
    output: number;
    cache: {
      read: number;
      write: number;
    };
  };
  limit: ModelLimit;
  capabilities: ModelCapabilities;
  release_date: string;
  variants: Record<string, Record<string, unknown>>;
}

export interface ConfigModel {
  name: string;
  id?: string;
  limit: ModelLimit;
  reasoning?: boolean;
  tool_call?: boolean;
  attachment?: boolean;
  modalities?: {
    input: string[];
    output: string[];
  };
  provider?: {
    npm: string;
    api: string;
  };
}

export interface ProviderConfig {
  name?: string;
  npm?: string;
  api?: string;
  models?: Record<string, ConfigModel>;
}

export interface OpenCodeConfig {
  provider?: Record<string, ProviderConfig>;
}

export interface ProviderForModels {
  id: string;
  models: Record<string, ConfigModel>;
}

export interface PromptOption {
  label: string;
  value: string;
  hint?: string;
}

export type AuthPrompt =
  | {
      type: "text" | "password";
      key: string;
      message: string;
      placeholder?: string;
      validate?: (value: string) => string | undefined;
    }
  | {
      type: "select";
      key: string;
      message: string;
      options: PromptOption[];
    };

export interface ApiAuthMethod {
  type: "api";
  label: string;
  placeholder?: string;
  prompts?: AuthPrompt[];
  authorize?: (inputs?: Record<string, string>) => Promise<
    | {
        type: "success";
        key?: string;
        metadata?: UnivibeMetadata;
      }
    | {
        type: "failed";
        error?: string;
      }
  >;
}

export interface AuthStoreClient {
  auth: {
    set(input: { path: { id: string }; body: unknown }): Promise<unknown>;
  };
}

export interface PluginInput {
  client: AuthStoreClient;
}

export interface AuthContext {
  auth?: StoredAuth;
  provider?: ProviderForModels;
}

export type GetAuth = () => Promise<StoredAuth | undefined>;

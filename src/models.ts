import {
  ANTHROPIC_BASE_URL,
  GOOGLE_BASE_URL,
  OPENAI_BASE_URL,
  type RemoteModel,
} from "./univibe-api.ts";
import type { ConfigModel, ModelProtocol, ProviderForModels, ProviderModel } from "./types.ts";

const NPM_ANTHROPIC = "@ai-sdk/anthropic";
const NPM_OPENAI = "@ai-sdk/openai";
const NPM_GOOGLE = "@ai-sdk/google";

export const FALLBACK_MODEL_IDS = [
  "claude-sonnet-5-5",
  "claude-sonnet-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-5-20251101",
  "claude-haiku-4-5-20251001",
  "codex-auto-review",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-6.1-sol",
  "gpt-6.1-terra",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
] as const;

export function protocolForModel(modelID: string): ModelProtocol {
  const id = modelID.toLowerCase();
  if (id.startsWith("claude")) return "anthropic";
  if (id.startsWith("gemini")) return "google";
  return "openai";
}

export function apiForProtocol(protocol: ModelProtocol): {
  npm: string;
  url: string;
} {
  if (protocol === "anthropic") return { npm: NPM_ANTHROPIC, url: ANTHROPIC_BASE_URL };
  if (protocol === "google") return { npm: NPM_GOOGLE, url: GOOGLE_BASE_URL };
  return { npm: NPM_OPENAI, url: OPENAI_BASE_URL };
}

function humanize(modelID: string): string {
  const displayWords: Record<string, string> = {
    claude: "Claude",
    codex: "Codex",
    flash: "Flash",
    gemini: "Gemini",
    gpt: "GPT",
    haiku: "Haiku",
    opus: "Opus",
    preview: "Preview",
    pro: "Pro",
    sonnet: "Sonnet",
    terra: "Terra",
    sol: "Sol",
    astra: "Astra",
  };
  const parts = modelID
    .replace(/^gpt-/, "gpt.")
    .split("-")
    .flatMap((part) => part.split("."));
  const words: string[] = [];
  for (const part of parts) {
    if (/^\d+(?:\.\d+)*$/.test(part) || /^\d{8}$/.test(part)) {
      const previous = words.at(-1);
      if (previous && /^\d+(?:\.\d+)*$/.test(previous)) {
        words[words.length - 1] = `${previous}.${part}`;
      } else {
        words.push(part);
      }
      continue;
    }
    const display = displayWords[part.toLowerCase()];
    words.push(display ?? (part ? part.charAt(0).toUpperCase() + part.slice(1) : part));
  }
  return words.join(" ");
}

function profileForModel(modelID: string): {
  context: number;
  output: number;
  reasoning: boolean;
  image: boolean;
} {
  const protocol = protocolForModel(modelID);
  if (protocol === "anthropic") {
    return { context: 200_000, output: 64_000, reasoning: true, image: true };
  }
  if (protocol === "google") {
    return { context: 1_000_000, output: 65_536, reasoning: true, image: true };
  }
  return { context: 400_000, output: 128_000, reasoning: true, image: true };
}

export function fallbackConfigModels(): Record<string, ConfigModel> {
  return Object.fromEntries(
    FALLBACK_MODEL_IDS.map((id) => {
      const profile = profileForModel(id);
      const protocol = protocolForModel(id);
      const api = apiForProtocol(protocol);
      return [
        id,
        {
          name: humanize(id),
          limit: { context: profile.context, output: profile.output },
          reasoning: profile.reasoning,
          tool_call: true,
          attachment: profile.image,
          modalities: {
            input: profile.image ? ["text", "image"] : ["text"],
            output: ["text"],
          },
          provider: {
            npm: api.npm,
            api: api.url,
          },
        },
      ];
    }),
  );
}

export function providerModel(
  modelID: string,
  providerID: string,
  created?: number,
): ProviderModel {
  const profile = profileForModel(modelID);
  const api = apiForProtocol(protocolForModel(modelID));
  const releaseDate =
    typeof created === "number" && created > 0
      ? new Date(created * 1000).toISOString().slice(0, 10)
      : "";
  return {
    id: modelID,
    providerID,
    name: humanize(modelID),
    api: {
      id: modelID,
      ...api,
    },
    status: "active",
    headers: {},
    options: {},
    cost: {
      input: 0,
      output: 0,
      cache: { read: 0, write: 0 },
    },
    limit: {
      context: profile.context,
      output: profile.output,
    },
    capabilities: {
      temperature: true,
      reasoning: profile.reasoning,
      attachment: profile.image,
      toolcall: true,
      input: {
        text: true,
        image: profile.image,
        audio: false,
        video: false,
        pdf: false,
      },
      output: {
        text: true,
        image: false,
        audio: false,
        video: false,
        pdf: false,
      },
      interleaved: false,
    },
    release_date: releaseDate,
    variants: {},
  };
}

export function dynamicModels(
  remoteModels: RemoteModel[],
  provider: ProviderForModels,
): Record<string, ProviderModel> {
  const byID = new Map<string, RemoteModel>();
  for (const model of remoteModels) {
    if (!byID.has(model.id)) byID.set(model.id, model);
  }
  return Object.fromEntries(
    [...byID.values()].map((model) => [
      model.id,
      providerModel(model.id, provider.id, model.created),
    ]),
  );
}

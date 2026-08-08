import type { ProviderConfig } from "./types";

export type AiProviderPresetId =
  | "deepseek"
  | "dashscope"
  | "kimi"
  | "zhipu"
  | "doubao"
  | "minimax"
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter";

export interface AiModelPreset {
  id: string;
  name: string;
  description: string;
  tier: "旗舰" | "均衡" | "高速";
}

export interface AiProviderPreset {
  id: AiProviderPresetId;
  name: string;
  region: "国内" | "海外";
  endpoint: string;
  defaultModel: string;
  models: readonly AiModelPreset[];
  apiKeyPlaceholder: string;
  note: string;
}

export const CUSTOM_PROVIDER_ID = "custom" as const;

export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    region: "国内",
    endpoint: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash",
    apiKeyPlaceholder: "sk-…",
    note: "官方 OpenAI Chat Completions 接口；Flash 适合批量标签，Pro 适合复杂检索。",
    models: [
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        description: "旗舰推理与复杂任务",
        tier: "旗舰",
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        description: "速度、效果与成本均衡",
        tier: "均衡",
      },
    ],
  },
  {
    id: "dashscope",
    name: "阿里云百炼 / Qwen",
    region: "国内",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen3.7-plus",
    apiKeyPlaceholder: "sk-…",
    note: "使用百炼 OpenAI 兼容模式；专属 Workspace 用户可在高级配置中替换 Endpoint。",
    models: [
      {
        id: "qwen3.7-max",
        name: "Qwen3.7 Max",
        description: "千问旗舰模型",
        tier: "旗舰",
      },
      {
        id: "qwen3.7-plus",
        name: "Qwen3.7 Plus",
        description: "能力与成本均衡",
        tier: "均衡",
      },
      {
        id: "qwen3.6-flash",
        name: "Qwen3.6 Flash",
        description: "高频任务与批量处理",
        tier: "高速",
      },
    ],
  },
  {
    id: "kimi",
    name: "Kimi / Moonshot",
    region: "国内",
    endpoint: "https://api.moonshot.cn/v1",
    defaultModel: "kimi-k2.5",
    apiKeyPlaceholder: "sk-…",
    note: "Kimi 官方 OpenAI 兼容接口，适合长文本理解与复杂网页语义分析。",
    models: [
      {
        id: "kimi-k2.5",
        name: "Kimi K2.5",
        description: "旗舰通用与 Agent 模型",
        tier: "旗舰",
      },
      {
        id: "moonshot-v1-128k",
        name: "Moonshot V1 128K",
        description: "稳定长文本模型",
        tier: "均衡",
      },
    ],
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    region: "国内",
    endpoint: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-5.2",
    apiKeyPlaceholder: "请输入智谱 API Key",
    note: "智谱官方 Chat Completions 接口，支持结构化输出。",
    models: [
      {
        id: "glm-5.2",
        name: "GLM-5.2",
        description: "旗舰长上下文模型",
        tier: "旗舰",
      },
      {
        id: "glm-5.1-highspeed",
        name: "GLM-5.1 HighSpeed",
        description: "旗舰能力与低延迟",
        tier: "高速",
      },
      {
        id: "glm-4.5-air",
        name: "GLM-4.5 Air",
        description: "高性价比轻量模型",
        tier: "均衡",
      },
    ],
  },
  {
    id: "doubao",
    name: "豆包 / 火山方舟",
    region: "国内",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-seed-2-0-pro-260215",
    apiKeyPlaceholder: "请输入火山方舟 API Key",
    note: "模型 ID 可能与方舟控制台创建的推理接入点绑定，可使用自定义模型覆盖。",
    models: [
      {
        id: "doubao-seed-2-0-pro-260215",
        name: "Doubao Seed 2.0 Pro",
        description: "旗舰复杂任务模型",
        tier: "旗舰",
      },
    ],
  },
  {
    id: "minimax",
    name: "MiniMax",
    region: "国内",
    endpoint: "https://api.minimax.io/v1",
    defaultModel: "MiniMax-M2.5",
    apiKeyPlaceholder: "请输入 MiniMax API Key",
    note: "使用 MiniMax 官方文本生成接口；插件会自动适配其请求路径。",
    models: [
      {
        id: "MiniMax-M2.7",
        name: "MiniMax M2.7",
        description: "最新旗舰文本模型",
        tier: "旗舰",
      },
      {
        id: "MiniMax-M2.5",
        name: "MiniMax M2.5",
        description: "Coding 与 Agent 均衡模型",
        tier: "均衡",
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    region: "海外",
    endpoint: "https://api.openai.com/v1",
    defaultModel: "gpt-5.4-mini",
    apiKeyPlaceholder: "sk-…",
    note: "OpenAI 官方 Chat Completions 接口；Mini 更适合批量任务，旗舰模型适合复杂检索。",
    models: [
      {
        id: "gpt-5.4",
        name: "GPT-5.4",
        description: "旗舰专业工作模型",
        tier: "旗舰",
      },
      {
        id: "gpt-5.4-mini",
        name: "GPT-5.4 Mini",
        description: "效果、速度与成本均衡",
        tier: "均衡",
      },
      {
        id: "gpt-5.4-nano",
        name: "GPT-5.4 Nano",
        description: "高频轻量任务",
        tier: "高速",
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    region: "海外",
    endpoint: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-6",
    apiKeyPlaceholder: "sk-ant-…",
    note: "使用 Anthropic 官方 OpenAI SDK 兼容层；JSON 格式主要由提示词约束。",
    models: [
      {
        id: "claude-opus-5",
        name: "Claude Opus 5",
        description: "最强复杂推理与长任务",
        tier: "旗舰",
      },
      {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        description: "质量、速度与成本均衡",
        tier: "均衡",
      },
      {
        id: "claude-haiku-4-5",
        name: "Claude Haiku 4.5",
        description: "高速轻量任务",
        tier: "高速",
      },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    region: "海外",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.6-flash",
    apiKeyPlaceholder: "请输入 Gemini API Key",
    note: "使用 Google 官方 OpenAI 兼容层；当前兼容层仍由 Google 标记为 Beta。",
    models: [
      {
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro Preview",
        description: "旗舰多模态与复杂推理",
        tier: "旗舰",
      },
      {
        id: "gemini-3.6-flash",
        name: "Gemini 3.6 Flash",
        description: "智能、延迟与成本均衡",
        tier: "均衡",
      },
      {
        id: "gemini-3.5-flash-lite",
        name: "Gemini 3.5 Flash-Lite",
        description: "高吞吐低成本模型",
        tier: "高速",
      },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    region: "海外",
    endpoint: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-5.4-mini",
    apiKeyPlaceholder: "sk-or-…",
    note: "一个 Key 切换多家模型；具体模型可用性与名称以 OpenRouter 控制台为准。",
    models: [
      {
        id: "openai/gpt-5.4",
        name: "GPT-5.4",
        description: "通过 OpenRouter 调用",
        tier: "旗舰",
      },
      {
        id: "openai/gpt-5.4-mini",
        name: "GPT-5.4 Mini",
        description: "通过 OpenRouter 调用",
        tier: "均衡",
      },
      {
        id: "anthropic/claude-opus-5",
        name: "Claude Opus 5",
        description: "通过 OpenRouter 调用",
        tier: "旗舰",
      },
      {
        id: "google/gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro Preview",
        description: "通过 OpenRouter 调用",
        tier: "旗舰",
      },
      {
        id: "deepseek/deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        description: "通过 OpenRouter 调用",
        tier: "旗舰",
      },
    ],
  },
] as const;

export function getAiProviderPreset(
  id: AiProviderPresetId | typeof CUSTOM_PROVIDER_ID,
): AiProviderPreset | undefined {
  return AI_PROVIDER_PRESETS.find((provider) => provider.id === id);
}

export function inferAiProviderPresetId(
  endpoint: string,
): AiProviderPresetId | typeof CUSTOM_PROVIDER_ID {
  const normalized = endpoint.trim().replace(/\/+$/, "").toLowerCase();
  const match = AI_PROVIDER_PRESETS.find(
    (provider) => provider.endpoint.toLowerCase() === normalized,
  );
  return match?.id ?? CUSTOM_PROVIDER_ID;
}

export function applyAiProviderPreset(
  current: ProviderConfig,
  preset: AiProviderPreset,
): ProviderConfig {
  const endpointChanged =
    current.endpoint.trim().replace(/\/+$/, "").toLowerCase() !==
    preset.endpoint.toLowerCase();
  return {
    ...current,
    endpoint: preset.endpoint,
    model: preset.defaultModel,
    apiKey: endpointChanged ? "" : current.apiKey,
  };
}

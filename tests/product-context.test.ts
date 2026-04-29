import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCT_CONTEXT_JSON_SCHEMA,
  buildProductContextProviderBody,
  buildProductContextCompilerPrompt,
  parseProductContextCompilerResponse,
  PRODUCT_CONTEXT_PROMPT_VERSION,
  PRODUCT_CONTEXT_STORAGE_KEY,
  LEGACY_PRODUCT_CONTEXT_STORAGE_KEY,
  isProductContextSourceReady
} from "../src/compare/product-context.ts";
import type { ProductProfile } from "../src/state/types.ts";

const productProfile: ProductProfile = {
  name: "DLens",
  category: "Creator intelligence",
  audience: "Threads creators",
  contextText: "README: DLens captures Threads posts and compares discussions.\nAGENTS: Keep product mode grounded in small experiments.",
  contextFiles: [
    {
      id: "file_readme",
      name: "README.md",
      kind: "readme",
      importedAt: "2026-04-27T00:00:00.000Z",
      charCount: 64
    },
    {
      id: "file_agents",
      name: "AGENTS.md",
      kind: "agents",
      importedAt: "2026-04-27T00:01:00.000Z",
      charCount: 75
    }
  ]
};

test("ProductContext compiler prompt uses compiled product docs without RAG framing", () => {
  const prompt = buildProductContextCompilerPrompt(productProfile);

  assert.equal(PRODUCT_CONTEXT_STORAGE_KEY, "dlens:v1:product-context");
  assert.equal(LEGACY_PRODUCT_CONTEXT_STORAGE_KEY, "dlens_product_context");
  assert.equal(PRODUCT_CONTEXT_PROMPT_VERSION, "v1");
  assert.match(prompt, /DLens/);
  assert.match(prompt, /README\.md/);
  assert.match(prompt, /AGENTS\.md/);
  assert.match(prompt, /product_promise/);
  assert.doesNotMatch(prompt, /RAG|embedding|vector/i);
});

test("isProductContextSourceReady requires both merged text and source file metadata", () => {
  assert.equal(isProductContextSourceReady(productProfile), true);
  assert.equal(isProductContextSourceReady({ ...productProfile, contextText: "" }), false);
  assert.equal(isProductContextSourceReady({ ...productProfile, contextFiles: [] }), false);
});

test("ProductContext compiler exposes a strict JSON schema contract", () => {
  assert.equal(PRODUCT_CONTEXT_JSON_SCHEMA.type, "object");
  assert.equal(PRODUCT_CONTEXT_JSON_SCHEMA.additionalProperties, false);
  assert.deepEqual(PRODUCT_CONTEXT_JSON_SCHEMA.required, [
    "product_promise",
    "target_audience",
    "agent_roles",
    "core_workflows",
    "current_capabilities",
    "explicit_constraints",
    "non_goals",
    "preferred_tech_direction",
    "evaluation_criteria",
    "unknowns"
  ]);
  assert.equal(PRODUCT_CONTEXT_JSON_SCHEMA.properties.product_promise.type, "string");
  assert.equal(PRODUCT_CONTEXT_JSON_SCHEMA.properties.agent_roles.items.type, "string");
});

test("ProductContext compiler provider bodies use structured schema", () => {
  const openAiBody = buildProductContextProviderBody("openai", "system", "prompt");
  assert.equal(openAiBody.response_format.type, "json_schema");
  assert.equal(openAiBody.response_format.json_schema.strict, true);
  assert.equal(openAiBody.response_format.json_schema.name, "product_context");

  const googleBody = buildProductContextProviderBody("google", "system", "prompt");
  assert.equal(googleBody.generationConfig.responseMimeType, "application/json");
  assert.equal(googleBody.generationConfig.responseJsonSchema.type, "object");

  const claudeBody = buildProductContextProviderBody("claude", "system", "prompt");
  assert.equal(claudeBody.tool_choice.name, "record_product_context");
  assert.equal(claudeBody.tools[0].input_schema.type, "object");
});

test("parseProductContextCompilerResponse normalizes strict JSON and owns metadata fields", () => {
  const parsed = parseProductContextCompilerResponse(
    `{
      "product_promise": "DLens helps creators turn Threads discussions into product decisions.",
      "target_audience": "Threads creators",
      "agent_roles": ["collector", "analyst"],
      "core_workflows": ["capture", "compare"],
      "current_capabilities": ["Chrome extension"],
      "explicit_constraints": ["local-first"],
      "non_goals": ["native app"],
      "preferred_tech_direction": "Chrome extension first",
      "evaluation_criteria": ["small experiment"],
      "unknowns": ["mobile demand"]
    }`,
    productProfile,
    "2026-04-27T08:00:00.000Z"
  );

  assert.deepEqual(parsed, {
    productPromise: "DLens helps creators turn Threads discussions into product decisions.",
    targetAudience: "Threads creators",
    agentRoles: ["collector", "analyst"],
    coreWorkflows: ["capture", "compare"],
    currentCapabilities: ["Chrome extension"],
    explicitConstraints: ["local-first"],
    nonGoals: ["native app"],
    preferredTechDirection: "Chrome extension first",
    evaluationCriteria: ["small experiment"],
    unknowns: ["mobile demand"],
    compiledAt: "2026-04-27T08:00:00.000Z",
    sourceFileIds: ["file_readme", "file_agents"],
    promptVersion: "v1"
  });
});

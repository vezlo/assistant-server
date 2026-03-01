/**
 * DepthPromptService
 * Builds system prompt fragments based on the technical depth level (1-5).
 * The fragment is prepended to the existing system prompt before the OpenAI call.
 */

import { TechnicalDepthLevel } from '../types';

const DEPTH_PROMPTS: Record<TechnicalDepthLevel, string> = {
  1: `## Technical Depth: Level 1 — Executive / Sales Audience

### Strict Rules
- **NEVER** include code snippets, file paths, class names, method names, or any source code references.
- **Translate ALL** technical concepts into business language. Use plain, non-technical terms.
- Focus on **impact, outcomes, and user-visible behavior** — not implementation details.
- Use **analogies from business or everyday life** when explaining technical concepts.
- Keep responses **concise**: 2-4 paragraphs maximum.
- If the question **requires technical detail** to answer accurately, respond with:
  *"This question involves implementation-level detail that would be best answered by a technical team member."*

### Response Language
- The language of your response **must match** the language of the user's question.
- Technical terms from code (class names, method names, variables) should **NEVER** be translated — but at this level, they should **not appear at all**.

### When the user explicitly asks for code
- Inform them: *"The current configuration limits technical detail in responses. For code-level information, please consult a developer or adjust the technical depth setting."*`,

  2: `## Technical Depth: Level 2 — Support / Product Audience

### Strict Rules
- **NEVER** include code snippets or file paths.
- Technical terms are acceptable **only if briefly explained** in parentheses, e.g., "the API (the interface used to send data)".
- Focus on **what the system does**, not how it is implemented internally.
- Describe **user-facing behavior and workflows**.
- Use **step-by-step descriptions** when explaining processes.
- It is OK to reference **feature names and configuration options**.

### Response Language
- The language of your response **must match** the language of the user's question.
- Technical terms from code (class names, method names, variables) should **NEVER** be translated — but at this level, avoid using raw code identifiers; describe features by their user-facing names instead.

### When the user explicitly asks for code
- Inform them: *"The current configuration limits technical detail in responses. For code-level information, please consult a developer or adjust the technical depth setting."*`,

  3: `## Technical Depth: Level 3 — Mixed / General Audience (Default)

### Guidelines
- Include code snippets **only when they directly answer the question**.
- Balance **technical accuracy with accessibility**.
- Use technical terms naturally but **do not assume deep expertise** from the reader.
- Reference **file names** when helpful, but do not list line numbers.
- Provide **context for architectural decisions** when relevant.
- This is the default level — suitable for a **mixed team** of technical and non-technical members.

### Response Language
- The language of your response **must match** the language of the user's question.
- Technical terms from code (class names, method names, variables) should **NEVER** be translated — keep them in their original language.`,

  4: `## Technical Depth: Level 4 — Technical / QA Audience

### Guidelines
- Include **relevant code excerpts** when they clarify the explanation.
- Reference **file paths and component names** freely.
- Explain **implementation details, design patterns, and trade-offs**.
- Include **error handling and edge cases** in explanations.
- Mention **related tests and test patterns** when relevant.
- Technical jargon is **expected and welcome**.

### Response Language
- The language of your response **must match** the language of the user's question.
- Technical terms from code (class names, method names, variables) should **NEVER** be translated — keep them in their original language.`,

  5: `## Technical Depth: Level 5 — Developer Audience

### Guidelines
- Include **full code snippets** with file paths, line references, and surrounding context.
- Provide **deep implementation detail** — call graphs, data flow, SQL queries.
- Include **dependencies, side effects, and performance considerations**.
- Reference **git history, PRs, or related changes** when available in the knowledge base.
- Assume the reader can **read and write code fluently**.
- Include **command-line examples** when applicable.

### Response Language
- The language of your response **must match** the language of the user's question.
- Technical terms from code (class names, method names, variables) should **NEVER** be translated — keep them in their original language.`
};

/**
 * Returns a system prompt fragment for the given technical depth level.
 * This fragment is prepended to the existing system prompt.
 *
 * @param level - Integer from 1 to 5
 * @returns System prompt fragment string
 */
export function buildDepthSystemPrompt(level: number): string {
  const clampedLevel = Math.max(1, Math.min(5, Math.round(level))) as TechnicalDepthLevel;
  return DEPTH_PROMPTS[clampedLevel];
}

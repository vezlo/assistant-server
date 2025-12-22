export const RESPONSE_MODES = {
  USER: 'user',
  DEVELOPER: 'developer'
} as const;

export type ResponseMode = typeof RESPONSE_MODES[keyof typeof RESPONSE_MODES];

// Unified instructions for both Intent Service (small talk) and AI Service (knowledge base)
export const RESPONSE_MODE_INSTRUCTIONS = {
  [RESPONSE_MODES.USER]: "Do NOT provide implementation details, technical details, code snippets, or name of files , classes, methods, or any other implementation details. Keep explanations simple, non-technical, and focused on usage rather than implementation. Explain things in simple, plain language suitable for a non-technical end user."
};

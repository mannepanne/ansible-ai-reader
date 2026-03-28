// ABOUT: Shared constants used across the application
// ABOUT: Single source of truth for limits, thresholds, and configuration values

/**
 * Maximum length for document notes (plain text)
 * Applied at:
 * - API validation (Zod schema)
 * - Frontend validation (character counter)
 * - Test assertions
 */
export const MAX_NOTE_LENGTH = 10000;

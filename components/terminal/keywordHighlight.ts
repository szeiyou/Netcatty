import { KeywordHighlightRule } from "../../types";

// ESC character as unicode escape for ESLint compatibility
const ESC = "\u001b";

/**
 * Convert a hex color to ANSI 24-bit true color escape sequence
 * Format: ESC[38;2;R;G;Bm for foreground color
 */
function hexToAnsi(hex: string): string {
  // Remove # if present
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  return `${ESC}[38;2;${r};${g};${b}m`;
}

const ANSI_RESET = `${ESC}[0m`;

// Regex to match ANSI escape sequences (to skip them during highlighting)
// Using RegExp constructor to avoid ESLint control character warning
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_REGEX = /\u001b\[[0-9;]*[a-zA-Z]/g;

interface CompiledRule {
  regex: RegExp;
  ansiColor: string;
}

/**
 * Pre-compile keyword highlight rules for better performance
 */
export function compileHighlightRules(
  rules: KeywordHighlightRule[],
  enabled: boolean
): CompiledRule[] {
  if (!enabled) return [];
  
  return rules
    .filter((rule) => rule.enabled && rule.patterns.length > 0)
    .map((rule) => {
      // Combine all patterns with OR, case-insensitive
      const combinedPattern = rule.patterns.join("|");
      return {
        regex: new RegExp(`(${combinedPattern})`, "gi"),
        ansiColor: hexToAnsi(rule.color),
      };
    });
}

/**
 * Apply keyword highlighting to terminal output
 * This processes text and adds ANSI color codes for matched keywords
 * 
 * Note: This is a simplified approach that works well for most cases.
 * It processes the text while preserving existing ANSI escape sequences.
 */
export function highlightKeywords(
  text: string,
  compiledRules: CompiledRule[]
): string {
  if (compiledRules.length === 0 || !text) {
    return text;
  }

  // Split text into segments: ANSI sequences and regular text
  const segments: Array<{ isAnsi: boolean; content: string }> = [];
  let lastIndex = 0;
  
  // Find all ANSI escape sequences
  let match: RegExpExecArray | null;
  const ansiRegex = new RegExp(ANSI_ESCAPE_REGEX.source, "g");
  
  while ((match = ansiRegex.exec(text)) !== null) {
    // Add text before this ANSI sequence
    if (match.index > lastIndex) {
      segments.push({
        isAnsi: false,
        content: text.slice(lastIndex, match.index),
      });
    }
    // Add the ANSI sequence itself
    segments.push({
      isAnsi: true,
      content: match[0],
    });
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text after last ANSI sequence
  if (lastIndex < text.length) {
    segments.push({
      isAnsi: false,
      content: text.slice(lastIndex),
    });
  }
  
  // Process only non-ANSI segments
  const processedSegments = segments.map((segment) => {
    if (segment.isAnsi) {
      return segment.content;
    }
    
    let processed = segment.content;
    
    // Apply each rule
    for (const rule of compiledRules) {
      processed = processed.replace(rule.regex, (matched) => {
        return `${rule.ansiColor}${matched}${ANSI_RESET}`;
      });
    }
    
    return processed;
  });
  
  return processedSegments.join("");
}

/**
 * Create a highlight processor function with pre-compiled rules
 * Use this for better performance when processing multiple chunks
 */
export function createHighlightProcessor(
  rules: KeywordHighlightRule[],
  enabled: boolean
): (text: string) => string {
  const compiledRules = compileHighlightRules(rules, enabled);
  
  if (compiledRules.length === 0) {
    // Return identity function if no rules are enabled
    return (text: string) => text;
  }
  
  return (text: string) => highlightKeywords(text, compiledRules);
}

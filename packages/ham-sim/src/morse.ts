/** International Morse code (ITU-R M.1677) for letters, digits and common punctuation. */
export const MORSE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---",
  K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-",
  U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....",
  "7": "--...", "8": "---..", "9": "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "/": "-..-.", "=": "-...-", "+": ".-.-.",
};

/** Dots and dashes for display: letters separated by spaces, words by " / ". */
export function toMorse(text: string): string {
  return text
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .map((w) => [...w].map((c) => MORSE[c] ?? "").filter(Boolean).join(" "))
    .join(" / ");
}

export interface Tone {
  /** Start, seconds from the beginning. */
  start: number;
  /** Duration, seconds. */
  duration: number;
}

/**
 * Key-down intervals for `text` at `wpm` (PARIS timing: one dot = 1.2 / wpm seconds).
 * Dash = 3 dots, gap inside a letter = 1, between letters = 3, between words = 7.
 */
export function morseTiming(text: string, wpm: number): { tones: Tone[]; total: number } {
  const dot = 1.2 / wpm;
  const tones: Tone[] = [];
  let t = 0;
  const words = text.toUpperCase().trim().split(/\s+/);
  words.forEach((word, wi) => {
    const letters = [...word].map((c) => MORSE[c]).filter((m): m is string => Boolean(m));
    letters.forEach((code, li) => {
      [...code].forEach((sym, si) => {
        const d = sym === "-" ? 3 * dot : dot;
        tones.push({ start: t, duration: d });
        t += d;
        if (si < code.length - 1) t += dot;
      });
      if (li < letters.length - 1) t += 3 * dot;
    });
    if (wi < words.length - 1) t += 7 * dot;
  });
  return { tones, total: t };
}

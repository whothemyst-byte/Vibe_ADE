/** Speak via Windows voices. Resolves when done (or immediately if unavailable). */
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || !text) return resolve();
    window.speechSynthesis.cancel(); // never queue behind a previous reply
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export function cancelSpeech(): void {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

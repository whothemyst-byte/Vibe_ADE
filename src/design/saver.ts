/** Debounced writer with explicit flush. The write fn owns hashing/conflict
 *  checks and the disk write; a throwing write keeps the payload dirty so a
 *  later schedule/flush retries. Pure timers — no framework imports. */

export type Saver = {
  schedule(getText: () => string): void;
  flush(): Promise<void>;
  isDirty(): boolean;
};

export function makeSaver(write: (text: string) => Promise<void>, delayMs = 300): Saver {
  let getPending: (() => string) | null = null;
  let failedText: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();

  function clearTimer() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  }

  function fire(): Promise<void> {
    clearTimer();
    const get = getPending;
    getPending = null;
    const text = get ? get() : failedText;
    if (text === null) return chain;
    failedText = null;
    chain = chain.then(async () => {
      try {
        await write(text);
      } catch {
        // keep dirty unless something newer arrived meanwhile
        if (getPending === null) failedText = text;
      }
    });
    return chain;
  }

  return {
    schedule(getText) {
      getPending = getText;
      clearTimer();
      timer = setTimeout(() => void fire(), delayMs);
    },
    flush: () => fire(),
    isDirty: () => getPending !== null || failedText !== null,
  };
}

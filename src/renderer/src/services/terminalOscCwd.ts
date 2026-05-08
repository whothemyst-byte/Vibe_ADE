const OSC_CWD_PREFIX = '\u001b]1337;vibe-ade-cwd=';
const OSC_ST = '\u001b\\';
const OSC_BEL = '\u0007';

export interface OscCwdParser {
  consume: (chunk: string) => string;
}

export function createOscCwdParser(onCwd: (cwd: string) => void): OscCwdParser {
  let pending = '';

  return {
    consume(chunk: string): string {
      const combined = pending + chunk;
      pending = '';

      let cursor = 0;
      let out = '';
      while (cursor < combined.length) {
        const start = combined.indexOf(OSC_CWD_PREFIX, cursor);
        if (start === -1) {
          out += combined.slice(cursor);
          break;
        }
        out += combined.slice(cursor, start);
        const payloadStart = start + OSC_CWD_PREFIX.length;
        const belIndex = combined.indexOf(OSC_BEL, payloadStart);
        const stIndex = combined.indexOf(OSC_ST, payloadStart);
        let end = -1;
        let terminatorLen = 0;

        if (belIndex !== -1 && (stIndex === -1 || belIndex < stIndex)) {
          end = belIndex;
          terminatorLen = 1;
        } else if (stIndex !== -1) {
          end = stIndex;
          terminatorLen = OSC_ST.length;
        }

        if (end === -1) {
          pending = combined.slice(start);
          break;
        }

        const cwd = combined.slice(payloadStart, end).trim();
        if (cwd) {
          onCwd(cwd);
        }
        cursor = end + terminatorLen;
      }

      return out;
    }
  };
}

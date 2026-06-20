import { getLastFocusedTerminalId, sendToSession } from "../wall/sessions";
import { formatReference } from "./designFile";

/** Insert an @-reference to the design file into the focused terminal; if there
 *  is no live focused terminal, copy the raw path to the clipboard instead.
 *  Returns which path was taken so the caller can toast appropriately. */
export async function referenceInActiveTerminal(path: string): Promise<"sent" | "copied"> {
  const id = getLastFocusedTerminalId();
  if (id && sendToSession(id, formatReference(path), false)) return "sent";
  await navigator.clipboard.writeText(path).catch(() => {});
  return "copied";
}

/** Small badge marking a feature locked behind a paid tier. Defaults to Pro. */
export function UpgradePill({ feature, tier = "Pro" }: { feature: string; tier?: "Pro" | "Team" }) {
  return (
    <span className="upgrade-pill" title={`${feature} — available on ${tier}`}>
      {tier}
    </span>
  );
}

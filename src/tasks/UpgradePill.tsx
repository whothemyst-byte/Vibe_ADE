/** Small "Pro" badge marking a feature locked behind a paid tier. */
export function UpgradePill({ feature }: { feature: string }) {
  return (
    <span className="upgrade-pill" title={`${feature} — available on Pro`}>
      Pro
    </span>
  );
}

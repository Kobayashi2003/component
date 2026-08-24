export type RetroRadioBackgroundProps = Record<string, never>;

export function RetroRadioBackground() {
  return (
    <div className="retro-radio__background" aria-hidden="true">
      <i className="retro-radio__grain" />
      <i className="retro-radio__horizon" />
    </div>
  );
}

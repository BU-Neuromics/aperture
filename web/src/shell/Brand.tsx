/** Default header-slot content: the Aperture mark + wordmark (design-export). */
export function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark" aria-hidden="true" />
      <span className="brand-wordmark">Aperture</span>
    </div>
  );
}

import { FlaskConical } from "lucide-react";

/**
 * Marks a screen whose content is synthetic. Every demo figure must sit under
 * it. An ink pill (direction « Galet »): visible without using the accent.
 */
export function FakeDataBanner({ children = "Données fictives" }: { children?: string }) {
  return (
    <span
      data-testid="fake-data"
      className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-ink px-3 text-[12px] font-semibold tracking-[0.06em] whitespace-nowrap text-white uppercase [&>svg]:size-3.5"
    >
      <FlaskConical aria-hidden="true" />
      {children}
    </span>
  );
}

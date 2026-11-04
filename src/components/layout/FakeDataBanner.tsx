import { FlaskConical } from "lucide-react";
import { Chip } from "@/components/ui/Chip";

/**
 * Marks a screen whose content is synthetic. Every demo figure must sit under it.
 */
export function FakeDataBanner({ children = "Données fictives" }: { children?: string }) {
  return (
    <Chip tone="warn" icon={<FlaskConical />} data-testid="fake-data">
      {children}
    </Chip>
  );
}

import { isDemoLoginEnabled } from "@/lib/env";
import { FakeDataBanner } from "./FakeDataBanner";

/**
 * « Données fictives » only in demonstration mode (`AUTH_DEMO_LOGIN`, seeded
 * with synthetic people). A server without demonstration data (the test VPS,
 * production) shows nothing: the mention would be false there.
 */
export function DemoDataBanner({ demo = isDemoLoginEnabled() }: { demo?: boolean }) {
  return demo ? <FakeDataBanner /> : null;
}

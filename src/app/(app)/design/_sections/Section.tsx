import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export interface SectionProps {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}

/** One block of the design page. */
export function Section({ id, title, description, children }: SectionProps) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>{title}</CardTitle>
        {description && <p className="text-small text-muted">{description}</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">{children}</CardContent>
    </Card>
  );
}

/** Sub-block with a small mono label. */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-mono text-muted">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Bell, Inbox, Plus, Search, Users } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DotMatrix } from "@/components/ui/DotMatrix";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, SearchInput, Select, Textarea } from "@/components/ui/Field";
import { HatchedBarChart } from "@/components/ui/HatchedBarChart";
import { IconButton } from "@/components/ui/IconButton";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatCard } from "@/components/ui/StatCard";
import { StatusDot } from "@/components/ui/StatusDot";
import { STATUS_KEYS, type Tone } from "@/lib/status";
import { DataTableDemo } from "./_sections/DataTableDemo";
import { Row, Section } from "./_sections/Section";
import { COLOR_TOKENS, TYPE_SCALE } from "./_sections/tokens";
import { isDesignPageEnabled } from "./enabled";

export const metadata: Metadata = { title: "Design system" };

/** Evaluated at request time so `ENABLE_DESIGN_PAGE` works after the build. */
export const dynamic = "force-dynamic";

const BUTTON_VARIANTS: ButtonVariant[] = ["primary", "accent", "soft", "outline", "ghost"];
const TONES: Tone[] = ["neutral", "accent", "ok", "warn", "danger", "ink"];
const MARK_SIZES = [16, 24, 32, 64];

export default function DesignPage() {
  if (!isDesignPageEnabled()) notFound();

  return (
    <>
      <PageHeader
        title="Design system"
        subtitle="Tokens, typographie et composants de Binivol. Tout ce qui est affiché ici est fictif."
        actions={<FakeDataBanner />}
      />

      <div className="flex flex-col gap-4">
        <Section
          id="logo"
          title="Logo"
          description="Piste A « Point » : le mot en Inter Tight 700 et son carré bleu ; l'icône pour les petites tailles."
        >
          <Row label='variant="full"'>
            <div className="flex flex-wrap items-center gap-6 rounded-inner bg-veil p-4">
              {[20, 28, 40].map((size) => (
                <Logo key={size} size={size} />
              ))}
            </div>
          </Row>
          <Row label='tone="white"'>
            <div className="flex flex-wrap items-center gap-6 rounded-inner bg-ink p-4">
              <Logo size={28} tone="white" />
            </div>
          </Row>
          <Row label='variant="mark"'>
            <div className="flex flex-wrap items-center gap-6 rounded-inner bg-veil p-4">
              {MARK_SIZES.map((size) => (
                <Logo key={size} variant="mark" size={size} />
              ))}
            </div>
          </Row>
        </Section>

        <Section
          id="couleurs"
          title="Couleurs"
          description="Thème clair. Le noir agit, l'accent signale."
        >
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {COLOR_TOKENS.map((token) => (
              <li key={token.name} className="flex flex-col gap-2">
                <span
                  className="block h-14 rounded-inner border border-line"
                  style={{ backgroundColor: token.value }}
                  aria-hidden="true"
                />
                <span className="text-small font-medium text-ink">{token.name}</span>
                <span className="font-mono text-mono text-muted">{token.value}</span>
                <span className="text-small text-muted">{token.usage}</span>
              </li>
            ))}
          </ul>
          <Row label="Motifs (réservés aux données)">
            <span
              className="h-10 w-32 rounded-inner bg-hatch-accent"
              role="img"
              aria-label="Hachures accent"
            />
            <span
              className="h-10 w-32 rounded-inner bg-hatch-ink"
              role="img"
              aria-label="Hachures ink"
            />
            <span
              className="h-10 w-32 rounded-inner bg-hatch-track"
              role="img"
              aria-label="Rail de progression"
            />
            <span
              className="h-10 w-32 rounded-inner bg-accent-gradient"
              role="img"
              aria-label="Dégradé d'accent"
            />
          </Row>
        </Section>

        <Section
          id="typographie"
          title="Typographie"
          description="Inter Tight 700 pour les titres, Inter pour le texte, Geist Mono pour les références : auto-hébergées."
        >
          <ul className="flex flex-col gap-4">
            {TYPE_SCALE.map((step) => (
              <li
                key={step.name}
                className="flex flex-col gap-1 border-b border-line pb-4 last:border-0"
              >
                <span className={`${step.className} text-ink`}>
                  Les bénévoles de Versailles — 0123456789
                </span>
                <span className="font-mono text-mono text-muted">
                  {step.name} · {step.spec}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="boutons"
          title="Boutons"
          description="Toujours en pilule. Taille md = 44 px, minimum pour le tactile."
        >
          {BUTTON_VARIANTS.map((variant) => (
            <Row key={variant} label={`variant="${variant}"`}>
              <Button variant={variant} size="sm">
                Petit
              </Button>
              <Button variant={variant}>Normal</Button>
              <Button variant={variant} size="lg">
                Grand
              </Button>
              <Button variant={variant} leftIcon={<Plus className="size-4" />}>
                Icône gauche
              </Button>
              <Button variant={variant} rightIcon={<ArrowRight className="size-4" />}>
                Icône droite
              </Button>
              <Button variant={variant} disabled>
                Désactivé
              </Button>
              <Button variant={variant} loading>
                Chargement
              </Button>
            </Row>
          ))}
          <Row label="États simulés : survol, focus">
            <Button className="bg-ink-2">Survol (primary)</Button>
            <Button className="ring-2 ring-accent ring-offset-2 ring-offset-surface">
              Focus (primary)
            </Button>
            <Button variant="outline" className="bg-veil">
              Survol (outline)
            </Button>
          </Row>
          <Row label="IconButton (44 px, aria-label obligatoire)">
            <IconButton aria-label="Rechercher" variant="outline">
              <Search className="size-5" />
            </IconButton>
            <IconButton aria-label="Notifications" variant="ink">
              <Bell className="size-5" />
            </IconButton>
            <IconButton aria-label="Ajouter" variant="accent">
              <Plus className="size-5" />
            </IconButton>
            <IconButton aria-label="Désactivé" variant="outline" disabled>
              <Plus className="size-5" />
            </IconButton>
          </Row>
        </Section>

        <Section
          id="cartes"
          title="StatCard"
          description="Une seule carte highlight par écran : elle marque le chiffre qui compte."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Défaut"
              value="128"
              icon={<Users />}
              delta="+4"
              deltaTone="up"
              footer="sur 30 jours"
            />
            <StatCard
              variant="highlight"
              label="Highlight"
              value="92 %"
              icon={<Users />}
              delta="+3 pts"
              deltaTone="up"
              footer="dossiers complets"
            />
            <StatCard
              variant="dark"
              label="Sombre"
              value="7"
              icon={<Bell />}
              delta="−1"
              deltaTone="down"
              footer="échéances"
            />
          </div>
        </Section>

        <Section
          id="chips"
          title="Chips et statuts"
          description="Un statut = une pastille et un libellé, jamais la couleur seule."
        >
          <Row label="Chip">
            {TONES.map((tone) => (
              <Chip key={tone} tone={tone}>
                {tone}
              </Chip>
            ))}
            <Chip tone="accent" icon={<Users />}>
              Avec icône
            </Chip>
          </Row>
          <Row label="StatusDot — bénévole et échéances">
            {STATUS_KEYS.map((status) => (
              <StatusDot key={status} status={status} />
            ))}
          </Row>
          <Row label="Avatar">
            <Avatar firstName="Camille" lastName="Démo" size="sm" />
            <Avatar firstName="Jean-Pierre" lastName="Exemple" />
            <Avatar firstName="Élodie" lastName="Fictive" size="lg" />
            <Avatar />
          </Row>
        </Section>

        <Section
          id="formulaires"
          title="Formulaires"
          description="Label obligatoire, aide et erreur reliées par aria-describedby."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Prénom" hint="Tel qu'il figure sur la pièce d'identité." required>
              <Input placeholder="Camille" autoComplete="off" />
            </Field>
            <Field label="Adresse e-mail" error="Cette adresse n'est pas valide.">
              <Input type="email" defaultValue="camille@exemple" autoComplete="off" />
            </Field>
            <Field label="Désactivé">
              <Input disabled defaultValue="Lecture seule" />
            </Field>
            <Field label="Activité">
              <Select defaultValue="secours">
                <option value="secours">Postes de secours</option>
                <option value="urgence">Urgence</option>
                <option value="formation">Formation</option>
              </Select>
            </Field>
            <Field
              label="Commentaire"
              hint="Visible par les responsables uniquement."
              className="sm:col-span-2"
            >
              <Textarea placeholder="Notes de suivi…" />
            </Field>
          </div>
          <Row label="SearchInput">
            <SearchInput
              aria-label="Rechercher un bénévole"
              placeholder="Rechercher un bénévole…"
              className="w-full max-w-sm"
            />
          </Row>
        </Section>

        <Section
          id="tableau"
          title="DataTable"
          description="En-tête veil, filets, ligne sélectionnée, cellules mono. Liste de cartes sous 640 px."
        >
          <DataTableDemo />
        </Section>

        <Section id="vide" title="EmptyState">
          <EmptyState
            icon={<Inbox />}
            title="Aucun candidat"
            description="Les candidatures reçues par le formulaire apparaîtront ici."
            action={<Button leftIcon={<Plus className="size-4" />}>Ajouter un candidat</Button>}
            className="bg-veil"
          />
        </Section>

        <Section
          id="visualisations"
          title="Visualisations"
          description="Sans librairie : barres hachurées, matrice de points, barre de progression."
        >
          <Row label="HatchedBarChart">
            <HatchedBarChart
              className="w-full max-w-xl"
              title="Heures de bénévolat par mois (fictif)"
              primaryLabel="Postes de secours"
              secondaryLabel="Formations"
              data={[
                { label: "Jan", primary: 120, secondary: 30 },
                { label: "Fév", primary: 90, secondary: 45 },
                { label: "Mar", primary: 150, secondary: 20 },
                { label: "Avr", primary: 110, secondary: 60 },
                { label: "Mai", primary: 170, secondary: 35 },
                { label: "Juin", primary: 140, secondary: 50 },
              ]}
            />
          </Row>
          <Row label="DotMatrix">
            <DotMatrix
              title="Présences de la semaine (fictif)"
              columns={["L", "M", "M", "J", "V", "S", "D"]}
              rows={[
                {
                  label: "Camille D.",
                  cells: ["filled", "filled", "empty", "hatched", "filled", "empty", "empty"],
                },
                {
                  label: "Noa E.",
                  cells: ["empty", "hatched", "filled", "filled", "empty", "filled", "empty"],
                },
                {
                  label: "Sacha F.",
                  cells: ["filled", "empty", "empty", "empty", "hatched", "hatched", "filled"],
                },
              ]}
            />
          </Row>
          <Row label="ProgressBar">
            <div className="flex w-full max-w-md flex-col gap-3">
              <ProgressBar value={0} label="Dossier vide" showValue />
              <ProgressBar
                value={2}
                max={3}
                label="Dossier en cours"
                valueText="Étape 2 sur 3"
                showValue
              />
              <ProgressBar value={140} label="Valeur hors bornes (ramenée à 100)" showValue />
            </div>
          </Row>
        </Section>
      </div>
    </>
  );
}

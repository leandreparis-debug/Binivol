import type { Prisma } from "@/generated/prisma/client";

/**
 * Default reminder rules (step 12), created by the base seed when missing.
 * TOPAZE changes their delay, recipients and activity on /admin/reglages.
 */
export const DEFAULT_REMINDER_RULES: (Prisma.ReminderRuleUncheckedCreateInput & { id: string })[] =
  [
    {
      id: "seed_rule_candidacy_idle",
      key: "CANDIDACY_IDLE",
      label: "Candidature sans action depuis 7 jours",
      trigger: "CANDIDACY_IDLE",
      offsetDays: 7,
      recipients: ["DIAMANT"],
      channels: ["IN_APP", "EMAIL_DIGEST"],
    },
    {
      id: "seed_rule_dossier_unsigned",
      key: "DOSSIER_UNSIGNED",
      label: "Dossier envoyé et non signé depuis 5 jours",
      trigger: "DOSSIER_UNSIGNED",
      offsetDays: 5,
      recipients: ["DIAMANT"],
      channels: ["IN_APP"],
    },
    {
      id: "seed_rule_training_expiring",
      key: "TRAINING_EXPIRING",
      label: "Formation arrivant à échéance dans 60 jours",
      trigger: "TRAINING_EXPIRING",
      offsetDays: 60,
      recipients: ["FORMAT", "ACTION", "LASER"],
      channels: ["IN_APP", "EMAIL_DIGEST"],
    },
    {
      id: "seed_rule_followup_due",
      key: "FOLLOWUP_DUE",
      label: "Point de suivi à faire",
      trigger: "FOLLOWUP_DUE",
      offsetDays: 0,
      recipients: ["DIAMANT"],
      channels: ["IN_APP"],
    },
    {
      id: "seed_rule_person_inactive",
      key: "PERSON_INACTIVE",
      label: "Bénévole sans activité depuis 6 mois",
      trigger: "PERSON_INACTIVE",
      offsetDays: 180,
      recipients: ["TOPAZE"],
      channels: ["IN_APP", "EMAIL_DIGEST"],
    },
    {
      id: "seed_rule_b3_annual",
      key: "B3_ANNUAL",
      label: "Vérification annuelle du B3 (en janvier)",
      trigger: "B3_ANNUAL",
      offsetDays: 0,
      recipients: ["TOPAZE"],
      channels: ["IN_APP"],
    },
    {
      id: "seed_rule_pause_return",
      key: "PAUSE_RETURN",
      label: "Reprise de pause arrivée",
      trigger: "PAUSE_RETURN",
      offsetDays: 0,
      recipients: ["DIAMANT"],
      channels: ["IN_APP"],
    },
    {
      id: "seed_rule_greetings_review",
      key: "GREETINGS_REVIEW",
      label: "Relire les textes d'anniversaire (le 31/12)",
      trigger: "GREETINGS_REVIEW",
      offsetDays: 0,
      recipients: ["TOPAZE"],
      channels: ["IN_APP"],
    },
  ];

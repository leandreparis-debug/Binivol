/**
 * Generates the synthetic legacy workbooks used by the import tests:
 *
 *   tests/fixtures/classeur-v03-fictif.xlsx           same structure as the real v03, every trap
 *   tests/fixtures/classeur-v03-fictif-modifie.xlsx   a few values changed (update test)
 *   tests/fixtures/classeur-v03-sans-colonne.xlsx      « Statut » column removed (blocking error)
 *
 * 100 % fictitious data (NIVOL starting with 00099), deterministic: run
 * `pnpm fixtures:classeur` after changing it. The real workbook never enters
 * the repository.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { SHEET_COLUMNS, type SheetName } from "../src/server/import/columns";

type Value = string | number | Date | null;
type Row = Partial<Record<string, Value>>;

const OUT_DIR = path.resolve(import.meta.dirname, "../tests/fixtures");
const FIXED_DATE = new Date(Date.UTC(2026, 10, 4, 9, 0, 0));
const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));
const dt = (y: number, m: number, day: number, h: number, mi: number) =>
  new Date(Date.UTC(y, m - 1, day, h, mi));
/** Excel serial number of a calendar day (1900 system). */
const serial = (y: number, m: number, day: number) =>
  (Date.UTC(y, m - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000;
const LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ";
/** Fictitious NIVOL: 00099 + 6 digits + letter. */
export const fixtureNivol = (i: number) =>
  `00099${String(i).padStart(6, "0")}${LETTERS[i % LETTERS.length] ?? "A"}`;

const FIRST = [
  "Camille",
  "Noa",
  "Sacha",
  "Alix",
  "Lou",
  "Eden",
  "Maé",
  "Charlie",
  "Robin",
  "Andrea",
  "Lior",
  "Ely",
  "Gabin",
  "Ilan",
  "Jade",
  "Kim",
  "Lina",
  "Marin",
  "Nael",
  "Oren",
  "Pia",
  "Quentin",
];
const LAST = ["Fictif", "Exemple", "Démo", "Témoin", "Essai", "Modèle", "Bidon", "Factice"];

interface Volunteer {
  nivol: string;
  first: string;
  last: string;
  birth: Value;
}

function volunteers(): { rows: (Row | null)[]; people: Volunteer[] } {
  const people: Volunteer[] = [];
  const rows: (Row | null)[] = [];
  const base = (i: number, over: Row = {}): Row => {
    const first = FIRST[(i - 1) % FIRST.length] ?? "Camille";
    const last = LAST[(i - 1) % LAST.length] ?? "Fictif";
    const nivol = fixtureNivol(i);
    const row: Row = {
      NIVOL: nivol,
      Prénom: first,
      Nom: last,
      "E-mail": `${first.toLowerCase()}.${i}@exemple.test`
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, ""),
      Téléphone: `06 39 98 ${String(i).padStart(2, "0")} 00`,
      "Date de naissance": d(1980 + (i % 20), 1 + (i % 12), 1 + (i % 27)),
      Statut: "Actif",
      "Date d'entrée": d(2015 + (i % 9), 1 + (i % 12), 10),
      "Date de départ": null,
      Adhérent: i % 3 === 0 ? "NON" : "OUI",
      "Aptitude (Pegass)": "Apte",
      "Date aptitude": d(2024, 1 + (i % 12), 5),
      "Autre AASC": "NON",
      Formateur: "NON",
      "Encadrant régulier mineurs": "NON",
      "Date vérif. B3": d(2025, 1 + (i % 12), 15),
      "Autorisation parentale": null,
      "Date autorisation": null,
      Notes: "Donnée fictive (fixture)",
      "Modifié le": d(2025, 6, 1 + (i % 27)),
      "Modifié par": "editeur.fictif@exemple.test",
      "Dossier Drive": `drive-fictif-${String(i).padStart(3, "0")}`,
      "Colonne perso": "valeur ignorée",
      ...over,
    };
    if (typeof row.NIVOL === "string" && row.NIVOL.replace(/\s/g, "").startsWith("0009")) {
      people.push({ nivol, first, last, birth: row["Date de naissance"] ?? null });
    }
    return row;
  };
  rows.push(base(1));
  rows.push(base(2, { NIVOL: "000 9900 0002 c" })); // spaces + lower case: accepted
  rows.push(base(3, { "Date de naissance": serial(1990, 4, 12), "Date d'entrée": "05/09/2020" }));
  rows.push(base(4, { "Date d'entrée": "bientôt" })); // unreadable date
  rows.push(base(5, { Statut: "Parti(e)", "Date de départ": null, "Modifié le": d(2024, 6, 30) }));
  rows.push(base(6, { Adhérent: null, "Autre AASC": null })); // empty yes/no: unknown
  rows.push(null); // empty row in the middle
  rows.push(base(7, { NIVOL: "12345" })); // invalid NIVOL: rejected
  rows.push(base(8, { NIVOL: fixtureNivol(1) })); // duplicate NIVOL: rejected
  rows.push(
    base(9, {
      "Date de naissance": d(2009, 5, 1),
      "Autorisation parentale": "OUI",
      "Date autorisation": d(2025, 2, 1),
      "Date vérif. B3": null,
    }),
  ); // minor
  rows.push(base(10, { Formateur: "OUI" }));
  rows.push(base(11, { Statut: "Suspendu", "Aptitude (Pegass)": "Retiré(e)" }));
  rows.push(base(12, { Statut: "Inactif", "Aptitude (Pegass)": "Non apte" }));
  rows.push(base(13, { Statut: "Candidat", "Aptitude (Pegass)": "À vérifier" }));
  for (let i = 14; i <= 22; i += 1) rows.push(base(i));
  rows.push(null, null); // empty rows at the end
  // People 7 and 8 are rejected: drop them from the « known people » list.
  return {
    rows,
    people: people.filter((p) => p.nivol !== fixtureNivol(7) && p.nivol !== fixtureNivol(8)),
  };
}

function prospects(people: Volunteer[]): Row[] {
  const linked = people.find((p) => p.nivol === fixtureNivol(14));
  const row = (n: number, over: Row): Row => ({
    ID: `P-${String(n).padStart(5, "0")}`,
    Prénom: `Prospect${n}`,
    Nom: "Fictif",
    "E-mail": `prospect${n}@exemple.test`,
    Téléphone: `06 39 98 9${n} 00`,
    "Date de naissance": d(1995 + n, n, 10),
    Source: "Site internet",
    Intérêt: "Postes de secours",
    "Date de premier contact": d(2025, 9, n + 1),
    Étape: "Premier contact",
    "Prochaine action": "Rappeler (fictif)",
    "Date de relance": d(2025, 11, n + 10),
    Notes: "Donnée fictive (fixture)",
    "NIVOL attribué": null,
    "Saisi le": dt(2025, 9, n + 1, 10, 30),
    "Saisi par": "editeur.fictif@exemple.test",
    "Modifié le": dt(2025, 10, n + 1, 16, 0),
    "Modifié par": "editeur.fictif@exemple.test",
    ...over,
  });
  return [
    row(1, {}),
    row(2, { Étape: "Dossier en cours" }),
    row(3, {
      Prénom: linked?.first ?? "Gabin",
      Nom: linked?.last ?? "Fictif",
      "NIVOL attribué": linked?.nivol ?? null,
    }),
    row(4, { Étape: "Rencontre prévue" }), // unknown stage: warning
    row(5, { Source: "Site Internet" }),
  ];
}

const CODES = [
  ["PSE", "Premiers secours en équipe", "FORMATION_IS", "TRAINING", "NON", "NON"],
  ["FCPSE", "Formation continue PSE", "FORMATION_IS", "TRAINING", "NON", "OUI"],
  ["F_CI", "Formation chef d'intervention", "FORMATION_IS", "TRAINING", "NON", "NON"],
  ["F_CH", "Formation chauffeur", "FORMATION_IS", "TRAINING", "NON", "NON"],
  ["OPR", "Opérateur radio (OPR)", "FORMATION_IS", "TRAINING", "NON", "NON"], // label differs from Binivol
  ["ECG", "Formation ECG (réseau de secours)", "FORMATION_IS", "TRAINING", "NON", "NON"],
  ["GQS", "Gestes qui sauvent", "TRONC_COMMUN", "TRAINING", "NON", "NON"],
  ["CRB", "Croix-Rouge Bienvenue (eCRB)", "TRONC_COMMUN", "TRAINING", "NON", "NON"],
  [
    "TCAU",
    "Tronc commun des acteurs de l'urgence (eTCAU)",
    "TRONC_COMMUN",
    "TRAINING",
    "NON",
    "NON",
  ],
  [
    "TCAS",
    "Tronc commun des acteurs de la solidarité (eTCAS)",
    "TRONC_COMMUN",
    "TRAINING",
    "NON",
    "NON",
  ],
  ["CHEF_PAPS", "Chef de PAPS", "SECOURS", "FUNCTION", "OUI", "NON"],
  ["CI", "Chef d'intervention (fonction)", "SECOURS", "FUNCTION", "OUI", "NON"],
  ["CDPE", "Chef de dispositif de petite envergure", "SECOURS", "FUNCTION", "OUI", "NON"],
  ["CI_SDIS", "CI réseau de secours SDIS", "SECOURS", "FUNCTION", "OUI", "NON"],
  ["CH_TECH", "Chauffeur technique", "SECOURS", "FUNCTION", "OUI", "NON"],
  ["CH_FIXE", "Chauffeur fixe", "SECOURS", "FUNCTION", "OUI", "NON"],
  ["CH_MOBILE", "Chauffeur mobile", "SECOURS", "FUNCTION", "OUI", "NON"],
  ["CH_RESEAUX", "Chauffeur réseaux", "SECOURS", "FUNCTION", "OUI", "NON"],
  ["FPSE", "Formateur PSE", "FORMATION_IS", "TRAINING", "NON", "NON"],
  ["FCCI", "Formation continue chef d'intervention", "FORMATION_IS", "TRAINING", "NON", "OUI"],
  ["TCEO", "Tronc commun des encadrants opérationnels", "FORMATION_IS", "TRAINING", "NON", "NON"],
] as const;

function reference(): Row[] {
  return CODES.map(([code, label, category, type, minors, endOfYear], i) => ({
    Code: code,
    Libellé: label,
    Catégorie: category,
    Type: type,
    Ordre: i + 1,
    "Validité (mois)": null,
    Prérequis: null,
    "Interdite aux mineurs": minors,
    Actif: "OUI",
    "Source / commentaire": code === "FCCI" ? "À refaire tous les ans, échéance au 31/12" : null,
    "Échéance au 31/12": endOfYear,
  }));
}

function parameters(): Row[] {
  const p = (key: string, value: Value, description: string): Row => ({
    Clé: key,
    Valeur: value,
    Description: description,
  });
  return [
    p("EMAILS_ALERTES", "alerte1@exemple.test, alerte2@exemple.test", "Destinataires des alertes"),
    p(
      "EDITEURS",
      "editeur.fictif@exemple.test, second.editeur@exemple.test",
      "Comptes autorisés à modifier",
    ),
    p("DELAI_ALERTE_JOURS", 60, "Jours avant échéance"),
    p("CONSERVATION_ANS", 5, "Années de conservation après le départ"),
    p("SAUVEGARDES_A_GARDER", 12, "Nombre de sauvegardes"),
    p("DOSSIER_SAUVEGARDE_ID", "dossier-drive-fictif-sauvegardes", "Dossier Drive des sauvegardes"),
    p("CLASSIFICATION", "C3 CONFIDENTIEL", "Classification"),
    p("VERSION", "v03", "Version de l'outil"),
    p("DOSSIER_BENEVOLES_ID", "dossier-drive-fictif-benevoles", "Dossier Drive des bénévoles"),
    p(
      "DOSSIER_BENEVOLES_ID",
      "dossier-drive-fictif-benevoles",
      "Dossier Drive des bénévoles (doublon)",
    ),
    p("MAILS_VOEUX_ACTIFS", "OUI", "Envoi des vœux"),
  ];
}

function sessions(people: Volunteer[]): Row[] {
  const rows: Row[] = [];
  const codes = ["PSE", "PSE", "TCAU", "PSE", "CRB", "GQS", "TCAU", "FCPSE", "PSE", "TCAS"];
  const results = [
    "Validé",
    "Validé",
    "Validé",
    "Inscrit(e)",
    "Validé",
    "À confirmer",
    "Validé",
    "Validé",
    "Non validé",
    "Absent",
  ];
  for (let n = 1; n <= 57; n += 1) {
    const person = people[(n - 1) % people.length] ?? people[0];
    const k = (n - 1) % codes.length;
    // About 90 % of the dates are empty, as in the real workbook.
    const date: Value =
      n === 8
        ? d(2026, 2, 14)
        : n === 18
          ? serial(2025, 3, 20)
          : n === 28
            ? "11/06/2024"
            : n === 38
              ? "32/13/2024"
              : n === 48
                ? d(2026, 1, 10)
                : n === 50
                  ? d(2023, 5, 2)
                  : null;
    rows.push({
      ID: `S-${String(n).padStart(5, "0")}`,
      NIVOL: person?.nivol ?? fixtureNivol(1),
      Code: codes[k] ?? "PSE",
      Date: date,
      Résultat: n === 20 ? null : (results[k] ?? "Validé"),
      "Organisme / lieu": n % 5 === 0 ? "UL de Versailles (fictif)" : null,
      "Lien Pegass": n % 7 === 0 ? `https://pegass.exemple.test/s/${n}` : null,
      Commentaire: null,
      "Saisi le": dt(2025, 1 + (n % 12), 1 + (n % 27), 9, 0),
      "Saisi par": "editeur.fictif@exemple.test",
    });
  }
  // FPSE of the trainer, and the three traps.
  rows.push({
    ID: "S-00058",
    NIVOL: fixtureNivol(10),
    Code: "FPSE",
    Date: null,
    Résultat: "Validé",
    "Saisi le": dt(2025, 2, 2, 9, 0),
    "Saisi par": "editeur.fictif@exemple.test",
  });
  rows.push({
    ID: "S-00059",
    NIVOL: "00099009999Z",
    Code: "PSE",
    Date: null,
    Résultat: "Validé",
    "Saisi le": dt(2025, 2, 2, 9, 0),
    "Saisi par": "editeur.fictif@exemple.test",
  }); // unknown NIVOL
  rows.push({
    ID: "S-00060",
    NIVOL: fixtureNivol(1),
    Code: "XYZ",
    Date: null,
    Résultat: "Validé",
    "Saisi le": dt(2025, 2, 2, 9, 0),
    "Saisi par": "editeur.fictif@exemple.test",
  }); // unknown code
  rows.push({
    ID: "S-00061",
    NIVOL: fixtureNivol(1),
    Code: "CHEF_PAPS",
    Date: null,
    Résultat: "Validé",
    "Saisi le": dt(2025, 2, 2, 9, 0),
    "Saisi par": "editeur.fictif@exemple.test",
  }); // function code
  return rows;
}

function appointments(): Row[] {
  const plan: [number, string][] = [
    [1, "CHEF_PAPS"],
    [2, "CI"],
    [3, "CDPE"],
    [4, "CH_TECH"],
    [10, "CH_FIXE"],
    [14, "CH_MOBILE"],
    [15, "CH_RESEAUX"],
    [16, "CI_SDIS"],
    [17, "CHEF_PAPS"],
    [18, "CI"],
    [19, "CH_TECH"],
    [20, "CDPE"],
    [21, "CHEF_PAPS"],
  ];
  const rows: Row[] = plan.map(([i, code], k) => ({
    ID: `F-${String(k + 1).padStart(5, "0")}`,
    NIVOL: fixtureNivol(i),
    Fonction: code,
    "Date de début": d(2023 + (k % 3), 1 + (k % 12), 1),
    "Date de fin": null,
    "Autorisée par": "DLUS (fictif)",
    "Référence décision": `DEC-FIX-${String(k + 1).padStart(3, "0")}`,
    Commentaire: null,
    "Saisi le": dt(2024, 1 + (k % 12), 3, 11, 0),
    "Saisi par": "editeur.fictif@exemple.test",
    Annulée: null,
  }));
  const first = rows[0];
  const second = rows[1];
  if (first) first.Annulée = "12/05/2025 par demo.topaze@binivol.test : erreur de saisie (fictif)";
  if (second) second.Annulée = "annulée à la demande du DLUS";
  rows.push({
    ID: "F-00014",
    NIVOL: fixtureNivol(9), // the minor
    Fonction: "CHEF_PAPS",
    "Date de début": d(2025, 9, 1),
    "Autorisée par": "DLUS (fictif)",
    "Référence décision": "DEC-FIX-014",
    "Saisi le": dt(2025, 9, 1, 11, 0),
    "Saisi par": "editeur.fictif@exemple.test",
  });
  rows.push({
    ID: "F-00015",
    NIVOL: fixtureNivol(22),
    Fonction: "CH_FIXE",
    "Date de début": "01/02/2022",
    "Date de fin": serial(2024, 12, 31),
    "Autorisée par": "DLUS (fictif)",
    "Référence décision": "DEC-FIX-015",
    "Saisi le": dt(2022, 2, 1, 11, 0),
    "Saisi par": "editeur.fictif@exemple.test",
  });
  return rows;
}

const ACTIONS = [
  "Création de la base",
  "Installation",
  "Création",
  "Modification",
  "Modification directe",
  "Modification directe (plage)",
  "Annulation",
  "Paramètre",
  "Dossier Drive",
  "Sauvegarde",
  "Envoi des alertes",
  "Récapitulatif TCAU envoyé",
];

function journal(extra = 0): Row[] {
  const rows: Row[] = [];
  for (let n = 1; n <= 30 + extra; n += 1) {
    const action = ACTIONS[(n - 1) % ACTIONS.length] ?? "Modification";
    const sensitive = n === 5 || n === 17 || n === 29;
    const field =
      n === 5
        ? "Date de naissance"
        : n === 17
          ? "Date vérif. B3"
          : n === 29
            ? "Autorisation parentale"
            : n % 3 === 0
              ? "Téléphone"
              : null;
    rows.push({
      Horodatage:
        n % 4 === 0
          ? `0${1 + (n % 9)}/03/2025 14:${String(n).padStart(2, "0")}`
          : dt(2024 + (n % 2), 1 + (n % 12), 1 + (n % 27), 8 + (n % 10), n),
      Utilisateur: "editeur.fictif@exemple.test",
      Action: action,
      Table: action.startsWith("Modification") || action === "Création" ? "Benevoles" : null,
      Clé:
        action.startsWith("Modification") || action === "Création"
          ? fixtureNivol(1 + (n % 20))
          : null,
      Champ: field,
      "Ancienne valeur": sensitive
        ? "01/01/1990"
        : field
          ? `06 39 98 ${String(n).padStart(2, "0")} 11`
          : null,
      "Nouvelle valeur": sensitive
        ? "02/01/1990"
        : field
          ? `06 39 98 ${String(n).padStart(2, "0")} 22`
          : null,
    });
  }
  return rows;
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: SheetName,
  rows: (Row | null)[],
  headers: string[] = [...SHEET_COLUMNS[name]],
) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row ? headers.map((h) => row[h.trim()] ?? null) : []);
  }
  for (const [i] of headers.entries()) {
    const column = sheet.getColumn(i + 1);
    column.eachCell((c) => {
      if (c.value instanceof Date)
        c.numFmt =
          c.value.getUTCHours() + c.value.getUTCMinutes() > 0 ? "dd/mm/yyyy hh:mm" : "dd/mm/yyyy";
    });
  }
}

/**
 * The ZIP writer stamps each entry with the current time: freeze the clock
 * while writing so that regenerating the fixtures gives the same bytes.
 */
async function withFrozenClock<T>(fn: () => Promise<T>): Promise<T> {
  const RealDate = Date;
  const frozen = FIXED_DATE.getTime();
  class FrozenDate extends RealDate {
    constructor(...args: [] | [string | number | Date]) {
      if (args.length === 0) super(frozen);
      else super(args[0]);
    }
    static override now() {
      return frozen;
    }
  }
  globalThis.Date = FrozenDate as DateConstructor;
  try {
    return await fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

interface Variant {
  file: string;
  modify?: boolean;
  dropColumn?: string;
}

async function build(variant: Variant) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Binivol (fixture fictive)";
  workbook.created = FIXED_DATE;
  workbook.modified = FIXED_DATE;
  const accueil = workbook.addWorksheet("Accueil");
  accueil.addRow(["Classeur fictif de test — aucune donnée réelle"]);

  const { rows: volunteerRows, people } = volunteers();
  if (variant.modify) {
    const second = volunteerRows[1];
    if (second) second.Téléphone = "06 39 98 02 99";
  }
  let volunteerHeaders: string[] = SHEET_COLUMNS.Benevoles.map((h) =>
    h === "Prénom" ? "  Prénom  " : h,
  );
  volunteerHeaders.push("Colonne perso");
  if (variant.dropColumn)
    volunteerHeaders = volunteerHeaders.filter((h) => h !== variant.dropColumn);

  addSheet(workbook, "Referentiel", reference());
  addSheet(workbook, "Parametres", parameters());
  addSheet(workbook, "Benevoles", volunteerRows, volunteerHeaders);
  const prospectRows = prospects(people);
  if (variant.modify && prospectRows[0]) prospectRows[0].Étape = "Dossier en cours";
  addSheet(workbook, "Prospects", prospectRows);
  const sessionRows = sessions(people);
  if (variant.modify && sessionRows[3]) sessionRows[3].Résultat = "Validé";
  addSheet(workbook, "Sessions", sessionRows);
  const appointmentRows = appointments();
  if (variant.modify && appointmentRows[2]) appointmentRows[2]["Date de fin"] = d(2026, 6, 30);
  addSheet(workbook, "Fonctions", appointmentRows);
  addSheet(workbook, "Journal", journal(variant.modify ? 2 : 0));

  await withFrozenClock(() => workbook.xlsx.writeFile(path.join(OUT_DIR, variant.file)));
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await build({ file: "classeur-v03-fictif.xlsx" });
  await build({ file: "classeur-v03-fictif-modifie.xlsx", modify: true });
  await build({ file: "classeur-v03-sans-colonne.xlsx", dropColumn: "Statut" });
  process.stdout.write("Fixtures générées dans tests/fixtures/ (données fictives).\n");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

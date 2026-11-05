# E-mails (`MailService`)

Binivol n'envoie des e-mails que par `MailService` (`src/server/mail/`), jamais par un SDK
d'hébergeur (ADR-041). Aujourd'hui, un seul message existe : le lien du dossier en ligne
(`dossierLinkMail`, `templates.ts`), qui ne contient que le prénom, le lien, sa date de fin et
le nom de l'unité locale.

## Pilotes

`MAIL_DRIVER` choisit le pilote, `log` par défaut.

| Pilote | Usage                               | Comportement                                                           |
| ------ | ----------------------------------- | ---------------------------------------------------------------------- |
| `log`  | développement, tests, démo hébergée | rien ne part : le message est écrit dans `outbound_mails`, **chiffré** |
| `smtp` | test réel (Brevo), puis VPS         | envoi SMTP par Nodemailer ; TLS direct sur le port 465, STARTTLS sinon |

### Pilote `log` et `/admin/courriels`

- Chaque message devient une ligne `outbound_mails` : destinataire, objet, date, auteur, et le
  corps chiffré en AES-256-GCM (`sealed.ts`, clé dérivée d'`AUTH_SECRET`). Un lien de dossier
  n'est donc jamais stocké en clair, même dans ce journal.
- TOPAZE lit ces messages dans **Administration › Courriels** (`/admin/courriels`, action
  `mail.log.read`, lien dans le menu du compte). La page déchiffre pour l'affichage et rend les
  liens cliquables : c'est ainsi que les tests e2e récupèrent le lien du dossier.
- Avec `MAIL_DRIVER=smtp`, la page n'affiche rien et le lien du menu disparaît.
- Si `AUTH_SECRET` change, les messages déjà consignés ne se déchiffrent plus (« contenu
  illisible ») : c'est un outil de test, pas un historique.

### Pilote `smtp`

| Variable        | Rôle                                         | Exemple (Brevo, test)               |
| --------------- | -------------------------------------------- | ----------------------------------- |
| `MAIL_DRIVER`   | `smtp`                                       | `smtp`                              |
| `SMTP_HOST`     | serveur SMTP (obligatoire)                   | `smtp-relay.brevo.com`              |
| `SMTP_PORT`     | port (587 par défaut : STARTTLS ; 465 : TLS) | `587`                               |
| `SMTP_USER`     | identifiant SMTP                             | identifiant du compte Brevo         |
| `SMTP_PASSWORD` | clé SMTP                                     | saisie dans Vercel, jamais ailleurs |
| `SMTP_FROM`     | expéditeur (obligatoire)                     | `Binivol <no-reply@exemple.org>`    |

Sur le VPS, les mêmes variables `SMTP_*` pointent vers le relais choisi. Les secrets se saisissent
directement dans Vercel ou sur le serveur : jamais dans un message, un commit ou un journal.

## Erreurs

Un SMTP en panne (connexion refusée, délai de 10 s dépassé, identifiants refusés) lève
`MailUnavailableError`. DIAMANT voit « L'e-mail n'a pas pu être envoyé pour le moment. Le lien reste valable : copiez-le pour le transmettre. »
dans la boîte de dialogue ; **le lien reste valable** et peut être copié. L'envoi réussi est
journalisé (`DossierLink`, champ `sentByMail`, pilote utilisé), sans le contenu.

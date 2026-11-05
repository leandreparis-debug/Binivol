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
- Les pièces jointes ne sont pas gardées : seuls leur nom, leur taille et leur empreinte
  SHA-256 sont consignés (`outbound_mails.attachments`) et listés sous le message.
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

## Messages envoyés

| Message                     | Destinataire                                | Contenu                                                                                                                  | Modèle                                             |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Lien du dossier (étape 7)   | candidat                                    | prénom, lien `/dossier/ouvrir#…`, date de fin                                                                            | `dossierLinkMail`                                  |
| Code de signature (étape 8) | candidat, ou représentant légal d'un mineur | **le code et le prénom seulement**, tutoiement, sans tiret cadratin                                                      | `signatureCodeMail`                                |
| Documents signés (étape 8)  | bénévole, et représentant légal d'un mineur | texte du paramètre `VOLUNTEER_DOSSIER_MAIL` (`{prenom}`, `{structure}`, `{pieces}`) ; 3 PDF, règlement, code de conduite | `signedDossierMail`, `DEFAULT_SIGNED_DOSSIER_MAIL` |

Le texte des documents signés est un paramètre (`settings`), modifiable plus tard sans
déploiement ; un tiret cadratin éventuel est remplacé par une virgule à l'envoi.

## Erreurs

Un SMTP en panne (connexion refusée, délai de 10 s dépassé, identifiants refusés) lève
`MailUnavailableError`. DIAMANT voit « L'e-mail n'a pas pu être envoyé pour le moment. Le lien reste valable : copiez-le pour le transmettre. »
dans la boîte de dialogue ; **le lien reste valable** et peut être copié. L'envoi réussi est
journalisé (`DossierLink`, champ `sentByMail`, pilote utilisé), sans le contenu.

À l'étape 8 : un code qui ne part pas est annulé (le défi expire aussitôt) et le message demande
de réessayer ; un e-mail de documents qui échoue laisse les documents rangés, marque le dossier
« E-mail en échec » et propose « Renvoyer l'e-mail » (`docs/signature.md`).

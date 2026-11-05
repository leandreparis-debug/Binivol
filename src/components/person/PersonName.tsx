/** « Prénom NOM », with the usage name when there is one. */
export function personDisplayName(person: {
  firstName: string;
  lastName: string;
  usageName: string | null;
}): string {
  const last = person.usageName ?? person.lastName;
  return `${person.firstName} ${last}`;
}

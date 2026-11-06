/** Sub-navigation shared by /rappels and /alertes. */
export function remindersNavItems(withAlerts: boolean) {
  return [
    { href: "/rappels", label: "Rappels" },
    ...(withAlerts ? [{ href: "/alertes", label: "Alertes" }] : []),
  ];
}

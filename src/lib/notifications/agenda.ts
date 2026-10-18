/**
 * Rendez-vous au format iCalendar (.ics), joint aux e-mails : la cliente
 * l'ajoute à son agenda d'un clic, comme avec la confirmation Krenup.
 *
 * Abidjan est en UTC : l'heure saisie est déjà l'heure UTC.
 */

const echapper = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

const horodatage = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function fichierAgenda(p: {
  id: string;
  date: string;
  /** HH:MM ou HH:MM:SS. */
  heure: string;
  dureeMin: number;
  titre: string;
  lieu: string;
  description: string;
}) {
  const debut = new Date(`${p.date}T${p.heure.slice(0, 5)}:00Z`);
  const fin = new Date(debut.getTime() + p.dureeMin * 60_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chic Africa Beauty//Rendez-vous//FR",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${p.id}@chicafricabeauty`,
    `DTSTAMP:${horodatage(new Date())}`,
    `DTSTART:${horodatage(debut)}`,
    `DTEND:${horodatage(fin)}`,
    `SUMMARY:${echapper(p.titre)}`,
    `LOCATION:${echapper(p.lieu)}`,
    `DESCRIPTION:${echapper(p.description)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${echapper(p.titre)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

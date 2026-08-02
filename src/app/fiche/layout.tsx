import { requireProfil } from "@/lib/auth";

/**
 * Coque de saisie plein ecran, sans navigation.
 *
 * La tablette est tendue a la cliente pendant cette etape : elle ne doit pas
 * pouvoir naviguer vers les fiches des autres clientes. La garde reste la
 * meme, c'est bien la session du personnel qui porte les droits.
 */
export default async function LayoutFiche({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireProfil();
  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}

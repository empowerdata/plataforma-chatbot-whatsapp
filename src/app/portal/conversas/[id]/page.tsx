import { redirect } from "next/navigation";

/** Endereço antigo de uma conversa: agora tudo abre dentro da caixa de entrada. */
export default async function PortalConversaRedirect(props: PageProps<"/portal/conversas/[id]">) {
  const { id } = await props.params;
  redirect(`/portal/conversas?c=${encodeURIComponent(id)}&v=todas`);
}

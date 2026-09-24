import { redirect } from "next/navigation";

/** Endereço antigo de uma conversa: agora tudo abre dentro da caixa de entrada. */
export default async function ConversaRedirect(props: PageProps<"/conversas/[id]">) {
  const { id } = await props.params;
  redirect(`/conversas?c=${encodeURIComponent(id)}&v=todas`);
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { MessageForm } from "@/components/message-form";
import { settleMarketOrderAction } from '@/app/actions';
import { requireMarketplaceUser } from "@/lib/auth";
import { getConversationDetails, getProjectPlatformLabel, getProjectServiceLabel, listUserConversations } from "@/lib/db";
import {
  formatCurrency,
  formatDateTime,
  formatRelativeTime,
  getInitials,
} from "@/lib/utils";

type ConversationPageProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export default async function ConversationPage({ params }: ConversationPageProps) {
  noStore();

  const user = await requireMarketplaceUser();
  const { conversationId } = await params;
  const conversations = (await listUserConversations(user.id));
  const conversation = (await getConversationDetails(conversationId));

  if (!conversation || (conversation.buyerId !== user.id && conversation.sellerId !== user.id)) {
    notFound();
  }

  const partner = conversation.buyerId === user.id ? conversation.seller : conversation.buyer;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/60 xl:grid xl:grid-cols-[360px_1fr]">
      <aside className="hidden border-r border-slate-200 xl:block">
        <div className="border-b border-slate-200 px-6 py-6">
          <div className="text-sm font-semibold  text-slate-400">Чаты</div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Сообщения</h1>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {conversations.map((item) => {
            const partner = item.buyerId === user.id ? item.seller : item.buyer;
            const active = item.id === conversation.id;

            return (
              <Link
                key={item.id}
                href={`/chats/${item.id}`}
                className={`block border-b border-slate-100 px-6 py-4 ${active ? "bg-slate-50" : "hover:bg-slate-50"}`}
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-md bg-emerald-50 text-sm font-bold text-green-700">
                    {getInitials(partner.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-xl font-semibold text-slate-950">{partner.name}</div>
                      <div className="text-sm text-slate-400">
                        {item.latestMessage ? formatRelativeTime(item.latestMessage.createdAt) : ""}
                      </div>
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-500">{item.project ? item.project.title : item.item.name}</div>
                    <div className="mt-2 line-clamp-2 text-sm text-slate-400">{item.latestMessage?.text ?? "Диалог пока пуст."}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </aside>

      <section className="flex min-h-[70vh] flex-col">
        <div className="border-b border-slate-200 px-4 py-5 sm:px-6">
          <Link href="/chats" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-green-700 xl:hidden">
            Назад к диалогам
          </Link>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold  text-slate-400">Диалог с {partner.name}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">
                {conversation.project ? conversation.project.title : conversation.item.name}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Заказ #{conversation.order.id.slice(0, 8).toUpperCase()} · {conversation.section.name}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
              {formatCurrency(conversation.order.amountRub, user.preferredCurrency)}
            </div>
          </div>
          {conversation.project ? (
            <div className="mt-4 rounded-lg bg-slate-50 px-4 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-950">
                    {(await getProjectPlatformLabel(conversation.project.platform))} · {(await getProjectServiceLabel(conversation.project.serviceType))}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Прогресс: {conversation.project.completedCount}/{conversation.project.targetCount} целей · источник{" "}
                    {conversation.project.targetSource}
                  </div>
                  {conversation.project.messageText ? (
                    <div className="mt-3 whitespace-pre-line rounded-lg bg-white px-4 py-3 text-sm leading-6 text-slate-600">
                      {conversation.project.messageText}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link
                    href={`/projects/${conversation.project.id}`}
                    className="rounded-lg bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Открыть проект
                  </Link>
                  <Link
                    href="/support"
                    className="rounded-lg bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Поддержка
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
          {!conversation.project && conversation.order.buyerId===user.id && conversation.order.status==='PENDING' ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <form action={settleMarketOrderAction}><input type="hidden" name="orderId" value={conversation.order.id}/><button name="status" value="CLOSED" className="rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white">Подтвердить получение</button></form>
              <form action={settleMarketOrderAction}><input type="hidden" name="orderId" value={conversation.order.id}/><button name="status" value="DISPUTED" className="rounded-lg bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">Открыть спор</button></form>
            </div>
          ) : null}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          {conversation.messages.map((message) => {
            const own = message.senderId === user.id;

            return (
              <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[92%] rounded-lg px-4 py-3 sm:px-5 sm:py-4 md:max-w-[70%] ${
                    own ? "bg-green-600 text-white" : "bg-slate-50 text-slate-900"
                  }`}
                >
                  <div className={`text-xs font-semibold  ${own ? "text-green-100" : "text-slate-400"}`}>
                    {message.sender.name}
                  </div>
                  <div className="mt-3 whitespace-pre-line text-sm leading-7">{message.text}</div>
                  <div className={`mt-3 text-xs ${own ? "text-green-100" : "text-slate-400"}`}>
                    {formatDateTime(message.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-slate-200 p-4 sm:p-5">
          <MessageForm conversationId={conversation.id} />
        </div>
      </section>
    </div>
  );
}

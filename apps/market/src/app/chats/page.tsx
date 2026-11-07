import Link from "next/link";
import { MessageSquareMore } from "lucide-react";
import { unstable_noStore as noStore } from "next/cache";
import { requireMarketplaceUser } from "@/lib/auth";
import { listUserConversations } from "@/lib/db";
import { formatRelativeTime, getInitials } from "@/lib/utils";

export default async function ChatsPage() {
  noStore();

  const user = await requireMarketplaceUser();
  const conversations = (await listUserConversations(user.id));

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/60 xl:grid xl:grid-cols-[360px_1fr]">
      <aside className="border-r border-slate-200">
        <div className="border-b border-slate-200 px-5 py-5 sm:px-6 sm:py-6">
          <div className="text-sm font-semibold  text-slate-400">Чаты</div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-3xl">Сообщения</h1>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {conversations.map((conversation) => {
            const partner = conversation.buyerId === user.id ? conversation.seller : conversation.buyer;

            return (
              <Link
                key={conversation.id}
                href={`/chats/${conversation.id}`}
                className="block border-b border-slate-100 px-4 py-4 hover:bg-slate-50 sm:px-6"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-emerald-50 text-sm font-bold text-green-700 sm:h-14 sm:w-14">
                    {getInitials(partner.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-lg font-semibold text-slate-950 sm:text-xl">{partner.name}</div>
                      <div className="text-sm text-slate-400">
                        {conversation.latestMessage ? formatRelativeTime(conversation.latestMessage.createdAt) : ""}
                      </div>
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-500">
                      {conversation.project ? conversation.project.title : conversation.item.name}
                    </div>
                    <div className="mt-2 line-clamp-2 text-sm text-slate-400">
                      {conversation.latestMessage?.text ?? "Диалог пока пуст."}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </aside>

      <section className="hidden min-h-[70vh] items-center justify-center xl:flex">
        <div className="text-center">
          <MessageSquareMore className="mx-auto h-20 w-20 text-slate-300" />
          <div className="mt-5 text-3xl font-semibold text-slate-400">Выберите диалог слева</div>
          <div className="mt-2 text-slate-400">Все переписки по заказам собраны здесь.</div>
        </div>
      </section>
    </div>
  );
}

import { Search } from "lucide-react";

export default function ChatListPanel({
  chats,
  activeConversationId,
  setActiveConversationId,
  contactQuery,
  setContactQuery
}) {
  const filtered = chats.filter((chat) => {
    const term = contactQuery.toLowerCase();
    return chat.partner.username.toLowerCase().includes(term) || chat.partner.email.toLowerCase().includes(term);
  });

  return (
    <section className="glass-panel flex h-full flex-col rounded-2xl p-4">
      <h3 className="font-display text-xl font-semibold text-white">Recent Chats</h3>
      <label className="mt-4 flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950/70 px-3 py-2">
        <Search size={16} className="text-slate-400" />
        <input
          value={contactQuery}
          onChange={(event) => setContactQuery(event.target.value)}
          placeholder="Search by username or email"
          className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
        />
      </label>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
        {filtered.map((chat) => (
          <button
            key={chat.id}
            onClick={() => setActiveConversationId(chat.id)}
            className={`w-full rounded-xl border px-3 py-3 text-left transition ${
              activeConversationId === chat.id
                ? "border-brandBlue/70 bg-brandBlue/20"
                : "border-slate-700/60 bg-slate-950/50 hover:border-slate-500"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="relative">
                <img src={chat.partner.avatarUrl || "https://api.dicebear.com/8.x/initials/svg?seed=nextalk"} alt={chat.partner.username} className="h-11 w-11 rounded-full object-cover" />
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-slate-900 ${chat.partner.online ? "bg-emerald-400" : "bg-slate-500"}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="truncate text-sm font-semibold text-slate-100">@{chat.partner.username}</p>
                  <p className="text-xs text-slate-500">{chat.lastMessage?.timeLabel || ""}</p>
                </div>
                <p className="truncate text-xs text-slate-400">{chat.lastMessage?.text || "Start chatting..."}</p>
              </div>
              {chat.unreadCount > 0 && (
                <span className="grid h-6 w-6 place-items-center rounded-full bg-brandBlue text-xs font-bold text-white">
                  {chat.unreadCount}
                </span>
              )}
            </div>
          </button>
        ))}

        {filtered.length === 0 && <p className="pt-8 text-center text-sm text-slate-500">No conversations yet.</p>}
      </div>
    </section>
  );
}

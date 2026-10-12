import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { sendCustomerMessage } from "./actions";

export default async function AppMessages({ applicationId }: { applicationId: string }) {
  const user = await requireUser();
  const supabase = createClient();
  const { data: messages } = await supabase
    .from("messages")
    .select("id, sender_role, body, created_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });

  return (
    <section className="rounded-lg border border-navy-100 bg-white p-5">
      <h2 className="font-semibold">Messages</h2>
      {messages && messages.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-lg p-3 text-sm ${
                m.sender_role === "staff" ? "bg-navy-50" : "bg-gold-50 ml-8"
              }`}
            >
              <p className="text-xs font-medium text-navy-600">
                {m.sender_role === "staff" ? "Case team" : "You"} ·{" "}
                {new Date(m.created_at).toLocaleString("en-GB")}
              </p>
              <p className="mt-1 whitespace-pre-line">{m.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-navy-500">No messages yet — ask anything about this case.</p>
      )}

      <form action={sendCustomerMessage} className="mt-4 flex gap-2">
        <input type="hidden" name="application_id" value={applicationId} />
        <input
          name="body"
          required
          maxLength={4000}
          placeholder="Write a message…"
          className="flex-1 rounded-md border border-navy-200 px-3 py-2 text-sm"
          aria-label="Message"
        />
        <button
          type="submit"
          className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Send
        </button>
      </form>
    </section>
  );
}

"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  Check,
  FileSignature,
  Phone,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import {
  getCollectionsQueue,
  getCollectionAccount,
  updateCollectionCase,
  createCollectionTicket,
  chargeCollectionPayment,
} from "@/actions/collections-workspace";
import {
  createSettlementDraft,
  sendSettlementAgreement,
  cancelSettlementAgreement,
} from "@/actions/settlements";
import { markAdvanceDefault } from "@/actions/advance-default";
import { CallButton } from "@/components/admin/dialer/call-button";
import { ContactCalls } from "@/components/admin/dialer/contact-calls";
import { useDialer } from "@/components/admin/dialer/dialer-provider";
import {
  buildSettlementPlan,
  paymentOutstanding,
  type SettlementTerms,
} from "@/lib/settlement-plan";

export type CollectionRow = Awaited<
  ReturnType<typeof getCollectionsQueue>
>[number];
export type CollectionDetail = Awaited<ReturnType<typeof getCollectionAccount>>;
const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const date = (s: string) =>
  new Date(s).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-700";
const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40";
function Badge({ text }: { text: string }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold tracking-wide ${["DEFAULTED", "LATE", "FAILED", "RETURNED"].includes(text) ? "bg-red-50 text-red-700" : ["ACTIVE", "PAID"].includes(text) ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-600"}`}
    >
      {text.replaceAll("_", " ")}
    </span>
  );
}

export function CollectionsPanel({
  me,
  canManage,
}: {
  me: string | null;
  canManage: boolean;
}) {
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("All accounts");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("age");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CollectionDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequest = useRef(0);
  const load = useCallback(
    () =>
      getCollectionsQueue().then(
        (next) => {
          setRows(next);
          setError(null);
          setLoading(false);
        },
        () => {
          setError("Could not load the collections queue. Please retry.");
          setLoading(false);
        },
      ),
    [],
  );
  useEffect(() => {
    void load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);
  const loadDetail = useCallback(() => {
    const request = ++detailRequest.current;
    if (!selected) return Promise.resolve();
    return getCollectionAccount(selected).then(
      (next) => {
        if (request === detailRequest.current) {
          setDetail(next);
          setDetailError(null);
        }
      },
      () => {
        if (request === detailRequest.current)
          setDetailError("Could not load this account. Retry to continue.");
      },
    );
  }, [selected]);
  useEffect(() => {
    const generation = detailRequest;
    void loadDetail();
    return () => {
      generation.current++;
    };
  }, [loadDetail]);
  const refresh = async () => {
    await Promise.all([load(), loadDetail()]);
  };
  const filtered = useMemo(
    () =>
      rows
        .filter((r) => {
          if (filter === "Defaulted" && r.status !== "DEFAULTED") return false;
          if (filter === "Overdue" && r.overdue <= 0) return false;
          if (filter === "Mine" && r.ownerEmail !== me) return false;
          if (filter === "Unassigned" && r.ownerEmail) return false;
          if (
            filter === "Follow-up due" &&
            (!r.followUpAt || new Date(r.followUpAt) > new Date())
          )
            return false;
          if (filter === "Settlements" && !r.settlementStatus) return false;
          return `${r.name} ${r.email} ${r.phone} ${r.code}`
            .toLowerCase()
            .includes(search.toLowerCase().trim());
        })
        .sort((a, b) =>
          sort === "balance"
            ? b.outstanding - a.outstanding
            : sort === "followup"
              ? (a.followUpAt ? Date.parse(a.followUpAt) : Infinity) -
                (b.followUpAt ? Date.parse(b.followUpAt) : Infinity)
              : b.daysOverdue - a.daysOverdue,
        ),
    [rows, filter, me, search, sort],
  );
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-green-700">
            Collections desk
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Collections & settlements
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Call customers, agree on a settlement, and track recovery in one
            place.
          </p>
        </div>
        <button className={buttonClass} onClick={refresh}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Accounts to review",
            value: rows.length,
            filter: "All accounts",
          },
          {
            label: "Past due",
            value: money(rows.reduce((s, r) => s + r.overdue, 0)),
            filter: "Overdue",
          },
          {
            label: "Defaulted accounts",
            value: rows.filter((r) => r.status === "DEFAULTED").length,
            filter: "Defaulted",
          },
          {
            label: "Follow-ups due",
            value: rows.filter(
              (r) => r.followUpAt && new Date(r.followUpAt) <= new Date(),
            ).length,
            filter: "Follow-up due",
          },
        ].map((m) => (
          <button
            key={m.label}
            onClick={() => setFilter(m.filter)}
            className="rounded-xl border border-zinc-200 bg-white p-4 text-left hover:border-green-700"
          >
            <p className="text-xs text-zinc-500">{m.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {loading ? "—" : m.value}
            </p>
          </button>
        ))}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white lg:flex lg:min-h-[650px]">
        <aside
          className={`${selected ? "hidden lg:flex" : "flex"} w-full flex-col border-r border-zinc-200 lg:w-[340px] lg:shrink-0`}
        >
          <div className="space-y-3 border-b border-zinc-100 p-4">
            <div className="relative">
              <Search
                className="absolute left-3 top-2.5 text-zinc-400"
                size={16}
              />
              <input
                aria-label="Search collections accounts"
                placeholder="Name, email, phone, or account"
                className={`${inputClass} pl-9`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <select
                aria-label="Filter accounts"
                className={inputClass}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {[
                  "All accounts",
                  "Overdue",
                  "Defaulted",
                  "Mine",
                  "Unassigned",
                  "Follow-up due",
                  "Settlements",
                ].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <select
                aria-label="Sort accounts"
                className={inputClass}
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="age">Oldest due</option>
                <option value="balance">Balance</option>
                <option value="followup">Follow-up</option>
              </select>
            </div>
            <p className="text-xs text-zinc-400">
              {filtered.length} accounts · updates every 30s
            </p>
          </div>
          <div className="max-h-[850px] overflow-y-auto">
            {loading ? (
              <p className="p-8 text-sm text-zinc-500">Loading accounts…</p>
            ) : filtered.length === 0 ? (
              <p className="p-8 text-sm text-zinc-500">
                No accounts match this view.
              </p>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    if (selected === r.id) return;
                    setDetail(null);
                    setDetailError(null);
                    setSelected(r.id);
                  }}
                  aria-pressed={selected === r.id}
                  className={`w-full border-b border-zinc-100 p-4 text-left transition-colors hover:bg-zinc-50 ${selected === r.id ? "border-l-4 border-l-green-700 bg-green-50/60" : "border-l-4 border-l-transparent"}`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="truncate text-sm font-semibold">
                      {r.name}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {money(r.outstanding)}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-zinc-500">
                    <span>{r.code}</span>
                    <span>
                      {r.daysOverdue
                        ? `${r.daysOverdue} days overdue`
                        : r.processing
                          ? "Debit processing"
                          : "Current schedule"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge text={r.status} />
                    {r.settlementStatus && (
                      <span className="text-[10px] text-green-700">
                        Settlement · {r.settlementStatus.toLowerCase()}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex justify-between gap-2 text-[11px] text-zinc-400">
                    <span className="truncate">
                      {r.ownerEmail === me
                        ? "Assigned to you"
                        : r.ownerEmail || "Unassigned"}
                    </span>
                    {r.followUpAt && (
                      <span
                        className={
                          new Date(r.followUpAt) <= new Date()
                            ? "text-amber-700"
                            : ""
                        }
                      >
                        Follow up {date(r.followUpAt)}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>
        <section
          className={`${selected ? "block" : "hidden lg:flex"} min-w-0 flex-1 bg-[#fbfcfa]`}
        >
          {!selected ? (
            <div className="m-auto p-10 text-center">
              <Phone className="mx-auto mb-4 text-green-700" size={32} />
              <h2 className="font-semibold">Start with an account</h2>
              <p className="mt-2 max-w-xs text-sm text-zinc-500">
                Review the balance and call history, then record a follow-up or
                prepare a settlement.
              </p>
            </div>
          ) : (
            <>
              <button
                className={`${buttonClass} m-4 lg:hidden`}
                onClick={() => setSelected(null)}
              >
                <ArrowLeft size={14} /> Back to queue
              </button>
              {detailError ? (
                <div role="alert" className="p-6 text-sm text-red-700">
                  {detailError}{" "}
                  <button className={buttonClass} onClick={loadDetail}>
                    Retry
                  </button>
                </div>
              ) : !detail ? (
                <p className="p-8 text-sm text-zinc-500">Loading account…</p>
              ) : (
                <AccountDetail
                  key={detail.id}
                  detail={detail}
                  me={me}
                  canManage={canManage}
                  refresh={refresh}
                />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function AccountDetail({
  detail: d,
  me,
  canManage,
  refresh,
}: {
  detail: CollectionDetail;
  me: string | null;
  canManage: boolean;
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState("Overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState("");
  const { numbers, callerId, setCallerId } = useDialer();
  async function run(fn: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      if (
        r &&
        typeof r === "object" &&
        (("ok" in r && !r.ok) || ("success" in r && !r.success))
      )
        throw new Error("error" in r ? String(r.error) : "Action failed");
      setNotice(success);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-zinc-400">{d.code}</p>
            <Badge text={d.status} />
          </div>
          <h2 className="mt-2 text-xl font-bold">{d.name}</h2>
          <p className="mt-1 break-all text-xs text-zinc-500">
            {d.email} · {d.phone || "No phone number"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <CallButton
            phone={d.phone}
            name={d.name}
            contactId={d.contactId ?? undefined}
          />
          {numbers.length > 1 && (
            <select
              aria-label="Outbound caller ID"
              className="max-w-44 rounded border border-zinc-200 bg-white p-1 text-xs"
              value={callerId ?? ""}
              onChange={(e) => setCallerId(e.target.value)}
            >
              <option value="">Auto · match customer’s state</option>
              {numbers.map((n) => (
                <option key={n.number} value={n.number}>
                  {n.label || n.number}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="my-5 grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        {[
          ["Unpaid balance", money(d.outstanding)],
          ["Past due", money(d.overdue)],
          ["Days overdue", String(d.daysOverdue)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-[11px] text-zinc-500">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {d.processing && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          A debit is processing. Settlement preparation and signing are
          unavailable until it settles or returns. Processing amounts are
          excluded from the unpaid balance above.
        </p>
      )}
      {d.pausedUntil && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Automated payments and collection notices are paused until{" "}
          {date(d.pausedUntil)}. Manual charges remain separate.
        </p>
      )}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-zinc-200">
        {["Overview", "Communications", "Failed payments", "Settlement", "Payments", "History"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-xs font-semibold ${tab === t ? "border-green-700 text-green-700" : "border-transparent text-zinc-500"}`}
          >
            {t}
          </button>
        ))}
      </div>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700"
        >
          {notice}
        </p>
      )}
      {tab === "Overview" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <UserRound size={15} /> Account owner
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {d.ownerEmail || "Unassigned"}
                </p>
              </div>
              <button
                disabled={busy}
                className={buttonClass}
                onClick={() =>
                  run(
                    () =>
                      updateCollectionCase({
                        applicationId: d.id,
                        assignToMe: d.ownerEmail !== me,
                      }),
                    "Ownership updated.",
                  )
                }
              >
                {d.ownerEmail === me ? "Unassign" : "Assign to me"}
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <CalendarClock size={15} /> Notes & follow-up
            </h3>
            {d.followUpAt && (
              <p className="mb-3 text-xs text-amber-700">
                Next follow-up: {new Date(d.followUpAt).toLocaleString()}{" "}
                <button
                  className="ml-2 underline"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        updateCollectionCase({
                          applicationId: d.id,
                          followUpAt: null,
                        }),
                      "Follow-up completed.",
                    )
                  }
                >
                  Mark done
                </button>
              </p>
            )}
            <textarea
              aria-label="Internal collection note"
              className={inputClass}
              rows={3}
              placeholder="Call outcome, customer request, or next step…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <label className="mt-3 block text-xs text-zinc-500">
              Next follow-up (optional)
              <input
                type="datetime-local"
                className={`${inputClass} mt-1`}
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                disabled={busy || (!note.trim() && !followUp)}
                className={buttonClass}
                onClick={() =>
                  run(async () => {
                    await updateCollectionCase({
                      applicationId: d.id,
                      note,
                      ...(followUp
                        ? { followUpAt: new Date(followUp).toISOString() }
                        : {}),
                    });
                    setNote("");
                    setFollowUp("");
                  }, "Note and follow-up saved.")
                }
              >
                <Check size={14} /> Save
              </button>
              <button
                disabled={busy || note.trim().length < 3}
                className={buttonClass}
                onClick={() =>
                  run(
                    () => createCollectionTicket(d.id, note),
                    "Support ticket created and assigned to you.",
                  )
                }
              >
                Create ticket from note
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="text-sm font-semibold">Collection activity</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Projected next steps from the existing collection flow.
            </p>
            {d.upcoming.length ? (
              d.upcoming.map((s, i) => (
                <div key={i} className="mt-3 border-l-2 border-green-700 pl-3">
                  <p className="text-xs font-medium">{s.label}</p>
                  <p className="text-[11px] text-zinc-400">
                    {s.channel}
                    {s.date ? ` · ${date(s.date)}` : ""}
                    {d.pausedUntil ? " · paused" : ""}
                  </p>
                </div>
              ))
            ) : (
              <p className="mt-3 text-xs text-zinc-500">
                No upcoming collection notices.
              </p>
            )}
          </div>
          {canManage &&
            ["FUNDED", "ACTIVE", "REPAYING", "LATE"].includes(d.status) && (
              <button
                className={buttonClass}
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      `Mark ${d.name} (${d.code}) as defaulted? This changes the account status and stops automated payment retries.`,
                    )
                  )
                    void run(
                      () => markAdvanceDefault(d.id),
                      "Account marked as defaulted.",
                    );
                }}
              >
                <AlertCircle size={14} /> Mark defaulted
              </button>
            )}
          {d.contactId && <ContactCalls contactId={d.contactId} />}
        </div>
      )}
      {tab === "Settlement" && (
        <div className="space-y-4">
          {!canManage && (
            <p className="text-sm text-zinc-500">
              A manager with payment permissions can prepare and send settlement
              agreements.
            </p>
          )}
          {d.settlements.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-zinc-200 bg-white p-4"
            >
              <div className="flex justify-between gap-2">
                <div>
                  <p className="text-lg font-semibold">{money(s.total)}</p>
                  <p className="text-xs text-zinc-500">
                    {s.count} payments · {s.frequency.toLowerCase()} ·{" "}
                    {money(Math.max(0, s.originalBalance - s.total))} reduction
                  </p>
                </div>
                <Badge text={s.status} />
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {s.signedAt
                  ? `Signed by ${s.signedName} · ${date(s.signedAt)}`
                  : `Signing deadline: ${new Date(s.expiresAt).toLocaleString()}`}
              </p>
              {s.sentAt && (
                <p className="mt-1 text-xs text-zinc-400">
                  Last sent {new Date(s.sentAt).toLocaleString()}
                </p>
              )}
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer font-semibold text-green-700">
                  Review exact agreement & schedule
                </summary>
                <div className="mt-3 max-h-96 overflow-auto rounded-lg bg-zinc-50 p-3">
                  <p className="whitespace-pre-wrap">{s.agreementText}</p>
                  <table className="my-4 w-full text-left">
                    <thead>
                      <tr>
                        <th>Payment date</th>
                        <th className="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.schedule.map((p, i) => (
                        <tr key={i}>
                          <td className="py-1">{p.date}</td>
                          <td className="text-right">{money(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p>{s.authorizationText}</p>
                </div>
              </details>
              {canManage && ["DRAFT", "SENT"].includes(s.status) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    disabled={busy || new Date(s.expiresAt) <= new Date()}
                    className={`${buttonClass} !bg-green-700 !text-white`}
                    onClick={() => {
                      if (
                        confirm(
                          `Send this ${money(s.total)} settlement agreement to ${d.email}? The old schedule remains until the customer signs.`,
                        )
                      )
                        void run(
                          () => sendSettlementAgreement(s.id),
                          "Settlement agreement sent.",
                        );
                    }}
                  >
                    <FileSignature size={14} />{" "}
                    {s.sentAt ? "Resend agreement" : "Send agreement"}
                  </button>
                  <button
                    disabled={busy}
                    className={buttonClass}
                    onClick={() => {
                      if (
                        confirm(
                          "Cancel this unsigned settlement? The existing schedule will stay unchanged.",
                        )
                      )
                        void run(
                          () => cancelSettlementAgreement(s.id),
                          "Unsigned settlement canceled.",
                        );
                    }}
                  >
                    Cancel offer
                  </button>
                </div>
              )}
            </div>
          ))}
          {canManage &&
            !d.settlements.some(
              (s) =>
                ["DRAFT", "SENT"].includes(s.status) &&
                new Date(s.expiresAt) > new Date(),
            ) && <SettlementComposer detail={d} busy={busy} run={run} />}
        </div>
      )}
      {tab === "Communications" && <Communications rows={d.communications} />}
      {tab === "Failed payments" && <FailedPayments payments={d.payments} />}
      {tab === "Payments" && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            New settlement payments become collectible after the customer signs.
            Prior installments remain here for the audit trail.
          </p>
          {d.payments.map((p) => (
            <PaymentRow
              key={p.id}
              payment={p}
              canManage={canManage}
              busy={busy}
              run={run}
            />
          ))}
        </div>
      )}
      {tab === "History" && (
        <div className="space-y-3">
          {d.events.length === 0 && (
            <p className="text-sm text-zinc-500">No collection activity yet.</p>
          )}
          {d.events.map((e) => (
            <div
              key={e.id}
              className="rounded-xl border border-zinc-200 bg-white p-4"
            >
              <p className="text-xs font-semibold">
                {e.type.replaceAll("_", " ")}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-600">
                {e.notes}
              </p>
              <p className="mt-2 text-[11px] text-zinc-400">
                {new Date(e.date).toLocaleString()} · {e.by || "System"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Run = (fn: () => Promise<unknown>, success: string) => Promise<void>;
function PaymentRow({
  payment: p,
  canManage,
  busy,
  run,
}: {
  payment: CollectionDetail["payments"][number];
  canManage: boolean;
  busy: boolean;
  run: Run;
}) {
  const outstanding = paymentOutstanding({
    ...p,
    dueDate: new Date(p.dueDate),
  });
  const [amount, setAmount] = useState("");
  const requested = amount === "" ? outstanding : Number(amount);
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            Payment #{p.paymentNumber} · {money(p.amount)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Due {date(p.dueDate)} · Collected {money(p.collectedAmount)}
            {p.lateFee > 0 ? ` · Fee ${money(p.lateFee)}` : ""}
          </p>
          {p.settlementId && (
            <p className="mt-1 text-xs text-green-700">
              Settlement installment
            </p>
          )}
          {p.supersededBySettlementId && (
            <p className="mt-1 text-xs text-zinc-400">
              Replaced by signed settlement
            </p>
          )}
          {p.increaseReturnReason && (
            <p className="mt-1 text-xs text-red-700">
              {p.increaseReturnReason}
            </p>
          )}
        </div>
        <Badge text={p.status} />
      </div>
      {p.attempts.length > 0 && <details className="mt-3 border-t border-zinc-100 pt-3 text-xs">
        <summary className="cursor-pointer font-medium text-green-700">Payment attempts ({p.attempts.length})</summary>
        <div className="mt-2 space-y-2">{p.attempts.map(a => <div key={a.id} className="rounded-lg bg-zinc-50 p-3">
          <p className="font-semibold">Attempt {a.attemptNumber} · {money(a.amount)} · {a.finalStatus || a.increaseTransferStatus || "Processing"}</p>
          {a.returnReason && <p className="mt-1 text-red-700">{a.returnReason}</p>}
          <p className="mt-1 text-zinc-500">{new Date(a.initiatedAt).toLocaleString()} · {a.initiatedBy}</p>
        </div>)}</div>
      </details>}
      {canManage && outstanding > 0 && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex-1 text-[11px] text-zinc-500">
            Amount to collect (up to {money(outstanding)})
            <input
              aria-label={`Collection amount for payment ${p.paymentNumber}`}
              type="number"
              step="0.01"
              min="0.01"
              max={outstanding}
              placeholder={outstanding.toFixed(2)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <button
            className={buttonClass}
            disabled={
              busy ||
              !Number.isFinite(requested) ||
              requested <= 0 ||
              requested > outstanding
            }
            onClick={() => {
              if (
                confirm(
                  `Initiate an ACH debit of ${money(requested)} for payment #${p.paymentNumber}?`,
                )
              )
                void run(
                  () => chargeCollectionPayment(p.id, requested),
                  "ACH debit initiated. Refresh to check its status.",
                );
            }}
          >
            Charge {money(Number.isFinite(requested) ? requested : 0)}
          </button>
        </div>
      )}
    </div>
  );
}
function SettlementComposer({
  detail,
  busy,
  run,
}: {
  detail: CollectionDetail;
  busy: boolean;
  run: Run;
}) {
  const [total, setTotal] = useState(detail.outstanding.toFixed(2));
  const [count, setCount] = useState("4");
  const [frequency, setFrequency] =
    useState<SettlementTerms["frequency"]>("WEEKLY");
  const [firstDate, setFirstDate] = useState("");
  const [expires, setExpires] = useState("");
  const [agreement, setAgreement] = useState("");
  let plan: { date: string; amount: number }[] = [];
  let validation = "";
  try {
    plan = buildSettlementPlan({
      total: Number(total),
      count: Number(count),
      frequency,
      firstDate,
    });
  } catch (e) {
    validation = e instanceof Error ? e.message : "Check the settlement terms.";
  }
  return (
    <div className="rounded-xl border border-green-200 bg-white p-5">
      <h3 className="text-base font-semibold">Prepare a new settlement</h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        Set the total and payment schedule, then add the reviewed agreement
        wording. Saving a draft does not send it or change payments.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-xs text-zinc-500">
          Settlement total ($)
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={detail.outstanding}
            className={`${inputClass} mt-1`}
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </label>
        <label className="text-xs text-zinc-500">
          Number of payments
          <input
            type="number"
            min="1"
            max="120"
            className={`${inputClass} mt-1`}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </label>
        <label className="text-xs text-zinc-500">
          Frequency
          <select
            className={`${inputClass} mt-1`}
            value={frequency}
            onChange={(e) =>
              setFrequency(e.target.value as SettlementTerms["frequency"])
            }
          >
            <option value="WEEKLY">Weekly</option>
            <option value="BIWEEKLY">Every two weeks</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          First payment
          <input
            type="date"
            className={`${inputClass} mt-1`}
            value={firstDate}
            onChange={(e) => setFirstDate(e.target.value)}
          />
        </label>
        <label className="col-span-2 text-xs text-zinc-500">
          Signing deadline (before first payment)
          <input
            type="datetime-local"
            className={`${inputClass} mt-1`}
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </label>
      </div>
      {firstDate && validation && (
        <p className="mt-2 text-xs text-amber-700">{validation}</p>
      )}
      {plan.length > 0 && (
        <div className="my-3 max-h-40 overflow-y-auto rounded-lg bg-green-50 p-3">
          {plan.map((p, i) => (
            <div key={i} className="flex justify-between py-1 text-xs">
              <span>{p.date}</span>
              <span>{money(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
      <label className="mt-4 block text-xs text-zinc-500">
        Reviewed settlement agreement text
        <textarea
          rows={7}
          className={`${inputClass} mt-1`}
          value={agreement}
          onChange={(e) => setAgreement(e.target.value)}
          placeholder="Paste the approved settlement terms, including what changes from the original agreement and what happens after payment…"
        />
      </label>
      <button
        disabled={
          busy ||
          detail.processing ||
          !!validation ||
          !expires ||
          agreement.trim().length < 40 ||
          Number(total) > detail.outstanding
        }
        className={`${buttonClass} mt-4 !bg-green-700 !text-white`}
        onClick={() =>
          run(
            () =>
              createSettlementDraft({
                applicationId: detail.id,
                total: Number(total),
                count: Number(count),
                frequency,
                firstDate,
                expiresAt: new Date(expires).toISOString(),
                agreementText: agreement,
              }),
            "Draft saved. Review the agreement before sending it.",
          )
        }
      >
        <FileSignature size={14} /> Save settlement draft
      </button>
    </div>
  );
}

function Communications({ rows }: { rows: CollectionDetail["communications"] }) {
  const [channel, setChannel] = useState("All");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const filtered = rows.filter(r => (channel === "All" || r.channel === channel) && `${r.title} ${r.body} ${r.status || ""} ${r.by || ""}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-3">
    <p className="text-xs text-zinc-500">Stored customer communications and CRM activity, newest first. Delivery events may appear alongside messages.</p>
    <div className="flex flex-wrap gap-2">
      <input aria-label="Search communications" placeholder="Search messages, notes, or agent…" value={query} onChange={e => {setQuery(e.target.value);setLimit(20);}} className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white p-2 text-sm" />
      <select aria-label="Communication channel" value={channel} onChange={e => {setChannel(e.target.value);setLimit(20);}} className="rounded-lg border border-zinc-200 bg-white p-2 text-sm">{["All", "Calls", "SMS", "Email", "Chat", "Tickets", "Activity"].map(c => <option key={c}>{c}</option>)}</select>
    </div>
    <p className="text-xs text-zinc-500">{filtered.length} records</p>
    {!filtered.length && <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">No communications found{query || channel !== "All" ? " for this filter" : " for this account"}.</p>}
    {filtered.slice(0,limit).map(r => <article key={r.id} className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-green-700">{r.channel}</span>{r.status && <Badge text={r.status} />}</div>
      <p className="mt-2 break-words text-sm font-semibold">{r.title}</p>
      {r.body && <details className="mt-2 text-sm"><summary className="cursor-pointer text-green-700">View message / details</summary><p className="mt-2 whitespace-pre-wrap break-words text-zinc-600">{r.body}</p></details>}
      <p className="mt-2 text-[11px] text-zinc-500">{new Date(r.date).toLocaleString()}{r.by ? ` · ${r.by}` : ""}</p>
    </article>)}
    {filtered.length > limit && <button onClick={() => setLimit(n => n + 20)} className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm">Load more ({filtered.length-limit} remaining)</button>}
  </div>;
}

function FailedPayments({ payments }: { payments: CollectionDetail["payments"] }) {
  const failures = payments.flatMap<{ id: string; payment: number; amount: number; date: string; status: string; reason: string; by: string | null; attempt: number | null; current: string; replaced: boolean }>(p => {
    const attempts = p.attempts.filter(a => ["FAILED", "RETURNED", "REJECTED"].includes((a.finalStatus || a.increaseTransferStatus || "").toUpperCase()));
    if (attempts.length) return attempts.map(a => ({ id: a.id, payment: p.paymentNumber, amount: a.amount, date: a.initiatedAt, status: a.finalStatus || a.increaseTransferStatus || "FAILED", reason: a.returnReason || "No failure reason recorded.", by: a.initiatedBy, attempt: a.attemptNumber, current: p.status, replaced: !!p.supersededBySettlementId }));
    if (["FAILED", "RETURNED", "REJECTED"].includes(p.status) || p.increaseReturnReason || p.increaseLastError) return [{ id: p.id, payment: p.paymentNumber, amount: p.amount, date: p.dueDate, status: ["FAILED", "RETURNED", "REJECTED"].includes(p.status) ? p.status : "Failure recorded", reason: p.increaseReturnReason || p.increaseLastError || "No failure reason recorded.", by: null, attempt: null, current: p.status, replaced: !!p.supersededBySettlementId }];
    return [];
  }).sort((a,b) => b.date.localeCompare(a.date));
  return <div className="space-y-3">
    <p className="text-sm font-semibold">{failures.length} recorded failed or returned attempts</p>
    <p className="text-xs text-zinc-500">Historical failures remain visible after retries or settlements. Attempt dates show when the debit was initiated; older records without an attempt show the payment due date.</p>
    {!failures.length && <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">No failed payments recorded for this account.</p>}
    {failures.map(f => <article key={f.id} className="rounded-xl border border-red-100 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">Payment #{f.payment} · {money(f.amount)}{f.attempt ? ` · Attempt ${f.attempt}` : ""}</p><Badge text={f.status} /></div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-red-700">{f.reason}</p>
      <p className="mt-2 text-xs text-zinc-500">{f.attempt ? "Attempt initiated" : "Payment due"}: {new Date(f.date).toLocaleString()}{f.by ? ` · ${f.by}` : ""}</p>
      <p className="mt-1 text-xs text-zinc-500">Current payment status: {f.current}{f.replaced ? " · Replaced by signed settlement" : ""}</p>
    </article>)}
  </div>;
}

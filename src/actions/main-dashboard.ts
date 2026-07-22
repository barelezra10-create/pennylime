"use server";

import { prisma } from "@/lib/db";
import { getAdvances } from "@/actions/advances";

export type MainDashboard = {
  stages: { stage: string; count: number; amount: number }[];
  money: {
    moneyOut: number;
    paidBack: number;
    profit: number;
    potentialProfit: number;
    totalOutstanding: number;
    totalAsk: number;
  };
  support: {
    ticketsSolved: number;
    ticketsOpen: number;
    chatsActive: number;
    chatsTotal: number;
    emailsUnread: number;
    emailsInbound: number;
  };
};

export async function getMainDashboard(): Promise<MainDashboard> {
  const { advances, summary } = await getAdvances();

  const STAGES = ["Pending", "Approved", "Active", "Paid", "Default", "Rejected"];
  const FUNDED = new Set(["Active", "Paid", "Default"]);

  const stages = STAGES.map((stage) => {
    const rows = advances.filter((a) => a.stageTab === stage);
    const amount = rows.reduce(
      (s, a) => s + (FUNDED.has(stage) ? a.fundedAmount : a.requestedAmount),
      0,
    );
    return { stage, count: rows.length, amount };
  });

  const totalAsk = advances.reduce((s, a) => s + a.requestedAmount, 0);

  const [ticketsSolved, ticketsOpen, chatsActive, chatsTotal, emailsUnread, emailsInbound] =
    await Promise.all([
      prisma.supportTicket.count({ where: { status: "closed" } }),
      prisma.supportTicket.count({ where: { status: "open" } }),
      // Active chats: channel=chat, not ended, not archived
      prisma.agentSession.count({
        where: { channel: "chat", endedAt: null, archivedAt: null },
      }),
      prisma.agentSession.count({ where: { channel: "chat" } }),
      prisma.inboundEmail.count({ where: { status: "UNREAD" } }),
      prisma.inboundEmail.count(),
    ]);

  return {
    stages,
    money: {
      moneyOut: summary.moneyOut,
      paidBack: summary.paidBack,
      profit: summary.profit,
      potentialProfit: summary.potentialProfit,
      totalOutstanding: summary.totalOutstanding,
      totalAsk,
    },
    support: {
      ticketsSolved,
      ticketsOpen,
      chatsActive,
      chatsTotal,
      emailsUnread,
      emailsInbound,
    },
  };
}

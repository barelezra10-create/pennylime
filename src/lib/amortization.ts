export interface ScheduleEntry {
  paymentNumber: number;
  dueDate: Date;
  amount: number;
  principal: number;
  interest: number;
}

export function generateSchedule(
  fundedAmount: number,
  annualRate: number,
  termMonths: number,
  firstDueDate?: Date
): ScheduleEntry[] {
  const monthlyRate = annualRate / 100 / 12;
  const monthlyPayment =
    (fundedAmount * (monthlyRate * Math.pow(1 + monthlyRate, termMonths))) /
    (Math.pow(1 + monthlyRate, termMonths) - 1);

  const schedule: ScheduleEntry[] = [];
  let balance = fundedAmount;

  const startDate = firstDueDate ?? new Date();
  if (!firstDueDate) {
    startDate.setDate(startDate.getDate() + 30);
  }

  for (let i = 1; i <= termMonths; i++) {
    const interest = balance * monthlyRate;
    const principal = i === termMonths ? balance : monthlyPayment - interest;
    const amount = i === termMonths ? balance + interest : monthlyPayment;

    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));

    schedule.push({
      paymentNumber: i,
      dueDate,
      amount: Math.round(amount * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      interest: Math.round(interest * 100) / 100,
    });

    balance -= principal;
  }

  return schedule;
}

export function calculateRemainingBalance(
  payments: { principal: number; status: string }[]
): number {
  const paidPrincipal = payments
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + Number(p.principal), 0);
  const totalPrincipal = payments.reduce((sum, p) => sum + Number(p.principal), 0);
  return Math.round((totalPrincipal - paidPrincipal) * 100) / 100;
}

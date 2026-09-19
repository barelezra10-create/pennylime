/** Descriptive totals include settled collections, while excluding canceled obligations from the remaining schedule. */
export function paymentProgress(payments: Array<{status:string; amount:unknown; lateFee:unknown; collectedAmount:unknown; dueDate:Date; supersededBySettlementId?:string|null}>) {
  const collected = payments.reduce((sum,p)=>sum+Math.max(0, Math.round(Number(p.collectedAmount)*100)),0)/100;
  const scheduled = payments.filter(p=>!p.supersededBySettlementId && !["CANCELED","WAIVED","REPLACED"].includes(p.status));
  const remaining=scheduled.filter(p=>p.status!=="PAID").reduce((sum,p)=>sum+Math.max(0,Math.round((Number(p.amount)+Number(p.lateFee)-Number(p.collectedAmount))*100)),0)/100;
  const next=scheduled.filter(p=>!["PAID","PROCESSING"].includes(p.status)).sort((a,b)=>a.dueDate.getTime()-b.dueDate.getTime())[0];
  return {collected, remaining, paidCount: payments.filter(p=>p.status==="PAID").length, processingCount:scheduled.filter(p=>p.status==="PROCESSING").length, failedCount:scheduled.filter(p=>["FAILED","RETURNED"].includes(p.status)).length, nextPaymentDate:next?.dueDate.toISOString()??null, nextPaymentAmount:next?Math.max(0,Number(next.amount)+Number(next.lateFee)-Number(next.collectedAmount)):null};
}

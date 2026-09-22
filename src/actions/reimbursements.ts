"use server";
import {createHash} from "node:crypto";
import {prisma} from "@/lib/db";
import {requireNonSupportRole} from "@/lib/auth-helpers";
import {getPortalApplicationId} from "@/lib/portal-auth";
import {getReimbursementTransaction,createTransaction} from "@/lib/goach";
import {goachProductionReady} from "@/lib/payment-processor";
import {reimbursementTerms,REIMBURSABLE_STATUSES,CREDIT_PAID_STATUSES,duplicateReimbursementCents} from "@/lib/reimbursement-terms";
import {sendEmail} from "@/lib/emails/send";
import {revalidatePath} from "next/cache";
async function manager(){const a=await requireNonSupportRole();if(!a.ok)throw Error(a.error);return a.email;}
const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
const failure=(e:unknown)=>({ok:false as const,error:e instanceof Error?e.message:"Reimbursement could not be completed."});
function refresh(){revalidatePath("/admin/reimbursements");}
export async function prepareReimbursement(applicationId:string,paymentIds:string[]){
 try {
 const actor=await manager();if(!goachProductionReady())throw Error("Production processor is unavailable.");
 const ids=[...new Set(paymentIds)];if(!ids.length||ids.length>40)throw Error("Select the original debits to reimburse.");
 const app=await prisma.application.findUniqueOrThrow({where:{id:applicationId}});
 const payments=await prisma.payment.findMany({where:{id:{in:ids},applicationId}});
 if(payments.length!==ids.length)throw Error("Selected payments do not belong to this account.");
 const items:{paymentId:string;transferUuid:string;amountCents:number;dueDate:Date;originalStatus:string}[]=[];let bank="";
 for(const p of payments){if(p.processor!=="goach"||!p.goachTransactionUuid)throw Error("An original GoACH debit is required.");const live=await getReimbursementTransaction(p.goachTransactionUuid);
 if(live.uuid!==p.goachTransactionUuid||live.type!=="Debit"||!REIMBURSABLE_STATUSES.includes(live.status))throw Error("An original debit was canceled, returned, or is not ready for reimbursement. Refresh its status.");
 if(bank&&bank!==live.bankAccountUuid)throw Error("Select debits from one bank account at a time.");bank=live.bankAccountUuid;
 items.push({paymentId:p.id,transferUuid:live.uuid,amountCents:live.amountCents,dueDate:p.dueDate,originalStatus:live.status});}
 const amountCents=items.reduce((s,i)=>s+i.amountCents,0);if(amountCents>100000)throw Error("Reimbursements are limited to $1,000 per agreement. Select fewer debits.");
 const customerName=`${app.firstName.trim()} ${app.lastName.trim()}`;
 const agreementText=reimbursementTerms(customerName,app.applicationCode,items);
 const row=await prisma.$transaction(async tx=>{
 const r=await tx.reimbursement.create({data:{applicationId,customerName,applicationCode:app.applicationCode,amountCents,bankAccountUuid:bank,agreementText,agreementHash:digest(agreementText),createdBy:actor,items:{create:items}}});
 await tx.auditLog.create({data:{action:"REIMBURSEMENT_PREPARED",entityType:"APPLICATION",entityId:applicationId,performedBy:actor,details:JSON.stringify({reimbursementId:r.id,amountCents})}});return r;
 });refresh();return {ok:true as const,id:row.id};
 }catch(e){if((e as {code?:string})?.code==="P2002")return {ok:false as const,error:"One of these debits already has a reimbursement agreement. Open the existing agreement."};return failure(e);}
}
export async function sendReimbursementAgreement(id:string){
 try{const actor=await manager();const row=await prisma.reimbursement.findUniqueOrThrow({where:{id}});if(!["DRAFT","SENT"].includes(row.status))throw Error("This agreement is not available to send.");
 const app=await prisma.application.findUniqueOrThrow({where:{id:row.applicationId},select:{email:true}});
 const claimed=await prisma.reimbursement.updateMany({where:{id,status:row.status,sendStartedAt:null},data:{status:"SENT",sendStartedAt:new Date()}});if(!claimed.count)throw Error("This agreement is already being sent. Refresh before retrying.");
 const base=(process.env.NEXTAUTH_URL||"https://pennylime.com").replace(/\/$/,"");
 const result=await sendEmail({to:app.email,subject:"PennyLime reimbursement agreement",html:`<p>Please review your $${(row.amountCents/100).toFixed(2)} reimbursement agreement.</p><p><a href="${base}/portal/reimbursements/${encodeURIComponent(id)}">Review and sign your agreement</a></p><p>This reimbursement does not restart your canceled payment schedule. No additional fees apply. A separate confirmation will be available when the reimbursement is submitted.</p>`});
 if(!result.success){await prisma.reimbursement.updateMany({where:{id,signedAt:null},data:{status:row.status,sendStartedAt:null}});throw Error("Email was not confirmed sent. Check delivery history before retrying.");}
 await prisma.$transaction([prisma.reimbursement.update({where:{id},data:{sentAt:new Date(),sendStartedAt:null}}),prisma.auditLog.create({data:{action:"REIMBURSEMENT_AGREEMENT_SENT",entityType:"APPLICATION",entityId:row.applicationId,performedBy:actor,details:JSON.stringify({reimbursementId:id})}})]);refresh();return {ok:true as const};
 }catch(e){return failure(e);}
}
export async function signReimbursementAgreement(id:string,name:string,hash:string,consent:boolean){
 try{const applicationId=await getPortalApplicationId();if(!applicationId||!consent||name.trim().length<2||name.length>150)throw Error("Sign in, enter your full name, and accept the agreement.");
 await prisma.$transaction(async tx=>{const row=await tx.reimbursement.findFirst({where:{id,applicationId}});if(!row||row.status!=="SENT"||row.agreementHash!==hash||digest(row.agreementText)!==hash)throw Error("The agreement is unavailable or changed. Reload it before signing.");const changed=await tx.reimbursement.updateMany({where:{id,applicationId,status:"SENT",agreementHash:hash},data:{status:"SIGNED",signedAt:new Date(),signedName:name.trim()}});if(!changed.count)throw Error("The agreement has already changed.");await tx.auditLog.create({data:{action:"REIMBURSEMENT_SIGNED",entityType:"APPLICATION",entityId:applicationId,performedBy:"portal:"+name.trim(),details:JSON.stringify({reimbursementId:id,agreementHash:hash})}});});revalidatePath(`/portal/reimbursements/${id}`);refresh();return {ok:true as const};
 }catch(e){return failure(e);}
}
export async function sendReimbursementCredit(id:string,confirmed:boolean){
 try{const actor=await manager();if(!confirmed||!goachProductionReady())throw Error("Confirm the reimbursement and production processor.");const row=await prisma.reimbursement.findUniqueOrThrow({where:{id},include:{items:true}});
 if(row.status!=="SIGNED"||!row.signedAt||row.creditUuid||digest(row.agreementText)!==row.agreementHash)throw Error("A signed, unchanged agreement with no prior credit is required.");
 for(const item of row.items){const live=await getReimbursementTransaction(item.transferUuid);if(live.type!=="Debit"||live.uuid!==item.transferUuid||live.amountCents!==item.amountCents||live.bankAccountUuid!==row.bankAccountUuid||!REIMBURSABLE_STATUSES.includes(live.status))throw Error("The original debit changed or returned. Do not send this reimbursement; review with the processor.");}
 if(row.amountCents<=0||row.amountCents>100000||row.items.reduce((s,i)=>s+i.amountCents,0)!==row.amountCents)throw Error("Reimbursement amount does not match the agreement.");
 // This durable one-way claim is never reset after any external submission attempt.
 // An ambiguous network outcome requires processor reconciliation, never a blind retry.
 const claim=await prisma.reimbursement.updateMany({where:{id,status:"SIGNED",creditUuid:null,submittedAt:null},data:{status:"SUBMITTING",submittedAt:new Date()}});if(!claim.count)throw Error("This reimbursement is already submitted or under review. No second credit was sent.");
 try{const result=await createTransaction({type:"Credit",bankAccountUuid:row.bankAccountUuid,amountCents:row.amountCents,descriptor:"PL REF "+id.slice(0,12)});
 if(!result.ok || !result.uuid || result.uuid === "undefined")throw Error("GoACH did not confirm the credit. Reconcile with the processor before any retry.");
 await prisma.$transaction([prisma.reimbursement.update({where:{id},data:{creditUuid:result.uuid,creditStatus:result.status,status:CREDIT_PAID_STATUSES.includes(result.status)?"PAID":"PROCESSING",lastError:null}}),prisma.auditLog.create({data:{action:"REIMBURSEMENT_CREDIT_SUBMITTED",entityType:"APPLICATION",entityId:row.applicationId,performedBy:actor,details:JSON.stringify({reimbursementId:id,creditUuid:result.uuid,amountCents:row.amountCents})}})]);
 }catch{await prisma.reimbursement.updateMany({where:{id,status:"SUBMITTING"},data:{status:"REVIEW",lastError:"Credit outcome requires processor reconciliation. Do not issue another credit."}});throw Error("Credit outcome requires processor reconciliation. No automatic retry is allowed.");}
 refresh();return {ok:true as const};
 }catch(e){return failure(e);}
}
export async function refreshReimbursement(id:string){
 try{await manager();const row=await prisma.reimbursement.findUniqueOrThrow({where:{id},include:{items:true}});const items=[];
 for(const i of row.items){const live=await getReimbursementTransaction(i.transferUuid);if(live.uuid!==i.transferUuid||live.type!=="Debit"||live.bankAccountUuid!==row.bankAccountUuid||live.amountCents!==i.amountCents)throw Error("Original transaction evidence does not match.");items.push({...i,originalStatus:live.status});}
 let creditStatus=row.creditStatus??"";if(row.creditUuid){const live=await getReimbursementTransaction(row.creditUuid);if(live.uuid!==row.creditUuid||live.type!=="Credit"||live.amountCents!==row.amountCents||live.bankAccountUuid!==row.bankAccountUuid)throw Error("Credit evidence does not match.");creditStatus=live.status;}
 await prisma.$transaction([...items.map(i=>prisma.reimbursementItem.update({where:{id:i.id},data:{originalStatus:i.originalStatus}})),prisma.reimbursement.update({where:{id},data:{lastCheckedAt:new Date(),creditStatus:creditStatus||null,duplicateCents:duplicateReimbursementCents(creditStatus,items),...(row.creditUuid?{status:CREDIT_PAID_STATUSES.includes(creditStatus)?"PAID":["Returned","NSF","Failed","Cancelled","Canceled"].includes(creditStatus)?"REVIEW":"PROCESSING"}:{})}})]);refresh();return {ok:true as const};
 }catch(e){return failure(e);}
}

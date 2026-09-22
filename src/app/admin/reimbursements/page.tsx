import Link from "next/link";
import {prisma} from "@/lib/db";
import {requireNonSupportRole} from "@/lib/auth-helpers";
import {ReimbursementManager} from "./reimbursement-manager";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;applicationId?:string}>}){
 const auth=await requireNonSupportRole();if(!auth.ok)return <p>{auth.error}</p>;
 const {q="",applicationId}=await searchParams;
 const apps=await prisma.application.findMany({where:applicationId?{id:applicationId}:q.trim()?{OR:[{firstName:{contains:q.trim(),mode:"insensitive"}},{lastName:{contains:q.trim(),mode:"insensitive"}},{applicationCode:{contains:q.trim(),mode:"insensitive"}}]}:{id:{in:(await prisma.reimbursement.findMany({select:{applicationId:true},distinct:["applicationId"]})).map(r=>r.applicationId)}},take:20,orderBy:{createdAt:"desc"},select:{id:true,firstName:true,lastName:true,applicationCode:true,status:true,payments:{where:{processor:"goach",goachTransactionUuid:{not:null}},orderBy:{dueDate:"asc"},select:{id:true,amount:true,dueDate:true,status:true,goachTransactionUuid:true}}}});
 const rows=await prisma.reimbursement.findMany({where:{applicationId:{in:apps.map(a=>a.id)}},include:{items:true},orderBy:{createdAt:"desc"}});
 return <div className="space-y-6"><Link href="/support" className="text-sm text-green-700">Back to support</Link><h1 className="text-3xl font-bold">Reimbursements</h1><p className="text-sm text-zinc-600">Review the agreement, send it for signature, then issue a separate reimbursement to the original bank account. Rejected applications remain closed.</p><form className="flex gap-3"><input name="q" defaultValue={q} placeholder="First name, last name, or account code" className="w-full max-w-md rounded-lg border p-3"/><button className="rounded-lg bg-green-700 px-5 text-white">Find account</button></form>
 {apps.length===0&&<p>Search for an account to prepare a reimbursement.</p>}
 {apps.map(a=><ReimbursementManager key={a.id} account={{id:a.id,name:`${a.firstName.trim()} ${a.lastName.trim()}`,code:a.applicationCode,status:a.status,payments:a.payments.map(p=>({id:p.id,amount:Number(p.amount),date:p.dueDate.toISOString().slice(0,10),status:p.status,reserved:rows.some(r=>r.items.some(i=>i.transferUuid===p.goachTransactionUuid))}))}} rows={rows.filter(r=>r.applicationId===a.id).map(r=>({id:r.id,status:r.status,amount:r.amountCents/100,text:r.agreementText,hash:r.agreementHash,signedName:r.signedName,signedAt:r.signedAt?.toISOString()??null,sentAt:r.sentAt?.toISOString()??null,creditStatus:r.creditStatus,creditUuid:r.creditUuid,duplicate:r.duplicateCents/100,lastError:r.lastError,items:r.items.map(i=>({date:i.dueDate.toISOString().slice(0,10),amount:i.amountCents/100,status:i.originalStatus,reference:i.transferUuid}))}))}/>)}
 </div>;
}

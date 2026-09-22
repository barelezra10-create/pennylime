import Link from "next/link";
import {notFound} from "next/navigation";
import {getPortalApplicationId} from "@/lib/portal-auth";
import {prisma} from "@/lib/db";
import {ReimbursementSigning} from "./signing";
export const dynamic="force-dynamic";
export const metadata={title:"Your reimbursement agreement · PennyLime",robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string}>}){
 const applicationId=await getPortalApplicationId();if(!applicationId)return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">Sign in to review your reimbursement</h1><p className="my-4">After signing in, reopen the link in your email.</p><Link href="/portal/login" className="text-green-700">Sign in securely</Link></main>;
 const {id}=await params;const r=await prisma.reimbursement.findFirst({where:{id,applicationId,status:{not:"DRAFT"}},select:{id:true,status:true,agreementText:true,agreementHash:true,signedName:true,signedAt:true,amountCents:true,creditStatus:true}});if(!r)notFound();
 return <main className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-bold">PennyLime reimbursement agreement</h1><p className="my-3">Reimbursement amount: ${(r.amountCents/100).toFixed(2)}</p><ReimbursementSigning agreement={{id:r.id,status:r.status,text:r.agreementText,hash:r.agreementHash,signedName:r.signedName,signedAt:r.signedAt?.toISOString()??null,creditStatus:r.creditStatus}}/></main>;
}

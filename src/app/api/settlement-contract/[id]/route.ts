import {getServerSession} from "next-auth";
import {authOptions} from "@/lib/auth";
import {getPortalApplicationId} from "@/lib/portal-auth";
import {prisma} from "@/lib/db";
import {settlementPreviewHtml} from "@/lib/settlement-preview";
import {createHash} from "node:crypto";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const session=await getServerSession(authOptions);
 const applicationId=session?.user?.email?null:await getPortalApplicationId();
 if(!session?.user?.email&&!applicationId) return new Response("Unauthorized",{status:401});
 const {id}=await params;
 const row=await prisma.settlementAgreement.findFirst({where:{id,...(applicationId?{applicationId,status:{not:"DRAFT"}}:{})},select:{id:true,total:true,agreementText:true,authorizationText:true,scheduleJson:true,baseContractPdf:true,baseContractHash:true}});
 if(!row?.baseContractPdf) return new Response("Contract not found",{status:404});
 if(createHash("sha256").update(row.baseContractPdf).digest("hex")!==row.baseContractHash) return new Response("Contract integrity check failed",{status:409});
 if(new URL(_request.url).searchParams.get("view")==="settlement") return new Response(settlementPreviewHtml(row),{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"}});
 return new Response(new Uint8Array(row.baseContractPdf),{headers:{"Content-Type":"application/pdf","Content-Disposition":"inline; filename=original-advance-contract.pdf","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}

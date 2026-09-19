"use server";
import {getServerSession} from "next-auth";
import {authOptions} from "@/lib/auth";
import {prisma} from "@/lib/db";
import {sendEmail} from "@/lib/emails/send";
import {replyToInboundEmail} from "@/actions/inbox";
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export async function sendSupportAccountEmail(input:{applicationId:string;subject:string;body:string;replyId?:string}) {
 const session=await getServerSession(authOptions);
 if(!session?.user?.email) return {ok:false,error:"Not authenticated"};
 const subject=input.subject.trim(),body=input.body.trim();
 if(!subject || subject.length>200 || /[\r\n]/.test(subject) || !body || body.length>20000) return {ok:false,error:"Enter a subject (up to 200 characters) and message (up to 20,000 characters)."};
 const app=await prisma.application.findUnique({where:{id:input.applicationId},select:{id:true,email:true,contact:{select:{id:true}}}});
 if(!app?.email) return {ok:false,error:"Account email not found."};
 const contact = app.contact ?? await prisma.contact.findFirst({where:{email:{equals:app.email,mode:"insensitive"}},select:{id:true}});
 if(input.replyId){
   const inbound=await prisma.inboundEmail.findUnique({where:{id:input.replyId},select:{contactId:true,fromEmail:true}});
   if(!inbound || (inbound.contactId ? inbound.contactId!==contact?.id : inbound.fromEmail.toLowerCase()!==app.email.toLowerCase())) return {ok:false,error:"This email does not belong to this client."};
   return replyToInboundEmail(input.replyId,body);
 }
 // Persist the complete draft before delivery, so a successful send is never silently lost from history.
 const event=await prisma.collectionEvent.create({data:{applicationId:app.id,eventType:"EMAIL_PREPARED",performedBy:session.user.email,notes:JSON.stringify({subject,body,to:app.email})}});
 const result=await sendEmail({to:app.email,subject,html:`<p>${escape(body).replace(/\n/g,"<br>")}</p>`,contactId:contact?.id});
 await prisma.collectionEvent.update({where:{id:event.id},data:{eventType:result.success?"EMAIL_SENT":"EMAIL_FAILED"}}).catch(() => { console.error("Could not update support email delivery record", {eventId:event.id,accepted:result.success}); });
 return result.success?{ok:true}:{ok:false,error:"Email could not be sent. Please retry."};
}

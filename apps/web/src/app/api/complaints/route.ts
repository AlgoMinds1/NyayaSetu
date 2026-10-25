import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/api-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";
import { embed } from "@/lib/overlap/embeddings";

const Schema=z.object({institution_id:z.string().uuid(),category:z.enum(["financial","ragging","academic","infrastructure","other"]),description_text:z.string().trim().min(10).max(10000),description_language:z.string().min(2).max(16).default("en"),is_confidential:z.boolean().default(false),involves_management:z.boolean().default(false),urgency_status:z.enum(["untriaged","urgent"]).default("untriaged"),assigned_bureau:z.enum(["PGRC","RB"]).nullable().optional()});
export async function GET(req:NextRequest){const auth=await getApiSession();if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});if(!["pgrc_triage_officer","bureau_officer","regional_officer","bureau_head","competent_authority","ombudsperson","auditor","system_admin"].includes(auth.session.role))return NextResponse.json({error:"Forbidden"},{status:403});const p=req.nextUrl.searchParams;const page=Math.max(1,Number(p.get("page"))||1),limit=Math.min(100,Math.max(1,Number(p.get("limit"))||25));const ai=p.get("aicte_id"),region=p.get("region"),name=p.get("institution_name");const institutionFilter=!!(ai||region||name);let q=auth.supabase.from("complaints").select(`id,case_id,institution_id,category,status,assigned_bureau,receipt_date,expected_disposal_at,deadline_status,coordination_status,is_confidential,is_demo,institutions${institutionFilter?"!inner":""}(name,region,aicte_permanent_id),users!assigned_officer(display_name)`,{count:"exact"});for(const [key,col] of [["case_id","case_id"],["bureau","assigned_bureau"],["category","category"],["status","status"]] as const){const value=p.get(key);if(value)q=q.eq(col,value)}const from=p.get("date_from"),to=p.get("date_to");if(from)q=q.gte("receipt_date",from);if(to)q=q.lte("receipt_date",to);if(ai)q=q.eq("institutions.aicte_permanent_id",ai);if(region)q=q.eq("institutions.region",region);if(name)q=q.ilike("institutions.name",`%${name}%`);const {data,count,error}=await q.order("receipt_date",{ascending:false}).range((page-1)*limit,page*limit-1);if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({data:data??[],total:count??0,page,limit})}
export async function POST(req:NextRequest){
 const auth=await getApiSession();if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});const {session}=auth;
 if(!["student","pgrc_triage_officer"].includes(session.role))return NextResponse.json({error:"Forbidden"},{status:403});
 let body:unknown;try{body=await req.json()}catch{return NextResponse.json({error:"Invalid JSON"},{status:400})}const parsed=Schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:parsed.error.flatten()},{status:400});const input=parsed.data;
 const admin=createAdminClient();const {data:institution}=await admin.from("institutions").select("id,status").eq("id",input.institution_id).is("deleted_at",null).maybeSingle();if(!institution||institution.status!=="active")return NextResponse.json({error:"Choose an active institution."},{status:400});
 // B11: any affiliation claim may file; unverified cases stay at AICTE triage (students never set a bureau) and keep their urgency.
 let verificationStatus="pending";
 // Demo identities are explicitly marked by their reserved email domain. They
 // may file without institution proof; normal accounts retain the B11 claim check.
 if(session.role==="student"&&!auth.isDemo){const {data:affiliation,error:affErr}=await admin.from("affiliations").select("id,status").eq("user_id",session.userId).eq("institution_id",input.institution_id).order("claimed_at",{ascending:false}).limit(1).maybeSingle();if(affErr)return NextResponse.json({error:"Could not verify your affiliation. Please retry."},{status:500});if(!affiliation)return NextResponse.json({error:"An affiliation claim with this institution is required. Please add it in your affiliation settings first."},{status:403});verificationStatus=affiliation.status;}
 const description=input.description_text.trim();if(description.split(/[.!?]+/).filter(s=>s.trim()).length<2)return NextResponse.json({error:"Please provide at least two sentences."},{status:400});
 const caseIdPrefix=`NS-${new Date().toISOString().slice(0,10).replaceAll("-","")}-`;
 const complaintFields={institution_id:input.institution_id,submitted_by:session.userId,category:input.category,description_text:description,description_language:input.description_language,is_confidential:input.is_confidential,involves_management:input.involves_management,urgency_status:input.urgency_status,assigned_bureau:session.role==="pgrc_triage_officer"?input.assigned_bureau??null:null,status:"submitted",verification_status:verificationStatus,coordination_status:"no_overlap",deadline_status:"on_track",appeal_status:"not_applicable",is_demo:auth.isDemo};
 let complaint:null|({id:string;case_id:string}&Record<string,unknown>)=null;
 let insertError:{code?:string;message:string}|null=null;
 // Do not depend on the optional DB case-number trigger. Generate IDs in the
 // format used by the trigger, with a random suffix to avoid empty/default ID
 // collisions and concurrent sequence races.
 for(let attempt=0;attempt<5;attempt++){
  const caseId=`${caseIdPrefix}${crypto.randomUUID().replaceAll("-","").slice(0,10).toUpperCase()}`;
  const result=await admin.from("complaints").insert({...complaintFields,case_id:caseId}).select("*").single();
  if(!result.error){complaint=result.data as {id:string;case_id:string}&Record<string,unknown>;break;}
  insertError=result.error;
  if(result.error.code!=="23505"||!result.error.message.includes("complaints_case_id_key"))break;
 }
 if(!complaint)return NextResponse.json({error:insertError?.message??"Could not create case."},{status:insertError?.code==="23505"?409:500});
 const createdComplaint=complaint;
 async function rollbackCreatedComplaint() {
  const dependentTables = ["notifications", "case_events", "participants"] as const;
  for (const table of dependentTables) {
   const { error: cleanupError } = await admin.from(table).delete().eq("complaint_id", createdComplaint.id);
   if (cleanupError) console.error(`[complaints] rollback failed for ${table}:`, cleanupError.message);
  }
  const { error: cleanupError } = await admin.from("complaints").delete().eq("id", createdComplaint.id);
  if (cleanupError) console.error("[complaints] rollback failed for complaint:", cleanupError.message);
 }
 const now=new Date().toISOString();
 const [eventResult,participantResult]=await Promise.all([admin.from("case_events").insert({complaint_id:createdComplaint.id,event_type:"case_submitted",actor_id:session.userId,actor_role:session.role,new_state:{status:"submitted"},visibility:"complainant",event_at:now}),admin.from("participants").insert({complaint_id:createdComplaint.id,user_id:session.userId,role:"complainant",access_scope:"redacted_summary"})]);
 if(eventResult.error||participantResult.error){console.error("[complaints] required write failed:",eventResult.error?.message??participantResult.error?.message);await rollbackCreatedComplaint();return NextResponse.json({error:"The case could not be fully recorded. Check that the latest database migrations are applied, then retry."},{status:500})}
 try{await auditLog({actor_id:session.userId,action:"complaint.created",resource_type:"complaint",resource_id:createdComplaint.id,new_value:{case_id:createdComplaint.case_id,category:createdComplaint.category}})}catch(error){console.error("[complaints] audit write failed:",error instanceof Error?error.message:"unknown error");await rollbackCreatedComplaint();return NextResponse.json({error:"The case could not be recorded in the audit trail. Check the database migration state, then retry."},{status:500})}
 embed(description).then(vector=>admin.from("complaints").update({description_embedding:JSON.stringify(vector)}).eq("id",createdComplaint.id)).then(({error:saveError})=>{if(saveError)console.error("[overlap] could not store embedding:",saveError.message)}).catch(err=>console.error("[overlap] embedding failed:",err));
 if(session.role==="pgrc_triage_officer")fetch(`${req.nextUrl.origin}/api/overlap/detect`,{method:"POST",headers:{cookie:req.headers.get("cookie")??"","x-user-role":session.role}}).catch(()=>{});
 return NextResponse.json({complaint:createdComplaint},{status:201});
}

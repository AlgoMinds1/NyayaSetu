import Link from "next/link";
import {redirect} from "next/navigation";
import {getApiSession} from "@/lib/auth/api-session";
import {CaseList} from "@/components/phase4/case-list";
import LogoutButton from "@/components/auth/logout-button";
import {getTranslations} from "next-intl/server";
import {NotificationBell} from "@/components/notifications/bell";
import {LanguageSelect} from "@/components/i18n/language-select";
function ageDays(receiptDate:string){return Math.max(0,Math.floor((Date.now()-new Date(receiptDate).getTime())/86400000))}
export default async function CollegePortal(){
 const auth=await getApiSession();if(!auth||auth.session.role!=="college_management"||!auth.session.institutionId)redirect("/auth/login");const t=await getTranslations("nav");
 const {data}=await auth.supabase.from("complaints").select("id,case_id,category,status,receipt_date,last_action_at,deadline_status,urgency_status,expected_disposal_at,next_action_at").eq("institution_id",auth.session.institutionId).eq("involves_management",false).eq("is_confidential",false).in("status",["referred","awaiting_response","under_examination"]).order("receipt_date",{ascending:false});
 const rows=data??[];
 const awaiting=rows.filter(x=>x.status==="awaiting_response").length,near=rows.filter(x=>x.deadline_status==="nearing").length,overdue=rows.filter(x=>x.deadline_status==="overdue").length;
 const over30=rows.filter(x=>ageDays(x.receipt_date)>=30).length,over60=rows.filter(x=>ageDays(x.receipt_date)>=60).length,over90=rows.filter(x=>ageDays(x.receipt_date)>=90).length;
 return <main className="portal p4-page"><header><div><div className="brand">NyayaSetu · Institution</div><h1>Referred cases</h1></div><div className="p4-actions"><Link className="p4-linkbutton" href="/college/roster">{t("roster")}</Link><Link className="p4-linkbutton" href="/college/committee">{t("committee")}</Link><Link className="p4-linkbutton" href="/college/compliance">{t("compliance")}</Link><LanguageSelect/><NotificationBell/><LogoutButton/></div></header>
 <div className="p4-banner">Cases involving college management or marked confidential are never shown in this portal.</div>
 <div className="p4-tracks"><div className="p4-card"><small>Total referred</small><strong>{rows.length}</strong></div><div className="p4-card"><small>Awaiting response</small><strong>{awaiting}</strong></div><div className="p4-card"><small>Deadline nearing</small><strong>{near}</strong></div><div className="p4-card"><small>Overdue</small><strong>{overdue}</strong></div></div>
 <section className="p4-card"><h2>Compliance and ageing</h2><p className="muted">Age is measured from complaint receipt date. The internal institution deadline is shown on the case detail.</p><div className="p4-tracks"><div><small>30+ days</small><strong>{over30}</strong></div><div><small>60+ days</small><strong>{over60}</strong></div><div><small>90+ days</small><strong>{over90}</strong></div></div></section>
 <CaseList rows={rows} base="/college/cases"/></main>
}

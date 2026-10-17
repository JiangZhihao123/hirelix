import { sql } from "drizzle-orm";
import { load } from "cheerio";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { rows, WorkspaceError } from "./database";
import { emailAddress } from "./email-contract";
import { hasMailboxScope, mailboxSearchInput, mailboxReadInput, type MailboxConnection, type MailboxProvider } from "./mailbox-contract";

export function mailboxConfigured(provider: MailboxProvider) {
  return provider === "google" || !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}
export function mailboxReadEnabled(provider: MailboxProvider) {
  return process.env[provider === "google" ? "GMAIL_READ_ENABLED" : "MICROSOFT_MAIL_READ_ENABLED"] === "true";
}
export async function mailboxToken(userId: string, provider: MailboxProvider, capability: "read" | "send") {
  if (!mailboxConfigured(provider)) throw new WorkspaceError("This email provider has not been configured yet.", 409);
  if (capability === "read" && !mailboxReadEnabled(provider)) throw new WorkspaceError("Mailbox reading is not available yet. Provider verification and data-processing setup must be completed first.", 409);
  try {
    const token = await auth.api.getAccessToken({ body: { providerId: provider, userId } });
    if (!token.accessToken || !hasMailboxScope(token.scopes.join(" "), provider, capability)) throw new Error("scope");
    return token.accessToken;
  } catch { throw new WorkspaceError(`Reconnect ${provider === "google" ? "Google" : "Microsoft"} to grant ${capability} permission.`, 409); }
}
async function providerJson(url: string, token: string) {
  let response: Response;
  try { response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' }, signal: AbortSignal.timeout(20000), cache: "no-store" }); }
  catch { throw new WorkspaceError("The email provider could not be reached. Please try again.", 502); }
  if (!response.ok) throw new WorkspaceError(response.status === 401 || response.status === 403 ? "Email access was declined. Reconnect the mailbox or ask its administrator to allow access." : response.status === 429 ? "The email provider is temporarily rate limiting requests. Please try later." : "The email provider could not complete this request.", response.status === 404 ? 404 : 502);
  return response.json();
}
export async function mailboxIdentity(provider: MailboxProvider, token: string) {
  const profile = await providerJson(provider === "google" ? "https://www.googleapis.com/oauth2/v2/userinfo" : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", token);
  const address = provider === "google" ? profile.email : profile.mail || profile.userPrincipalName;
  if (!emailAddress.safeParse(address).success) throw new WorkspaceError("The connected provider did not return a usable mailbox address.", 409);
  return address as string;
}
export async function mailboxConnection(userId: string, provider: MailboxProvider): Promise<MailboxConnection> {
  const base: MailboxConnection = {provider, configured:mailboxConfigured(provider),connected:false,can_read:false,read_enabled:mailboxReadEnabled(provider),email:null};
  const [account] = await rows<{scope:string|null;available:boolean;requires_reconnect:boolean}>(sql`SELECT a.scope,(a."accessToken" IS NOT NULL) AS available, EXISTS(SELECT 1 FROM hirelix_private_email_deliveries e WHERE e.user_id::text=a."userId" AND coalesce(e.snapshot->>'provider','google')=${provider} AND e.updated_at>a."updatedAt" AND e.status='failed' AND e.error LIKE ${`${provider === "google" ? "Gmail" : "Microsoft"} declined sending.%`}) AS requires_reconnect FROM account a WHERE a."userId"=${userId} AND a."providerId"=${provider} ORDER BY a."updatedAt" DESC LIMIT 1`);
  if (!base.configured || !account?.available) return base;
  if (account.requires_reconnect) return {...base,error:"Reconnect this mailbox to renew sending access."};
  try {
    const token = await auth.api.getAccessToken({body:{providerId:provider,userId}});
    if (!token.accessToken) return base;
    return {...base,email:await mailboxIdentity(provider,token.accessToken),connected:hasMailboxScope(token.scopes.join(" "),provider,"send"),can_read:base.read_enabled && hasMailboxScope(token.scopes.join(" "),provider,"read")};
  } catch { return {...base,error:"Reconnect this mailbox to renew access."}; }
}
export async function mailboxConnections(userId: string) {
  return Promise.all((["google","microsoft"] as const).map(provider=>mailboxConnection(userId,provider)));
}
export async function disconnectMailbox(userId: string, provider: MailboxProvider) {
  await db.execute(sql`UPDATE account SET "accessToken"=NULL,"refreshToken"=NULL,"idToken"=NULL,scope=NULL,"accessTokenExpiresAt"=NULL,"updatedAt"=now() WHERE "userId"=${userId} AND "providerId"=${provider}`);
}
export type MailMessage = {id:string;thread_id:string;subject:string;from:string;to:string;date:string;body:string;truncated:boolean;headers:Record<string,string>;source_url:string;mailbox_labels?:string[];mailbox_folder?:string;sent_at?:string;is_draft?:boolean};
type GmailPart = {mimeType?:string;filename?:string;body?:{data?:string};parts?:GmailPart[];headers?:Array<{name:string;value:string}>};
export function gmailMessage(value: {id:string;threadId?:string;payload?:GmailPart;snippet?:string;labelIds?:string[]}): MailMessage {
  const headers = Object.fromEntries((value.payload?.headers || []).map(h=>[h.name.toLowerCase(),h.value]));
  function text(part: GmailPart, mime: string): string {
    if (part.filename) return "";
    if (part.mimeType === mime && part.body?.data) return Buffer.from(part.body.data,"base64url").toString("utf8");
    return (part.parts || []).map(p=>text(p,mime)).filter(Boolean).join("\n");
  }
  const plain = text(value.payload || {},"text/plain");
  const html = plain ? "" : text(value.payload || {},"text/html");
  const body = [plain || (html ? load(html).text() : value.snippet || ""), text(value.payload || {},"message/delivery-status")].filter(Boolean).join("\n");
  return {id:value.id,thread_id:value.threadId || value.id,subject:headers.subject || "",from:headers.from || "",to:headers.to || "",date:headers.date || "",body:body.slice(0,30000),truncated:body.length>30000,headers,mailbox_labels:value.labelIds,source_url:`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(value.threadId || value.id)}`};
}
export async function searchMailbox(userId: string, value: unknown) {
  const input=mailboxSearchInput.parse(value), token=await mailboxToken(userId,input.provider,"read");
  if (input.provider === "google") {
    const result=await providerJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({q:input.query,maxResults:String(input.limit)})}`,token);
    const messages=[];
    for (const item of result.messages || []) {
      const message = gmailMessage(await providerJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,token));
      messages.push({id:message.id,thread_id:message.thread_id,subject:message.subject,from:message.from,to:message.to,date:message.date});
    }
    return {provider:input.provider,messages,more_available:!!result.nextPageToken,coverage:"Matching messages only; absence is not proof of delivery or no reply."};
  }
  const result=await providerJson(`https://graph.microsoft.com/v1.0/me/messages?${new URLSearchParams({"$search":JSON.stringify(input.query),"$top":String(input.limit),"$select":"id,conversationId,subject,from,toRecipients,receivedDateTime"})}`,token);
  return {provider:input.provider,messages:result.value || [],more_available:!!result["@odata.nextLink"],coverage:"Search may lag newly received mail. Absence is not proof of delivery or no reply."};
}
export async function readMailboxMessage(userId: string, value: unknown) {
  const input=mailboxReadInput.parse(value),token=await mailboxToken(userId,input.provider,"read");
  if (input.provider === "google") {
    const message = gmailMessage(await providerJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(input.message_id)}?format=full`,token));
    const email = await mailboxIdentity("google",token);
    return {...message,source_url:`https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${encodeURIComponent(message.thread_id)}`};
  }
  const message=await providerJson(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(input.message_id)}?$select=id,conversationId,subject,from,toRecipients,receivedDateTime,sentDateTime,isDraft,parentFolderId,body,internetMessageHeaders,webLink`,token);
  const folder = message.parentFolderId ? await providerJson(`https://graph.microsoft.com/v1.0/me/mailFolders/${encodeURIComponent(message.parentFolderId)}?$select=displayName`,token) : null;
  const body=message.body?.contentType?.toLowerCase()==="html" ? load(message.body.content || "").text() : message.body?.content || "";
  return {id:message.id,thread_id:message.conversationId,subject:message.subject,from:message.from?.emailAddress?.address || "",to:(message.toRecipients || []).map((r:{emailAddress:{address:string}})=>r.emailAddress.address).join(", "),date:message.receivedDateTime,sent_at:message.sentDateTime,is_draft:message.isDraft,mailbox_folder:folder?.displayName,body:body.slice(0,30000),truncated:body.length>30000,headers:Object.fromEntries((message.internetMessageHeaders || []).map((h:{name:string;value:string})=>[h.name.toLowerCase(),h.value])),source_url:message.webLink} satisfies MailMessage;
}

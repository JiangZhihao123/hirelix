import { sql } from "drizzle-orm";
import { load } from "cheerio";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { rows, WorkspaceError } from "./database";
import { emailAddress } from "./email-contract";
import { hasMailboxScope, mailboxReadUnavailableReason, mailboxSearchInput, mailboxReadInput, mailboxAttachmentInput, type MailboxConnection, type MailboxProvider, type MailAttachment } from "./mailbox-contract";

export function mailboxConfigured(provider: MailboxProvider) {
  return provider === "google" || !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}
export function mailboxReadEnabled(provider: MailboxProvider) {
  return process.env[provider === "google" ? "GMAIL_READ_ENABLED" : "MICROSOFT_MAIL_READ_ENABLED"] === "true";
}
function mailboxAuthorizationMissing(error: unknown) {
  const code = (error as {body?:{code?:string}} | null)?.body?.code;
  return ["ACCOUNT_NOT_FOUND", "REFRESH_TOKEN_NOT_FOUND", "ACCESS_TOKEN_NOT_FOUND", "INVALID_TOKEN"].includes(code || "");
}
export async function mailboxToken(userId: string, provider: MailboxProvider, capability: "read" | "send") {
  if (!mailboxConfigured(provider)) throw new WorkspaceError("This email provider has not been configured yet.", 409);
  if (capability === "read" && !mailboxReadEnabled(provider)) throw new WorkspaceError(mailboxReadUnavailableReason(provider), 409);
  const reconnect = () => new WorkspaceError(`Reconnect ${provider === "google" ? "Google" : "Microsoft"} to grant ${capability} permission.`, 409);
  let token: Awaited<ReturnType<typeof auth.api.getAccessToken>>;
  try {
    token = await auth.api.getAccessToken({ body: { providerId: provider, userId } });
  } catch (error) {
    if (mailboxAuthorizationMissing(error)) throw reconnect();
    throw new WorkspaceError("Could not verify mailbox access. Please try again.", 502);
  }
  if (!token.accessToken || !hasMailboxScope(token.scopes.join(" "), provider, capability)) throw reconnect();
  return token.accessToken;
}
async function providerJson(url: string, token: string) {
  let response: Response;
  try { response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' }, signal: AbortSignal.timeout(20000), cache: "no-store" }); }
  catch { throw new WorkspaceError("The email provider could not be reached. Please try again.", 502); }
  if (!response.ok) throw new WorkspaceError(response.status === 401 || response.status === 403 ? "Email access was declined. Reconnect the mailbox or ask its administrator to allow access." : response.status === 429 ? "The email provider is temporarily rate limiting requests. Please try later." : "The email provider could not complete this request.", [401,403,404].includes(response.status) ? response.status : 502);
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
  if (!base.read_enabled) base.read_unavailable_reason = mailboxReadUnavailableReason(provider);
  const [account] = await rows<{scope:string|null;available:boolean;requires_reconnect:boolean;mailboxEmail:string|null}>(sql`SELECT a.scope,a."mailboxEmail",(a."accessToken" IS NOT NULL) AS available, EXISTS(SELECT 1 FROM hirelix_private_email_deliveries e WHERE e.user_id::text=a."userId" AND coalesce(e.snapshot->>'provider','google')=${provider} AND e.updated_at>a."updatedAt" AND e.status='failed' AND e.error LIKE ${`${provider === "google" ? "Gmail" : "Microsoft"} declined sending.%`}) AS requires_reconnect FROM account a WHERE a."userId"=${userId} AND a."providerId"=${provider} ORDER BY a."updatedAt" DESC LIMIT 1`);
  base.email = account?.mailboxEmail || null;
  base.granted_read = hasMailboxScope(account?.scope,provider,"read");
  if (!base.configured || !account?.available) return base;
  if (account.requires_reconnect) return {...base,needs_reconnect:true,error:"Reconnect this mailbox to renew sending access."};
  try {
    const token = await auth.api.getAccessToken({body:{providerId:provider,userId}});
    if (!token.accessToken) return {...base,needs_reconnect:true,error:"Reconnect this mailbox to renew access."};
    const email = await mailboxIdentity(provider,token.accessToken);
    if (email !== base.email) await db.execute(sql`UPDATE account SET "mailboxEmail"=${email} WHERE "userId"=${userId} AND "providerId"=${provider}`);
    return {...base,email,connected:hasMailboxScope(token.scopes.join(" "),provider,"send"),can_read:base.read_enabled && hasMailboxScope(token.scopes.join(" "),provider,"read")};
  } catch (error) {
    if (error instanceof WorkspaceError) return {...base,needs_reconnect:[401,403].includes(error.status),error:error.message};
    if (mailboxAuthorizationMissing(error)) return {...base,needs_reconnect:true,error:"Reconnect this mailbox to renew access."};
    return {...base,error:"Could not verify mailbox access. Try again; reconnect if the problem persists."};
  }
}
export async function mailboxConnections(userId: string) {
  return Promise.all((["google","microsoft"] as const).map(provider=>mailboxConnection(userId,provider)));
}
export async function defaultMailboxProvider(userId: string): Promise<MailboxProvider | null> {
  const [setting] = await rows<{provider:MailboxProvider|null}>(sql`SELECT default_mailbox_provider AS provider FROM hirelix_user_settings WHERE user_id=${userId}::uuid`);
  return setting?.provider || null;
}
export async function setDefaultMailboxProvider(userId: string, provider: MailboxProvider) {
  const connection = await mailboxConnection(userId,provider);
  if (!connection.connected) throw new WorkspaceError("Connect this mailbox before choosing it as your default sender.",409);
  await db.execute(sql`INSERT INTO hirelix_user_settings (user_id,default_mailbox_provider) VALUES (${userId}::uuid,${provider}) ON CONFLICT (user_id) DO UPDATE SET default_mailbox_provider=${provider},updated_at=now()`);
}
export async function disconnectMailbox(userId: string, provider: MailboxProvider) {
  await db.execute(sql`UPDATE account SET "accessToken"=NULL,"refreshToken"=NULL,"idToken"=NULL,"mailboxEmail"=NULL,scope=NULL,"accessTokenExpiresAt"=NULL,"updatedAt"=now() WHERE "userId"=${userId} AND "providerId"=${provider}`);
}
export type MailMessage = {id:string;thread_id:string;subject:string;from:string;to:string;date:string;body:string;truncated:boolean;headers:Record<string,string>;source_url:string;attachments?:MailAttachment[];reply_to?:string[];mailbox_labels?:string[];mailbox_folder?:string;sent_at?:string;is_draft?:boolean};
function evidenceHeaders(entries: Array<{name:string;value:string}>) {
  const allowed = new Set(["from","to","cc","reply-to","date","subject","message-id","in-reply-to","references","return-path","authentication-results","auto-submitted","content-type"]);
  return Object.fromEntries(entries.filter(h=>allowed.has(h.name.toLowerCase())).map(h=>[h.name.toLowerCase(),h.value.slice(0,4000)]));
}
type GmailPart = {mimeType?:string;filename?:string;body?:{data?:string};parts?:GmailPart[];headers?:Array<{name:string;value:string}>};
export function gmailMessage(value: {id:string;threadId?:string;payload?:GmailPart;snippet?:string;labelIds?:string[]}): MailMessage {
  const headers = evidenceHeaders(value.payload?.headers || []);
  function text(part: GmailPart, mime: string): string {
    if (part.filename) return "";
    if (part.mimeType === mime && part.body?.data) {
      const bytes = Buffer.from(part.body.data,"base64url");
      // Gmail may normalize part data to UTF-8 while preserving its original charset header.
      try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { /* Decode original bytes below. */ }
      const contentType = part.headers?.find(h=>h.name.toLowerCase()==="content-type")?.value || "";
      const charset = /charset\s*=\s*["']?([^\s;"']+)/i.exec(contentType)?.[1] || "utf-8";
      try { return new TextDecoder(charset).decode(bytes); }
      catch { throw new WorkspaceError(`This email uses an unsupported text encoding (${charset}). Open the original message to read it.`, 422); }
    }
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
export async function readMailboxMessage(userId: string, value: unknown): Promise<MailMessage> {
  const input=mailboxReadInput.parse(value),token=await mailboxToken(userId,input.provider,"read");
  if (input.provider === "google") {
    const message = gmailMessage(await providerJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(input.message_id)}?format=full`,token));
    const email = await mailboxIdentity("google",token);
    return {...message,source_url:`https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${encodeURIComponent(message.thread_id)}`};
  }
  const message=await providerJson(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(input.message_id)}?$select=id,conversationId,subject,from,toRecipients,receivedDateTime,sentDateTime,isDraft,parentFolderId,body,internetMessageHeaders,webLink,hasAttachments,replyTo`,token);
  const folder = message.parentFolderId ? await providerJson(`https://graph.microsoft.com/v1.0/me/mailFolders/${encodeURIComponent(message.parentFolderId)}?$select=displayName`,token) : null;
  const attachmentPage = message.hasAttachments ? await providerJson(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(input.message_id)}/attachments?$select=id,name,size,contentType,isInline&$top=50`, token) : null;
  const attachments: MailAttachment[] = (attachmentPage?.value || []).map((a: {id:string;name:string;size:number;contentType:string;isInline:boolean}) => ({id:a.id,name:a.name,size:a.size,content_type:a.contentType,inline:a.isInline}));
  if (attachmentPage?.["@odata.nextLink"]) throw new WorkspaceError("This message has more than 50 attachments. Open the original mailbox to review all attachments.",422);
  const body=message.body?.contentType?.toLowerCase()==="html" ? load(message.body.content || "").text() : message.body?.content || "";
  return {attachments,reply_to:(message.replyTo || []).map((r:{emailAddress:{address:string}})=>r.emailAddress.address),id:message.id,thread_id:message.conversationId,subject:message.subject,from:message.from?.emailAddress?.address || "",to:(message.toRecipients || []).map((r:{emailAddress:{address:string}})=>r.emailAddress.address).join(", "),date:message.receivedDateTime,sent_at:message.sentDateTime,is_draft:message.isDraft,mailbox_folder:folder?.displayName,body:body.slice(0,30000),truncated:body.length>30000,headers:evidenceHeaders(message.internetMessageHeaders || []),source_url:message.webLink} satisfies MailMessage;
}


// Filter by provider thread identity, never by a potentially ambiguous subject.
export async function readMailboxThread(userId: string, value: unknown): Promise<{provider:MailboxProvider;messages:MailMessage[];more_available:boolean}> {
  const input = mailboxReadInput.parse(value);
  const selected = await readMailboxMessage(userId, input);
  const token = await mailboxToken(userId, input.provider, "read");
  if (input.provider === "google") {
    const thread = await providerJson(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(selected.thread_id)}?format=full`, token);
    const messages = (thread.messages || []).slice(0,20).map(gmailMessage);
    return {provider:input.provider,messages,more_available:(thread.messages || []).length>20};
  }
  const params = new URLSearchParams({"$filter":`conversationId eq '${selected.thread_id.replaceAll("'", "''")}'`,"$select":"id","$top":"20"});
  const page = await providerJson(`https://graph.microsoft.com/v1.0/me/messages?${params}`,token);
  const messages: MailMessage[] = [];
  for (const item of page.value || []) messages.push(item.id === selected.id ? selected : await readMailboxMessage(userId,{...input,message_id:item.id}));
  messages.sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime());
  return {provider:input.provider,messages,more_available:!!page["@odata.nextLink"]};
}

export async function readMailboxAttachment(userId: string, value: unknown) {
  const input = mailboxAttachmentInput.parse(value);
  if (input.provider !== "microsoft") throw new WorkspaceError("Reading Gmail attachments is not available yet.",409);
  const message = await readMailboxMessage(userId,input);
  const matches = message.attachments?.filter(a=>(!input.attachment_id || a.id===input.attachment_id) && (!input.attachment_name || a.name===input.attachment_name)) || [];
  if(matches.length>1) throw new WorkspaceError("Multiple attachments have this name. Use the exact attachment ID from the selected email.",409);
  const selected = matches[0];
  if (!selected) throw new WorkspaceError("This attachment does not belong to the selected message.",404);
  if (selected.size > 4*1024*1024) throw new WorkspaceError("This attachment exceeds the 4 MB reading limit.",422);
  const token = await mailboxToken(userId,input.provider,"read");
  const item = await providerJson(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(input.message_id)}/attachments/${encodeURIComponent(selected.id)}`,token);
  if (item["@odata.type"] !== "#microsoft.graph.fileAttachment" || typeof item.contentBytes !== "string") throw new WorkspaceError("This attachment type must be opened in the original mailbox.",422);
  const bytes = Buffer.from(item.contentBytes,"base64");
  if (bytes.length>4*1024*1024) throw new WorkspaceError("This attachment exceeds the 4 MB reading limit.",422);
  return {name:selected.name,bytes,source_url:message.source_url,from:message.from,date:message.date};
}

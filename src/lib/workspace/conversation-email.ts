import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { json, owned, rows, WorkspaceError, type Runner } from "./database";
import { clientDocument } from "./document-sharing";
import { gmailConnection, sendConversationEmail, effectiveDeliveryStatus, type Receipt } from "./gmail";
import { emailAddress, emailSnapshotSchema, type ConversationEmail, type EmailPlan } from "./email-contract";
import { quotedAuthorization } from "./assistant-work";
import type { Conversation, Deliverable, Job, Message } from "./types";
import type { PreparedJob } from "./jobs";

export async function supersedeEmailReviews(userId: string, conversationId: string, tx: Runner) {
  await tx.execute(sql`UPDATE hirelix_agent_messages SET metadata=jsonb_set(metadata,'{email,status}','"superseded"'::jsonb) WHERE user_id=${userId}::uuid AND conversation_id=${conversationId}::uuid AND metadata->'email'->>'status'='review'`);
}
export async function hydrateEmailReceipts(userId: string, messages: Message[]) {
  const keys = messages.flatMap(message => {
    const email = message.metadata.email as ConversationEmail | undefined;
    return email ? [email.request_key] : [];
  });
  if (!keys.length) return;
  const receipts = await rows<Receipt & {request_key: string}>(sql`SELECT * FROM hirelix_private_email_deliveries WHERE user_id=${userId}::uuid AND request_key IN (${sql.join(keys.map(key => sql`${key}`),sql`,`)})`);
  for (const message of messages) {
    const email = message.metadata.email as ConversationEmail | undefined;
    const receipt = email && receipts.find(item => item.request_key === email.request_key);
    if (email && receipt) message.metadata.email = {...email, status: effectiveDeliveryStatus(receipt), receipt: receipt.id, error: receipt.error || undefined};
  }
}
export async function prepareEmailReply({job, conversation, question, messages, document, plan, locale}: {
  job: Job; conversation: Conversation; question: Message; messages: Message[];
  document: Deliverable | null; plan: EmailPlan; locale: string;
}): Promise<PreparedJob> {
  const zh = locale === "zh";
  const say = (en: string, cn: string) => zh ? cn : en;
  const connection = await gmailConnection(job.user_id);
  const latest = [...messages].reverse().find(message => message.role === "assistant" && message.metadata.email);
  const pending = latest?.metadata.email as ConversationEmail | undefined;
  const explicit = (job.payload.request as {email_confirmation_message_id?:string})?.email_confirmation_message_id;
  let email: ConversationEmail | undefined, update: ConversationEmail | undefined;
  let answer = "";
  if (plan.intent === "status") {
    answer = connection.connected
      ? say(`Gmail is connected as ${connection.email}. I can prepare an email here and send it after you confirm the recipient, content and attachments.`, `Gmail 已连接：${connection.email}。我可以在这里准备邮件，等你确认收件人、正文和附件后实际发送。`)
      : say("Gmail is not connected for sending. Connect it here, then I can prepare an email for your confirmation.", "Gmail 尚未连接发信权限。请在这里连接，之后我可以准备邮件供你确认发送。");
  } else if (!explicit && !quotedAuthorization(question.content, plan.authorization_quote)) {
    answer = say("Please tell me directly which email you want to prepare, send or cancel.", "请直接告诉我要准备、发送或取消哪封邮件。");
  } else if (plan.intent === "cancel") {
    if (pending?.status === "review") {
      update = {...pending,status:"cancelled"};
      answer = say("The email request is cancelled. No email was sent by this action.", "已取消这次邮件请求，本次操作没有发送邮件。");
    } else answer = pending && ["sent","sending","unknown"].includes(pending.status)
      ? say("This email has already been submitted to Gmail and cannot be recalled here. Check Gmail Sent for its status.","这封邮件已提交给 Gmail，无法在这里撤回。请查看 Gmail 已发送邮件确认状态。")
      : say("There is no pending email to cancel.","当前没有待发送的邮件需要取消。");
  } else if (plan.intent === "confirm") {
    if (!latest || !pending || (explicit && explicit !== latest.id)) throw new WorkspaceError("Choose the latest email preview in this conversation.",409);
    if (["sent","unknown","sending"].includes(pending.status)) {
      update = pending;
    } else if (pending.status !== "review") {
      answer = say("This preview is no longer valid. Ask me to prepare the email again.", "这份预览已失效，请让我重新准备邮件。");
    } else {
      // Text confirmation must not silently change any preview field.
      if ((plan.to && plan.to !== pending.snapshot.to) || (plan.subject && plan.subject !== pending.snapshot.title) || (plan.body && plan.body !== pending.snapshot.content)) throw new WorkspaceError("The email changed. Ask me to prepare a new preview before sending.",409);
      try {
        const result = await sendConversationEmail(job.user_id,pending.snapshot,pending.request_key,async tx => {
          // Serialize with stop/retry, then with new messages and review cancellation.
          const active = await owned<Job>(job.user_id,"job",job.id,tx,true);
          if (active.status !== "running" || active.lease_token !== job.lease_token || !active.lease_until || new Date(active.lease_until).getTime() <= Date.now()) throw new WorkspaceError("This sending request was stopped or replaced.",409);
          await owned(job.user_id,"conversation",conversation.id,tx,true);
          const [latestUser] = await rows<{id:string}>(sql`SELECT id FROM hirelix_agent_messages WHERE user_id=${job.user_id}::uuid AND conversation_id=${conversation.id}::uuid AND role='user' ORDER BY created_at DESC,id DESC LIMIT 1`,tx);
          if (latestUser?.id !== question.id) throw new WorkspaceError("A newer message replaced this email confirmation.",409);
          const [current] = await rows<Message>(sql`SELECT * FROM hirelix_agent_messages WHERE user_id=${job.user_id}::uuid AND conversation_id=${conversation.id}::uuid AND id=${latest.id}::uuid FOR UPDATE`,tx);
          const reviewed = current?.metadata.email as ConversationEmail | undefined;
          if (!reviewed || reviewed.status !== "review" || JSON.stringify(reviewed.snapshot) !== JSON.stringify(pending.snapshot)) throw new WorkspaceError("This email preview is no longer available. Review it again.",409);
          const [account] = await rows<{scope:string|null;email:string;available:boolean}>(sql`SELECT a.scope,u.email,(a."accessToken" IS NOT NULL) AS available FROM account a JOIN "user" u ON u.id=a."userId" WHERE a."userId"=${job.user_id} AND a."providerId"='google' ORDER BY a."updatedAt" DESC LIMIT 1 FOR UPDATE OF a`,tx);
          if (!account?.available || account.email !== pending.snapshot.from || !account.scope?.split(/[ ,]+/).includes("https://www.googleapis.com/auth/gmail.send")) throw new WorkspaceError("Reconnect the reviewed Gmail account before sending",409);
          await tx.execute(sql`UPDATE hirelix_agent_messages SET metadata=jsonb_set(metadata,'{email,status}','"sending"'::jsonb) WHERE id=${latest.id}::uuid AND user_id=${job.user_id}::uuid`);
        });
        update = {...pending,status:result.status as ConversationEmail["status"],receipt:result.receipt};
      } catch (error) {
        if (!(error instanceof WorkspaceError)) throw error;
        // A validation failure is safe to display; no automatic second send.
        update = {...pending,status:"failed",error:error.message};
        answer = say(`Email was not sent: ${error.message}`, `邮件未发送：${error.message}`);
      }
    }
    if (update && !answer) answer = update.status === "sent"
      ? pending?.status === "sent" ? say(`This email was already sent to ${update.snapshot.to}. I did not send it again.`, `这封邮件此前已发送给 ${update.snapshot.to}，本次没有重复发送。`) : say(`Sent through Gmail to ${update.snapshot.to}.`, `已通过 Gmail 发送给 ${update.snapshot.to}。`)
      : update.status === "failed" ? say("Gmail rejected this email. It was not sent. Check the connection and ask for a new preview.","Gmail 拒绝了这封邮件，未发送。请检查连接后重新准备预览。")
      : say("Gmail has not confirmed this send. Check Gmail Sent before trying again; I will not automatically resend it.","Gmail 尚未确认发送结果。请先查看 Gmail 已发送邮件，我不会自动重发。");
  } else {
    const to = plan.to || (pending?.status === "review" ? pending.snapshot.to : null);
    if (!to || !emailAddress.safeParse(to).success) answer = say("What exact email address should I send this to?", "请提供准确的收件人邮箱。");
    else if (!connection.email || !emailAddress.safeParse(connection.email).success) answer = say("Connect your Google account before preparing the sender details.","请先连接 Google 账号，以确认发件人。");
    else {
      try {
        if (plan.use_document && !document) throw new WorkspaceError("Open the saved document in this conversation first.");
        const reviewed = plan.use_document && document ? clientDocument(document) : null;
        const title = reviewed?.title || plan.subject;
        const content = reviewed?.content || plan.body;
        if (!title || !content) answer = say("What subject and message should this email contain?", "这封邮件的主题和正文是什么？");
        else {
          email = {status:"review",request_key:randomUUID(),snapshot:emailSnapshotSchema.parse({from:connection.email,to,title,content,files:reviewed?.files || [],document_id:reviewed ? document!.id : null,document_version:reviewed ? document!.version : null})};
          answer = say("Review the recipient, subject, message and attachments below. Confirm send when they are correct; nothing has been sent yet.","请确认下方收件人、主题、正文和附件。确认无误后点击发送，或在对话中回复确认发送；目前尚未发送。");
        }
      } catch(error) {
        if (!(error instanceof WorkspaceError) && !(error instanceof z.ZodError)) throw error;
        answer = say("I could not prepare this email: ","无法准备这封邮件：") + error.message;
      }
    }
  }
  return {result:{conversation_id:conversation.id},apply:async tx => {
    await owned(job.user_id,"conversation",conversation.id,tx,true);
    if (plan.intent === "prepare" || plan.intent === "cancel") await supersedeEmailReviews(job.user_id,conversation.id,tx);
    if (update && latest) await tx.execute(sql`UPDATE hirelix_agent_messages SET metadata=jsonb_set(metadata,'{email}',${json(update)}) WHERE user_id=${job.user_id}::uuid AND id=${latest.id}::uuid`);
    const [saved] = await rows<Message>(sql`INSERT INTO hirelix_agent_messages(user_id,conversation_id,role,content,metadata) VALUES(${job.user_id}::uuid,${conversation.id}::uuid,'assistant',${answer},${json({...((plan.intent === "status" || (!email && !update && !connection.connected)) ? {gmail:connection} : {}),...(email ? {email} : {}),...(update ? {email_result:{preview_message_id:latest!.id,...update}} : {})})}) RETURNING *`,tx);
    await tx.execute(sql`UPDATE hirelix_private_conversations SET updated_at=now() WHERE user_id=${job.user_id}::uuid AND id=${conversation.id}::uuid`);
    return {message_id:saved.id};
  }};
}

export async function cancelConversationEmail(userId:string, conversationId:string, messageId:string) {
  const {db} = await import("@/db/client");
  return db.transaction(async tx => {
    await owned(userId,"conversation",conversationId,tx,true);
    const [message] = await rows<Message>(sql`SELECT * FROM hirelix_agent_messages WHERE user_id=${userId}::uuid AND conversation_id=${conversationId}::uuid AND id=${messageId}::uuid FOR UPDATE`,tx);
    const email = message?.metadata.email as ConversationEmail | undefined;
    if (!email) throw new WorkspaceError("Email preview not found",404);
    if (email.status === "cancelled") return {ok:true};
    if (email.status !== "review") throw new WorkspaceError("This email is already being sent or no longer available.",409);
    await tx.execute(sql`UPDATE hirelix_agent_messages SET metadata=jsonb_set(metadata,'{email,status}','"cancelled"'::jsonb) WHERE user_id=${userId}::uuid AND id=${messageId}::uuid`);
    return {ok:true};
  });
}

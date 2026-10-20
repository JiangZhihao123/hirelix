"use client";
import {authClient} from '@/lib/auth-client';
import {mailboxAuthorizationURL} from '@/lib/workspace/mailbox-contract';
export async function connectGmail(callbackURL: string) {
  // Better Auth rejects fragments in relative callback paths. Keep the anchor
  // using an absolute URL, constrained to the same site as this page.
  const callback = new URL(callbackURL, window.location.origin);
  if (callback.origin !== window.location.origin) throw new Error('Return to a Hirelix page after connecting Gmail');
  const result = await authClient.linkSocial({provider:'google',scopes:['https://www.googleapis.com/auth/gmail.send'],disableRedirect:true,callbackURL:callback.href,errorCallbackURL:callback.href});
  if(result.error || !result.data?.url) throw new Error(result.error?.message || 'Could not connect Gmail');
  window.location.assign(mailboxAuthorizationURL(result.data.url,'google',false));
}

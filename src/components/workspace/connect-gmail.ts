"use client";
import {authClient} from '@/lib/auth-client';
export async function connectGmail(callbackURL: string) {
  const result = await authClient.linkSocial({provider:'google',scopes:['https://www.googleapis.com/auth/gmail.send'],disableRedirect:true,callbackURL,errorCallbackURL:callbackURL});
  if(result.error || !result.data?.url) throw new Error(result.error?.message || 'Could not connect Gmail');
  const url=new URL(result.data.url);url.searchParams.set('prompt','consent');window.location.assign(url.href);
}

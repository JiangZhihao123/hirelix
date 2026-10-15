import {downloadSharedPackage} from '@/lib/workspace/recommendation-package';
import {WorkspaceError} from '@/lib/workspace/database';
export const runtime = 'nodejs';
export async function GET(_req:Request,{params}:{params:Promise<{token:string}>}) {
  try { return await downloadSharedPackage((await params).token); }
  catch(error) {
    if(error instanceof WorkspaceError) return new Response(error.message,{status:error.status,headers:{'Cache-Control':'no-store'}});
    throw error;
  }
}

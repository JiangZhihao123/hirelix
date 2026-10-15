import {NextRequest} from 'next/server';
import {z} from 'zod';
import {workspaceApi} from '@/lib/workspace/http';
import {downloadRecommendationPackage} from '@/lib/workspace/recommendation-package';
export const runtime = 'nodejs';
export function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  return workspaceApi(req,async user=>downloadRecommendationPackage(user.id,z.uuid().parse((await params).id),z.coerce.number().int().positive().parse(req.nextUrl.searchParams.get('version'))));
}

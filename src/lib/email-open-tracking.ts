const EMAIL_PIXEL_ID_PATTERN =
  /^(?:20\d{2}-\d{2}-\d{2}-(?:batch\d+|followup|pixeltest)-[a-z0-9-]+|[a-z][a-z0-9_-]+_20\d{6,8})$/i;

const IMAGE_PROXY_PATTERN = /googleimageproxy|googleusercontent|ggpht/i;
const SECURITY_SCANNER_PATTERN =
  /proofpoint|mimecast|barracuda|virustotal|urlscan|linkexpand|crawler|spider|bot|scanner|security/i;
const AUTOMATION_PATTERN = /curl|wget|python-requests|go-http-client|postman|insomnia/i;

export type EmailImageRequestClass =
  | "image_proxy"
  | "security_scanner"
  | "automated_or_unknown"
  | "mail_client_or_proxy";

export function isValidEmailPixelId(value: string) {
  return EMAIL_PIXEL_ID_PATTERN.test(value);
}

export function classifyEmailImageRequest(userAgent: string | null, ipAddress: string | null = null): EmailImageRequestClass {
  if (!userAgent || AUTOMATION_PATTERN.test(userAgent)) return "automated_or_unknown";
  if (ipAddress && /^72\.14\./.test(ipAddress)) return "image_proxy";
  if (IMAGE_PROXY_PATTERN.test(userAgent)) return "image_proxy";
  if (SECURITY_SCANNER_PATTERN.test(userAgent)) return "security_scanner";
  return "mail_client_or_proxy";
}

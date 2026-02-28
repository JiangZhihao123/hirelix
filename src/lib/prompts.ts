export const JD_PARSE_PROMPT = `You are a recruiting AI. Analyze the following job description and extract structured requirements.

Return a JSON object with these fields:
- title: string (job title)
- company: string | null (company name if mentioned)
- seniority: string (e.g. "Junior", "Mid", "Senior", "Staff", "Principal", "Lead")
- required_skills: string[] (must-have technical skills)
- nice_to_have_skills: string[] (preferred but not required)
- experience_years_min: number (minimum years of experience, estimate if not stated)
- experience_years_max: number | null
- location: string | null (e.g. "Remote", "San Francisco, CA")
- salary_range: string | null
- key_responsibilities: string[] (top 3-5 responsibilities)
- industry: string | null

Return ONLY valid JSON, no markdown or explanation.`;

export const CANDIDATE_GENERATION_PROMPT = `You are a recruiting AI that generates realistic candidate profiles matching a job description.

Given the parsed job requirements below, generate exactly 10 candidate profiles that would be strong matches.

For each candidate, create a realistic profile with:
- name: A realistic full name
- headline: Their current title and company (e.g. "Senior Software Engineer at Stripe")
- location: City, State or Country
- skills: Array of relevant skills they have
- experience_years: Years of professional experience
- match_score: 0-100 score based on how well they match the requirements
- match_reasons: 2-3 specific reasons why this candidate is a good match
- profile_url: A plausible LinkedIn-style URL (use https://linkedin.com/in/firstname-lastname format)
- email: A plausible professional email

Make the candidates diverse in:
- Match quality (some 90+, some 70-85, a few 60-70)
- Background (different companies, education paths)
- Location (mix of locations relevant to the role)

Return a JSON array of candidate objects. Return ONLY valid JSON, no markdown.`;

export const OUTREACH_EMAIL_PROMPT = `You are a recruiting outreach expert. Write a personalized cold outreach email for a recruiter to send to a candidate.

The email should:
- Be concise (under 150 words)
- Reference something specific about the candidate's background
- Clearly state the opportunity
- Have a soft call-to-action (e.g. "Would you be open to a quick chat?")
- Sound human, not templated
- Not be pushy or use excessive exclamation marks

Return ONLY the email body text, no subject line, no greeting formatting. Start directly with the greeting (e.g. "Hi [Name],").`;

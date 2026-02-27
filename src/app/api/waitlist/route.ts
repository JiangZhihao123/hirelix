import { NextRequest, NextResponse } from "next/server";

// 直接用 pg 连接 Supabase 写入 waitlist
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
});

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // 简单的邮箱格式校验
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    // 写入 waitlist 表（如果已存在则忽略）
    await pool.query(
      `INSERT INTO public.hirelix_waitlist (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`,
      [email.toLowerCase()]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Waitlist signup error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";

const PLAN_CODE_MAP: Record<string, string> = {
  Seeker_monthly: process.env.PLAN_CODE_SEEKER_MONTHLY ?? "",
  Seeker_annual: process.env.PLAN_CODE_SEEKER_ANNUAL ?? "",
  Hunter_monthly: process.env.PLAN_CODE_HUNTER_MONTHLY ?? "",
  Hunter_annual: process.env.PLAN_CODE_HUNTER_ANNUAL ?? "",
  Pro_monthly: process.env.PLAN_CODE_PRO_MONTHLY ?? "",
  Pro_annual: process.env.PLAN_CODE_PRO_ANNUAL ?? "",
};

export async function GET() {
  return NextResponse.json({ plans: PLAN_CODE_MAP });
}

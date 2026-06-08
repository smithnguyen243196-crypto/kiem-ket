// api/sync.js — Đồng bộ "phiên nháp" giữa các thiết bị qua Upstash Redis
// GET  /api/sync   → trả về phiên nháp đang lưu trên đám mây
// POST /api/sync   → lưu phiên nháp (body JSON) lên đám mây
//
// Hỗ trợ cả 2 kiểu tên biến môi trường:
//   - Vercel Marketplace (Upstash): KV_REST_API_URL, KV_REST_API_TOKEN
//   - Upstash trực tiếp:            UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { Redis } from "@upstash/redis";

const KEY = "kiemket:draft"; // một người dùng → một phiên nháp dùng chung

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const draft = await redis.get(KEY); // SDK tự parse JSON
      return res.status(200).json({ ok: true, draft: draft || null });
    }

    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const draft = {
        bills: b.bills || {},
        slips: Array.isArray(b.slips) ? b.slips : [],
        reported: b.reported ?? "",
        startDate: b.startDate || "",
        countDate: b.countDate || "",
        updatedAt: Date.now(),
      };
      await redis.set(KEY, draft);
      return res.status(200).json({ ok: true, updatedAt: draft.updatedAt });
    }

    return res.status(405).json({ error: "Chỉ chấp nhận GET hoặc POST" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Lỗi không xác định" });
  }
}

// api/save-ket.js — Vercel Serverless Function
// Giữ NOTION_TOKEN ở server, gọi Notion API thay cho frontend.
// Frontend gọi: POST /api/save-ket  với JSON body các giá trị đã tính sẵn.

const DATA_SOURCE_ID = "be2b23f2-58ab-44d0-bfa0-424d4d1ed9a2"; // data source của database "Kiểm Két"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Chỉ chấp nhận POST" });
  }

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "Server thiếu biến môi trường NOTION_TOKEN" });
  }

  try {
    // Vercel tự parse JSON; nếu không, parse thủ công.
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const text = (v) => String(v ?? "").slice(0, 1900); // rich_text tối đa 2000 ký tự/khối

    const properties = {
      "Tên": { title: [{ text: { content: `Kiểm két ${b.countDateVN || ""}`.trim() } }] },
      "Tổng tiền trong két": { number: num(b.tongKet) },
      "Tổng thu chi": { number: num(b.netThuChi) },
      "Két và thu chi": { number: num(b.ketVaThuChi) },
      "Tiền báo cáo": { number: num(b.reported) },
      "Kết quả": { number: num(b.ketQua) },
      "Danh sách chi": { rich_text: [{ text: { content: text(b.danhSachChi) } }] },
    };
    if (b.countDate) properties["Ngày tính két"] = { date: { start: b.countDate } };
    if (b.startDate) properties["Ngày bắt đầu"] = { date: { start: b.startDate } };
    if (b.trangThai) properties["Trạng thái"] = { select: { name: b.trangThai } };

    const r = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2025-09-03",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { type: "data_source_id", data_source_id: DATA_SOURCE_ID },
        properties,
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: data.message || "Notion báo lỗi", detail: data });
    }
    return res.status(200).json({ ok: true, url: data.url });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Lỗi không xác định" });
  }
}

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Wallet, Receipt, ClipboardCheck, Plus, Trash2, Save, ExternalLink, RotateCcw, ArrowUpCircle, ArrowDownCircle, RefreshCw, Cloud, CloudOff } from "lucide-react";

// ====== Cấu hình ======
const NOTION_DB_URL = "https://app.notion.com/p/ccbd8855e4b941caa4e3d733ccd18978";
const TIEN_KET_BO_SUNG = 1000000;
const DENOMS = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000];
const STORAGE_KEY = "kiemket:state:v1";

// ====== Bảng màu ======
const C = {
  paper: "#F4F1EA", card: "#FFFFFF", ink: "#1E2A24", inkSoft: "#5B6B62", line: "#E1DCD0",
  emerald: "#0F6E54", emeraldSoft: "#E5F0EB", amber: "#B7791F", amberSoft: "#FBF1DC",
  red: "#B4322A", redSoft: "#F8E5E2", green: "#1B7A3E", greenSoft: "#E3F2E7",
  blue: "#1E5FA8", blueSoft: "#E3ECF7",
};

// ====== Helpers ======
const fmt = (n) => new Intl.NumberFormat("vi-VN").format(Math.round(n || 0));
const onlyDigits = (s) => (s || "").replace(/[^\d]/g, "");
const todayISO = () => new Date().toLocaleDateString("en-CA");
const fmtDateVN = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const emptyBills = () => Object.fromEntries(DENOMS.map((d) => [d, ""]));
// Chuẩn hoá để so sánh chữ ký phiên (không tính updatedAt)
const snapOf = (s) =>
  JSON.stringify({
    bills: { ...emptyBills(), ...(s.bills || {}) },
    slips: s.slips || [],
    reported: s.reported ?? "",
    startDate: s.startDate || "",
    countDate: s.countDate || "",
  });

export default function App() {
  const [tab, setTab] = useState("ket");
  const [bills, setBills] = useState(emptyBills);
  const [slips, setSlips] = useState([]);
  const [reported, setReported] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [countDate, setCountDate] = useState(todayISO());
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState({ status: "idle", msg: "" });
  const [syncStatus, setSyncStatus] = useState("idle"); // idle|syncing|synced|offline|error

  const localUpdatedAt = useRef(0);
  const lastSnapshot = useRef(snapOf({}));
  const pushTimer = useRef(null);

  // Áp dụng một phiên nháp vào state
  const applyDraft = useCallback((s) => {
    setBills({ ...emptyBills(), ...(s.bills || {}) });
    setSlips(Array.isArray(s.slips) ? s.slips : []);
    setReported(s.reported ?? "");
    setStartDate(s.startDate || todayISO());
    setCountDate(s.countDate || todayISO());
    localUpdatedAt.current = s.updatedAt || Date.now();
  }, []);

  // Kéo dữ liệu mới nhất từ đám mây
  const pullFromCloud = useCallback(async ({ silent } = {}) => {
    if (!silent) setSyncStatus("syncing");
    try {
      const res = await fetch("/api/sync");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.draft) {
        const remote = data.draft;
        if ((remote.updatedAt || 0) > localUpdatedAt.current) {
          applyDraft(remote);
          lastSnapshot.current = snapOf(remote);
        }
      }
      setSyncStatus("synced");
    } catch (e) {
      setSyncStatus("offline");
    }
  }, [applyDraft]);

  // Đẩy phiên nháp lên đám mây
  const pushToCloud = useCallback(async (draft, snap) => {
    setSyncStatus("syncing");
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        lastSnapshot.current = snap;
        localUpdatedAt.current = data.updatedAt || Date.now();
        setSyncStatus("synced");
      } else {
        setSyncStatus("error");
      }
    } catch (e) {
      setSyncStatus("offline");
    }
  }, []);

  // Mở app: nạp local trước (tức thì) rồi kéo bản đám mây
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        applyDraft(s);
        lastSnapshot.current = snapOf(s);
        localUpdatedAt.current = s.updatedAt || 0;
      }
    } catch (e) { /* chưa có */ }
    setLoaded(true);
    pullFromCloud({ silent: true });
  }, [applyDraft, pullFromCloud]);

  // Quay lại app trên thiết bị khác → tự kéo bản mới nhất
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) pullFromCloud({ silent: true }); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pullFromCloud]);

  // Mỗi khi state đổi: lưu local ngay + đẩy đám mây (debounce 1.2s)
  useEffect(() => {
    if (!loaded) return;
    const draft = { bills, slips, reported, startDate, countDate };
    const snap = snapOf(draft);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, updatedAt: Date.now() }));
    } catch (e) { /* bỏ qua */ }
    if (snap === lastSnapshot.current) return; // không có thay đổi thực sự
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => pushToCloud(draft, snap), 1200);
    return () => clearTimeout(pushTimer.current);
  }, [bills, slips, reported, startDate, countDate, loaded, pushToCloud]);

  // ====== Tính toán ======
  const tongKet = useMemo(
    () => DENOMS.reduce((sum, d) => sum + d * (parseInt(onlyDigits(String(bills[d])) || "0", 10) || 0), 0),
    [bills]
  );
  const tongThu = useMemo(() => slips.filter((s) => s.type === "thu").reduce((a, s) => a + (s.amount || 0), 0), [slips]);
  const tongChi = useMemo(() => slips.filter((s) => s.type === "chi").reduce((a, s) => a + (s.amount || 0), 0), [slips]);
  const netThuChi = tongThu - tongChi;
  const ketVaThuChi = tongKet + netThuChi;
  const reportedNum = parseInt(onlyDigits(String(reported)) || "0", 10) || 0;
  const ketQua = ketVaThuChi - reportedNum - TIEN_KET_BO_SUNG;
  const trangThai = ketQua === 0 ? "Khớp" : ketQua > 0 ? "Thừa" : "Thiếu";

  // ====== Hành động ======
  const setBill = (d, v) => setBills((p) => ({ ...p, [d]: onlyDigits(v) }));
  const addSlip = (type) => setSlips((p) => [...p, { id: Date.now() + Math.random(), type, amount: 0, reason: "" }]);
  const updSlip = (id, patch) => setSlips((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const delSlip = (id) => setSlips((p) => p.filter((s) => s.id !== id));

  const resetAll = () => {
    if (!window.confirm("Bắt đầu phiên kiểm két mới? Toàn bộ số liệu hiện tại (trên mọi thiết bị) sẽ bị xoá.")) return;
    setBills(emptyBills()); setSlips([]); setReported(""); setStartDate(todayISO()); setCountDate(todayISO());
    setSaveState({ status: "idle", msg: "" });
  };

  const danhSachChiText = useMemo(() => {
    if (slips.length === 0) return "(Không có phiếu thu/chi)";
    return slips
      .map((s) => `${s.type === "thu" ? "+" : "−"} ${fmt(s.amount)}đ — ${s.reason?.trim() || "(không ghi lý do)"}`)
      .join("\n");
  }, [slips]);

  const saveToNotion = useCallback(async () => {
    setSaveState({ status: "saving", msg: "Đang lưu vào Notion…" });
    try {
      const res = await fetch("/api/save-ket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countDate, startDate, countDateVN: fmtDateVN(countDate),
          tongKet, netThuChi, ketVaThuChi,
          reported: reportedNum, ketQua, trangThai, danhSachChi: danhSachChiText,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) setSaveState({ status: "ok", msg: "Đã lưu vào Notion thành công." });
      else setSaveState({ status: "error", msg: data.error || "Lưu thất bại." });
    } catch (e) {
      setSaveState({ status: "error", msg: "Lỗi kết nối: " + (e?.message || "không rõ") });
    }
  }, [countDate, startDate, tongKet, netThuChi, ketVaThuChi, reportedNum, ketQua, trangThai, danhSachChiText]);

  // ====== UI con ======
  const TabBtn = ({ id, icon: Icon, label }) => {
    const active = tab === id;
    return (
      <button onClick={() => setTab(id)}
        className="flex-1 flex items-center justify-center gap-2 py-3 px-2 text-sm font-semibold transition-all"
        style={{ color: active ? C.emerald : C.inkSoft, borderBottom: `3px solid ${active ? C.emerald : "transparent"}`, background: active ? C.emeraldSoft : "transparent" }}>
        <Icon size={18} /><span className="hidden sm:inline">{label}</span>
      </button>
    );
  };

  const statusColors = { Khớp: { fg: C.green, bg: C.greenSoft }, Thừa: { fg: C.blue, bg: C.blueSoft }, Thiếu: { fg: C.red, bg: C.redSoft } };

  const syncMeta = {
    idle:    { label: "Đồng bộ", color: C.inkSoft, Icon: Cloud, spin: false },
    syncing: { label: "Đang đồng bộ…", color: C.amber, Icon: RefreshCw, spin: true },
    synced:  { label: "Đã đồng bộ", color: C.green, Icon: Cloud, spin: false },
    offline: { label: "Ngoại tuyến", color: C.inkSoft, Icon: CloudOff, spin: false },
    error:   { label: "Lỗi đồng bộ", color: C.red, Icon: CloudOff, spin: false },
  }[syncStatus];

  return (
    <div style={{ background: C.paper, minHeight: "100vh", color: C.ink }} className="w-full">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between mb-1 gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: C.ink }}>Phần mềm Kiểm Két</h1>
            <p className="text-sm" style={{ color: C.inkSoft }}>Đếm tiền · Thu chi · Đối chiếu báo cáo</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <button onClick={() => pullFromCloud()} title="Bấm để đồng bộ ngay"
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ color: syncMeta.color, border: `1px solid ${C.line}`, background: C.card }}>
              <syncMeta.Icon size={14} style={syncMeta.spin ? { animation: "spin 1s linear infinite" } : undefined} />
              {syncMeta.label}
            </button>
            <button onClick={resetAll} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ color: C.inkSoft, border: `1px solid ${C.line}`, background: C.card }}>
              <RotateCcw size={14} /> Phiên mới
            </button>
          </div>
        </div>

        <div className="flex rounded-xl overflow-hidden mt-4 mb-5" style={{ border: `1px solid ${C.line}`, background: C.card }}>
          <TabBtn id="ket" icon={Wallet} label="Đếm két" />
          <TabBtn id="thuchi" icon={Receipt} label="Thu chi" />
          <TabBtn id="ketqua" icon={ClipboardCheck} label="Kết quả" />
        </div>

        {tab === "ket" && (
          <Card>
            <SectionTitle>Đếm tiền trong két</SectionTitle>
            <div className="space-y-2">
              {DENOMS.map((d) => {
                const count = parseInt(onlyDigits(String(bills[d])) || "0", 10) || 0;
                const sub = d * count;
                return (
                  <div key={d} className="flex items-center gap-3 py-2" style={{ borderBottom: `1px solid ${C.line}` }}>
                    <div className="w-24 text-right font-bold tabular-nums shrink-0" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmt(d)}đ</div>
                    <span style={{ color: C.inkSoft }}>×</span>
                    <input inputMode="numeric" value={bills[d]} onChange={(e) => setBill(d, e.target.value)} placeholder="0"
                      className="w-20 text-center rounded-lg py-1.5 font-semibold outline-none" style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink }} />
                    <span style={{ color: C.inkSoft }}>=</span>
                    <div className="flex-1 text-right font-semibold tabular-nums" style={{ color: sub ? C.emerald : C.inkSoft, fontVariantNumeric: "tabular-nums" }}>{fmt(sub)}đ</div>
                  </div>
                );
              })}
            </div>
            <TotalBar label="Tổng tiền trong két" value={tongKet} color={C.emerald} bg={C.emeraldSoft} />
          </Card>
        )}

        {tab === "thuchi" && (
          <Card>
            <SectionTitle noMargin>Thu chi hằng ngày</SectionTitle>
            <div className="flex gap-2 my-4">
              <button onClick={() => addSlip("thu")} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm" style={{ background: C.greenSoft, color: C.green }}><Plus size={16} /> Phiếu thu (+)</button>
              <button onClick={() => addSlip("chi")} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm" style={{ background: C.redSoft, color: C.red }}><Plus size={16} /> Phiếu chi (−)</button>
            </div>
            {slips.length === 0 && <p className="text-center py-8 text-sm" style={{ color: C.inkSoft }}>Chưa có phiếu nào. Thêm phiếu thu hoặc chi ở trên.</p>}
            <div className="space-y-2">
              {slips.map((s) => {
                const isThu = s.type === "thu";
                return (
                  <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: isThu ? C.greenSoft : C.redSoft }}>
                    {isThu ? <ArrowUpCircle size={20} style={{ color: C.green }} className="shrink-0" /> : <ArrowDownCircle size={20} style={{ color: C.red }} className="shrink-0" />}
                    <input inputMode="numeric" value={s.amount ? fmt(s.amount) : ""} onChange={(e) => updSlip(s.id, { amount: parseInt(onlyDigits(e.target.value) || "0", 10) || 0 })} placeholder="Số tiền"
                      className="w-28 rounded-md px-2 py-1.5 font-semibold tabular-nums outline-none" style={{ border: `1px solid ${C.line}`, background: C.card, color: isThu ? C.green : C.red }} />
                    <input value={s.reason} onChange={(e) => updSlip(s.id, { reason: e.target.value })} placeholder={isThu ? "Lý do thu" : "Lý do chi"}
                      className="flex-1 rounded-md px-2 py-1.5 text-sm outline-none" style={{ border: `1px solid ${C.line}`, background: C.card, color: C.ink }} />
                    <button onClick={() => delSlip(s.id)} className="p-1.5 shrink-0" style={{ color: C.inkSoft }}><Trash2 size={16} /></button>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <MiniStat label="Tổng thu" value={tongThu} color={C.green} />
              <MiniStat label="Tổng chi" value={tongChi} color={C.red} />
            </div>
            <TotalBar label="Tổng thu chi (thu − chi)" value={netThuChi} color={netThuChi >= 0 ? C.green : C.red} bg={netThuChi >= 0 ? C.greenSoft : C.redSoft} signed />
          </Card>
        )}

        {tab === "ketqua" && (
          <Card>
            <SectionTitle>Đối chiếu kết quả két</SectionTitle>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <DateField label="Ngày bắt đầu" value={startDate} onChange={setStartDate} />
              <DateField label="Ngày tính két" value={countDate} onChange={setCountDate} />
            </div>
            <Row label="Tổng tiền trong két" value={tongKet} />
            <Row label="Tổng thu chi" value={netThuChi} signed />
            <Row label="Két và thu chi" value={ketVaThuChi} strong color={C.emerald} />
            <div className="mt-4 mb-1 text-sm font-semibold" style={{ color: C.inkSoft }}>Tiền báo cáo trên máy</div>
            <input inputMode="numeric" value={reported ? fmt(reportedNum) : ""} onChange={(e) => setReported(onlyDigits(e.target.value))} placeholder="Nhập số tiền báo cáo"
              className="w-full rounded-lg px-3 py-2.5 font-bold text-lg tabular-nums outline-none" style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink }} />
            <div className="mt-3 px-3 py-2 rounded-lg text-xs flex items-center justify-between" style={{ background: C.amberSoft, color: C.amber }}>
              <span>Trừ tiền két bổ sung mỗi lần tính</span>
              <span className="font-bold tabular-nums">− {fmt(TIEN_KET_BO_SUNG)}đ</span>
            </div>
            <div className="mt-4 rounded-xl p-5 text-center" style={{ background: statusColors[trangThai].bg }}>
              <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: statusColors[trangThai].fg }}>{trangThai === "Khớp" ? "Két khớp ✓" : trangThai === "Thừa" ? "Két thừa" : "Két thiếu"}</div>
              <div className="text-3xl font-bold tabular-nums" style={{ color: statusColors[trangThai].fg }}>{ketQua > 0 ? "+" : ""}{fmt(ketQua)}đ</div>
              <div className="text-xs mt-2" style={{ color: C.inkSoft }}>Két và thu chi − Tiền báo cáo − {fmt(TIEN_KET_BO_SUNG)}đ</div>
            </div>
            <button onClick={saveToNotion} disabled={saveState.status === "saving"} className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition-opacity" style={{ background: C.emerald, opacity: saveState.status === "saving" ? 0.6 : 1 }}>
              <Save size={18} />{saveState.status === "saving" ? "Đang lưu…" : "Lưu vào Notion"}
            </button>
            {saveState.status !== "idle" && (
              <div className="mt-3 px-3 py-2.5 rounded-lg text-sm font-medium" style={{ background: saveState.status === "ok" ? C.greenSoft : saveState.status === "error" ? C.redSoft : C.emeraldSoft, color: saveState.status === "ok" ? C.green : saveState.status === "error" ? C.red : C.emerald }}>
                {saveState.msg}
              </div>
            )}
            <a href={NOTION_DB_URL} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold" style={{ color: C.inkSoft }}><ExternalLink size={13} /> Mở database "Kiểm Két" trên Notion</a>
          </Card>
        )}
        <p className="text-center text-xs mt-5" style={{ color: C.inkSoft }}>Tự đồng bộ giữa các thiết bị · Sao lưu lịch sử trên Notion</p>
      </div>
    </div>
  );

  function Card({ children }) { return <div className="rounded-2xl p-4 sm:p-5" style={{ background: C.card, border: `1px solid ${C.line}` }}>{children}</div>; }
  function SectionTitle({ children, noMargin }) { return <h2 className={`text-base font-bold ${noMargin ? "" : "mb-3"}`} style={{ color: C.ink }}>{children}</h2>; }
  function TotalBar({ label, value, color, bg, signed }) {
    return (<div className="mt-4 flex items-center justify-between rounded-xl px-4 py-3" style={{ background: bg }}><span className="font-semibold text-sm" style={{ color: C.ink }}>{label}</span><span className="text-xl font-bold tabular-nums" style={{ color }}>{signed && value > 0 ? "+" : ""}{fmt(value)}đ</span></div>);
  }
  function MiniStat({ label, value, color }) {
    return (<div className="rounded-xl px-3 py-2.5" style={{ border: `1px solid ${C.line}` }}><div className="text-xs" style={{ color: C.inkSoft }}>{label}</div><div className="text-lg font-bold tabular-nums" style={{ color }}>{fmt(value)}đ</div></div>);
  }
  function Row({ label, value, strong, color, signed }) {
    return (<div className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${C.line}` }}><span className={strong ? "font-bold" : "text-sm"} style={{ color: strong ? C.ink : C.inkSoft }}>{label}</span><span className={`tabular-nums ${strong ? "text-lg font-bold" : "font-semibold"}`} style={{ color: color || C.ink }}>{signed && value > 0 ? "+" : ""}{fmt(value)}đ</span></div>);
  }
  function DateField({ label, value, onChange }) {
    return (<div><div className="text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>{label}</div><input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink }} /></div>);
  }
}

import { Type } from "/app/node_modules/@sinclair/typebox/build/cjs/index.js";

const BASE_URL = "https://biglot-media-plan.vercel.app";

async function apiCall(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const resp = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await resp.json();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export default function (api) {
  // ── Add Content Idea ──────────────────────────────
  api.registerTool({
    name: "biglot_add_idea",
    description:
      "เพิ่ม content idea ใหม่ลง BigLot Media Plan ถ้าใส่ URL จะ auto-enrich metadata (title, thumbnail, metrics) จาก platform ให้อัตโนมัติ รองรับ YouTube, Facebook, Instagram, TikTok",
    parameters: Type.Object({
      url: Type.Optional(Type.String({ description: "URL ของ content" })),
      platform: Type.Optional(
        Type.String({
          enum: ["youtube", "facebook", "instagram", "tiktok"],
          default: "youtube",
        })
      ),
      content_type: Type.Optional(
        Type.String({ enum: ["video", "post", "image"], default: "video" })
      ),
      title: Type.Optional(Type.String()),
      notes: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      return apiCall("/api/openclaw/ideas", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
  });

  // ── List Content Ideas ────────────────────────────
  api.registerTool({
    name: "biglot_list_ideas",
    description:
      "ดูรายการ content ideas ทั้งหมดจาก BigLot Media Plan สามารถ filter ตาม status และ platform ได้",
    parameters: Type.Object({
      status: Type.Optional(Type.String({ description: "filter: new, reviewed, approved, rejected" })),
      platform: Type.Optional(Type.String({ enum: ["youtube", "facebook", "instagram", "tiktok"] })),
      limit: Type.Optional(Type.Number({ default: 10 })),
    }),
    async execute(_id, params) {
      const qs = new URLSearchParams();
      if (params.status) qs.set("status", params.status);
      if (params.platform) qs.set("platform", params.platform);
      if (params.limit) qs.set("limit", String(params.limit));
      const query = qs.toString() ? `?${qs}` : "";
      return apiCall(`/api/openclaw/ideas${query}`);
    },
  });

  // ── Get Single Idea ───────────────────────────────
  api.registerTool({
    name: "biglot_get_idea",
    description: "ดูรายละเอียด content idea เดี่ยวจาก ID",
    parameters: Type.Object({
      idea_id: Type.String({ description: "UUID ของ idea" }),
    }),
    async execute(_id, params) {
      return apiCall(`/api/openclaw/ideas/${params.idea_id}`);
    },
  });

  // ── Update Idea ───────────────────────────────────
  api.registerTool({
    name: "biglot_update_idea",
    description: "แก้ไข content idea (title, notes, status, description)",
    parameters: Type.Object({
      idea_id: Type.String(),
      title: Type.Optional(Type.String()),
      notes: Type.Optional(Type.String()),
      status: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      const { idea_id, ...body } = params;
      return apiCall(`/api/openclaw/ideas/${idea_id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
  });

  // ── Delete Idea ───────────────────────────────────
  api.registerTool({
    name: "biglot_delete_idea",
    description: "ลบ content idea ออกจาก backlog",
    parameters: Type.Object({
      idea_id: Type.String(),
    }),
    async execute(_id, params) {
      await fetch(`${BASE_URL}/api/openclaw/ideas/${params.idea_id}`, {
        method: "DELETE",
      });
      return { content: [{ type: "text", text: "ลบเรียบร้อยแล้ว" }] };
    },
  });

  // ── Get Schedule ──────────────────────────────────
  api.registerTool({
    name: "biglot_get_schedule",
    description:
      "ดูตาราง production schedule ใช้ range=today สำหรับวันนี้ หรือ range=week สำหรับ 7 วันข้างหน้า",
    parameters: Type.Object({
      range: Type.Optional(
        Type.String({ enum: ["today", "week"], default: "today" })
      ),
    }),
    async execute(_id, params) {
      const range = params.range ?? "today";
      return apiCall(`/api/openclaw/schedule?range=${range}`);
    },
  });

  // ── Schedule Shoot ────────────────────────────────
  api.registerTool({
    name: "biglot_schedule_shoot",
    description: "จัดตาราง shoot สำหรับ content idea",
    parameters: Type.Object({
      backlog_id: Type.String({ description: "UUID ของ idea" }),
      shoot_date: Type.String({ description: "วันถ่าย YYYY-MM-DD" }),
      notes: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      return apiCall("/api/openclaw/schedule", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
  });

  // ── Update Production Status ──────────────────────
  api.registerTool({
    name: "biglot_update_status",
    description:
      "อัพเดทสถานะ production: planned → scripting → shooting → editing → published",
    parameters: Type.Object({
      schedule_id: Type.String(),
      status: Type.String({
        enum: ["planned", "scripting", "shooting", "editing", "published"],
      }),
    }),
    async execute(_id, params) {
      return apiCall(`/api/openclaw/schedule/${params.schedule_id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: params.status }),
      });
    },
  });

  // ── Daily Summary ─────────────────────────────────
  api.registerTool({
    name: "biglot_daily_summary",
    description:
      "สรุปรายวัน: idea ใหม่, ตาราง shoot วันนี้, งานที่กำลังดำเนินการ",
    parameters: Type.Object({}),
    async execute() {
      return apiCall("/api/openclaw/daily-summary");
    },
  });

  // ── Get Assignments ───────────────────────────────
  api.registerTool({
    name: "biglot_get_assignments",
    description: "ดูว่าใครในทีม (โฟน, ฟิวส์, อิก, ต้า) ได้รับมอบหมายงานอะไรใน shoot นั้น",
    parameters: Type.Object({
      schedule_id: Type.String({ description: "UUID ของ production calendar" }),
    }),
    async execute(_id, params) {
      return apiCall(`/api/openclaw/schedule/${params.schedule_id}/assignments`);
    },
  });

  // ── Set Assignments ───────────────────────────────
  api.registerTool({
    name: "biglot_set_assignments",
    description: "มอบหมายหน้าที่ให้ทีมสำหรับ shoot — สมาชิก: โฟน, ฟิวส์, อิก, ต้า",
    parameters: Type.Object({
      schedule_id: Type.String(),
      assignments: Type.Array(
        Type.Object({
          member_name: Type.String({ description: "ชื่อสมาชิก: โฟน, ฟิวส์, อิก, หรือ ต้า" }),
          role_detail: Type.String({ description: "รายละเอียดหน้าที่" }),
        })
      ),
    }),
    async execute(_id, params) {
      return apiCall(`/api/openclaw/schedule/${params.schedule_id}/assignments`, {
        method: "PUT",
        body: JSON.stringify({ assignments: params.assignments }),
      });
    },
  });

  // ── List Produced Videos ──────────────────────────
  api.registerTool({
    name: "biglot_list_produced_videos",
    description: "ดู video ที่ publish แล้วพร้อม metrics (views, likes, comments, shares, saves) กรองตาม platform ได้",
    parameters: Type.Object({
      platform: Type.Optional(Type.String({ enum: ["youtube", "facebook", "instagram", "tiktok"] })),
    }),
    async execute(_id, params) {
      const qs = params.platform ? `?platform=${params.platform}` : "";
      return apiCall(`/api/openclaw/produced-videos${qs}`);
    },
  });

  // ── Add Produced Video ────────────────────────────
  api.registerTool({
    name: "biglot_add_produced_video",
    description: "บันทึก video ที่ publish แล้วพร้อม URL และ metrics",
    parameters: Type.Object({
      calendar_id: Type.String({ description: "UUID ของ production calendar" }),
      url: Type.String({ description: "URL ของ video ที่ publish" }),
      platform: Type.String({ enum: ["youtube", "facebook", "instagram", "tiktok"] }),
      title: Type.Optional(Type.String()),
      view_count: Type.Optional(Type.Number()),
      like_count: Type.Optional(Type.Number()),
      comment_count: Type.Optional(Type.Number()),
      share_count: Type.Optional(Type.Number()),
      save_count: Type.Optional(Type.Number()),
      notes: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      return apiCall("/api/openclaw/produced-videos", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
  });

  // ── List Monitoring Content ───────────────────────
  api.registerTool({
    name: "biglot_list_monitoring",
    description: "ดู content ที่ทีม monitor อยู่ (competitor, reference content) พร้อม metrics แต่ละ platform",
    parameters: Type.Object({}),
    async execute() {
      return apiCall("/api/openclaw/monitoring");
    },
  });

  // ── Add Monitoring Content ────────────────────────
  api.registerTool({
    name: "biglot_add_monitoring",
    description: "เพิ่ม content ที่ต้องการ monitor (competitor หรือ reference)",
    parameters: Type.Object({
      title: Type.String({ description: "ชื่อ content หรือ account ที่ monitor" }),
      description: Type.Optional(Type.String()),
      notes: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      return apiCall("/api/openclaw/monitoring", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
  });

  // ── Add Monitoring Platform ───────────────────────
  api.registerTool({
    name: "biglot_add_monitoring_platform",
    description: "เพิ่ม URL และ metrics ของ content ที่ monitor ในแต่ละ platform",
    parameters: Type.Object({
      content_id: Type.String({ description: "UUID ของ monitoring content" }),
      url: Type.String(),
      platform: Type.String({ enum: ["youtube", "facebook", "instagram", "tiktok"] }),
      title: Type.Optional(Type.String()),
      view_count: Type.Optional(Type.Number()),
      like_count: Type.Optional(Type.Number()),
      comment_count: Type.Optional(Type.Number()),
      share_count: Type.Optional(Type.Number()),
      save_count: Type.Optional(Type.Number()),
    }),
    async execute(_id, params) {
      return apiCall(`/api/openclaw/monitoring/${params.content_id}/platforms`, {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
  });
}

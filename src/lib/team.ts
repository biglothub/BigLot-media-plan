// แก้ไขชื่อสมาชิกที่นี่ที่เดียว — ไม่ต้องแตะโค้ดที่อื่น
export const TEAM_MEMBERS = ['โฟน', 'ฟิวส์', 'อิก', 'ต้า'] as const;
export type TeamMember = (typeof TEAM_MEMBERS)[number];

import { STORAGE } from '../constants/storage.js';
import { WH_ROLES } from '../constants/warehouseRoles.js';

export function getWhStaffReq(g) {
  const totalReq = g.storage.reduce((a, s) => a + (STORAGE[s.type]?.staff || 0), 0);
  if (totalReq === 0) return [];
  const reqs = [];
  if (totalReq >= 1) reqs.push({ role: "loader", need: Math.ceil(totalReq * .3) || 1 });
  if (totalReq >= 2) reqs.push({ role: "forklift", need: Math.ceil(totalReq * .2) || 1 });
  if (totalReq >= 3) { reqs.push({ role: "receiving", need: 1 }); reqs.push({ role: "shipping", need: 1 }); }
  if (totalReq >= 5) reqs.push({ role: "whMgr", need: 1 });
  if (totalReq >= 6) reqs.push({ role: "inventory", need: 1 });
  if (totalReq >= 8) { reqs.push({ role: "dockSup", need: 1 }); reqs.push({ role: "logistics", need: 1 }); }
  return reqs;
}

export function getWhPayroll(g) {
  return Object.entries(g.whStaff || {}).reduce((a, [k, v]) => a + (WH_ROLES[k]?.pay || 0) * v, 0);
}

export function getWhShortage(g) {
  const reqs = getWhStaffReq(g);
  return reqs.reduce((a, r) => {
    const have = g.whStaff?.[r.role] || 0;
    return a + Math.max(0, r.need - have);
  }, 0);
}

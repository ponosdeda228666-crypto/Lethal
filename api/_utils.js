import crypto from 'crypto';
import fs from 'fs';

const USERS_FILE = '/tmp/users.json';
const PROMO_FILE = '/tmp/promocodes.json';
const SECRET = 'lethal-super-secret-2026';

export function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch { return {}; }
}

export function saveUsers(users) {
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); } catch {}
}

export function loadPromocodes() {
  try {
    if (!fs.existsSync(PROMO_FILE)) {
      fs.writeFileSync(PROMO_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    return JSON.parse(fs.readFileSync(PROMO_FILE, 'utf8'));
  } catch { return {}; }
}

export function savePromocodes(data) {
  try { fs.writeFileSync(PROMO_FILE, JSON.stringify(data, null, 2)); } catch {}
}

// ПРОСТОЙ ТОКЕН
export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Проверка токена - ищем пользователя с таким токеном
export function verifyToken(token) {
  try {
    if (!token) return null;
    const users = loadUsers();
    for (const [email, user] of Object.entries(users)) {
      if (user.token === token) {
        return email;
      }
    }
    return null;
  } catch { return null; }
}

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token, X-Requested-With');
}
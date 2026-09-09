import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const SECRET = 'lethal-super-secret-2026';
const USERS_FILE = '/tmp/users.json';

export function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

export function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {}
}

export function verifyToken(token) {
  try {
    if (!token) return null;
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const checkHash = crypto.createHash('sha256').update(`${decoded.email}|${decoded.time}` + SECRET).digest('hex');
    if (decoded.hash !== checkHash) return null;
    return decoded.email;
  } catch {
    return null;
  }
}

export function generateToken(email) {
  const data = `${email}|${Date.now()}`;
  const hash = crypto.createHash('sha256').update(data + SECRET).digest('hex');
  return Buffer.from(JSON.stringify({ email, hash, time: Date.now() })).toString('base64');
}

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token, X-Requested-With');
}
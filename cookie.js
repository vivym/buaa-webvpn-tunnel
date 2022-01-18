import os from 'os';
import fs from 'fs';
import path from 'path';

export function getCookie() {
  const homedir = os.homedir();
  const cookieDir = path.join(homedir, '.config');
  if (!fs.existsSync(cookieDir)) {
    fs.mkdirSync(cookieDir, { recursive: true });
  }
  const cookiePath = path.join(cookieDir, 'buaa_webvpn.cookie')

  if (!fs.existsSync(cookiePath)) {
    return null;
  } else {
    return fs.readFileSync(cookiePath).toString().trim();
  }
}

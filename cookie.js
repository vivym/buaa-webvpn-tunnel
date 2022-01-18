import os from 'os';
import fs from 'fs';
import path from 'path';
import prompt from 'prompt';

export async function getCookie() {
  const homedir = os.homedir();
  const cookieDir = path.join(homedir, '.config');
  if (!fs.existsSync(cookieDir)) {
    fs.mkdirSync(cookieDir, { recursive: true });
  }
  const cookiePath = path.join(cookieDir, 'buaa_webvpn.cookie')

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(cookiePath)) {
      prompt.start();
  
      prompt.get(['cookie'], (err, result) => {
        if (err) {
          reject(err);
        } else {
          fs.writeFileSync(cookiePath, result.cookie);
          resolve(result.cookie);
        }
      });
    } else {
      resolve(fs.readFileSync(cookiePath).toString().trim());
    }
  });
}

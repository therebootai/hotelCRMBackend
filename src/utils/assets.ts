import fs from 'fs';
import path from 'path';

export const getLogoBase64 = () => {
  try {
    const file = fs.readFileSync(path.join(__dirname, '../assets/icons.svg'));
    return `data:image/svg+xml;base64,${file.toString('base64')}`;
  } catch (e) {
    console.error("Error reading logo:", e);
    return '';
  }
};

export const getQrBase64 = () => {
  try {
    const file = fs.readFileSync(path.join(__dirname, '../assets/qr.png'));
    return `data:image/png;base64,${file.toString('base64')}`;
  } catch (e) {
    console.error("Error reading QR:", e);
    return '';
  }
};

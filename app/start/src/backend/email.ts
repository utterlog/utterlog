import nodemailer from 'nodemailer';
import { optionValue } from './db/options';

function fromAddress(from: string, name: string) {
  return name ? `${name} <${from}>` : from;
}

export async function sendConfiguredEmail(to: string, subject: string, html: string) {
  const provider = (await optionValue('email_provider', 'smtp')).trim() || 'smtp';
  const from = await optionValue('email_from', '');
  const fromName = await optionValue('email_from_name', '');
  if (!to || !from) throw new Error('收件人和发件人不能为空');

  if (provider === 'resend') {
    const apiKey = await optionValue('resend_api_key', '');
    if (!apiKey) throw new Error('Resend API Key 未配置');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: fromAddress(from, fromName), to: [to], subject, html }),
    });
    if (!res.ok) throw new Error(`Resend 返回 ${res.status}: ${await res.text()}`);
    return;
  }

  if (provider === 'sendflare') {
    const apiKey = await optionValue('sendflare_api_key', '');
    if (!apiKey) throw new Error('Sendflare API Key 未配置');
    const res = await fetch('https://api.sendflare.com/v1/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: fromAddress(from, fromName), to, subject, body: html }),
    });
    if (!res.ok) throw new Error(`Sendflare 返回 ${res.status}: ${await res.text()}`);
    return;
  }

  const host = await optionValue('smtp_host', '');
  const port = Number(await optionValue('smtp_port', '587')) || 587;
  const user = await optionValue('smtp_user', '');
  const pass = await optionValue('smtp_pass', '');
  const encryption = await optionValue('smtp_encryption', 'tls');
  if (!host) throw new Error('SMTP Host 未配置');
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: encryption === 'ssl' || port === 465,
    auth: user ? { user, pass } : undefined,
    requireTLS: encryption === 'tls' || port === 587,
  });
  await transporter.sendMail({
    from: fromAddress(from || user, fromName),
    to,
    subject,
    html,
  });
}

import nodemailer, { type Transporter } from 'nodemailer';
import { sharedConfig, type InvitationEmailJobData } from '@tasks-platform/shared';

let transporter: Transporter | undefined;
function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: sharedConfig.smtp.host,
    port: sharedConfig.smtp.port,
    secure: sharedConfig.smtp.secure,
    auth: sharedConfig.smtp.user ? { user: sharedConfig.smtp.user, pass: sharedConfig.smtp.password } : undefined,
  });
  return transporter;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function invitationText(data: InvitationEmailJobData): string {
  return [
    `${data.invitedByName} te invitó a unirte a "${data.organizationName}" en Tasks Platform como ${data.role}.`,
    '',
    `Aceptá la invitación: ${data.acceptUrl}`,
    '',
    'Si no esperabas este correo, podés ignorarlo.',
  ].join('\n');
}

function invitationHtml(data: InvitationEmailJobData): string {
  return [
    `<p>${escapeHtml(data.invitedByName)} te invitó a unirte a <strong>${escapeHtml(data.organizationName)}</strong> en Tasks Platform como <strong>${escapeHtml(data.role)}</strong>.</p>`,
    `<p><a href="${data.acceptUrl}">Aceptar invitación</a></p>`,
    '<p>Si no esperabas este correo, podés ignorarlo.</p>',
  ].join('\n');
}

/** Templates deliberately plain (no external templating dependency) -- one text, one HTML, both built from the same fields. */
export async function sendInvitationEmail(data: InvitationEmailJobData): Promise<void> {
  await getTransporter().sendMail({
    from: sharedConfig.smtp.from,
    to: data.to,
    subject: `Invitación a ${data.organizationName}`,
    text: invitationText(data),
    html: invitationHtml(data),
  });
}
